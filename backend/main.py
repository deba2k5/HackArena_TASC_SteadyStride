"""
TIA FastAPI backend — fully fixed for MongoDB Atlas (ObjectId serialization, all endpoints clean).
"""
import os, uuid
from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, UploadFile, File, Form, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn, json

from db import get_collection, use_mongo
import agent
import seed

app = FastAPI(title="Touchless Invoice Agent API")

app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# ── ObjectId / MongoDB sanitizer ──────────────────────────────────────────────
def _clean(obj):
    """Strip MongoDB _id and convert ObjectId to str recursively."""
    if isinstance(obj, list):
        return [_clean(x) for x in obj]
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if k == "_id":
                continue          # drop _id entirely
            out[k] = _clean(v)
        return out
    # Handle bson ObjectId if pymongo is in use
    type_name = type(obj).__name__
    if type_name == "ObjectId":
        return str(obj)
    if type_name == "Decimal128":
        return float(str(obj))
    return obj

def clean_response(data):
    """Return a clean JSONResponse to bypass FastAPI's encoder."""
    return JSONResponse(content=_clean(data))

# ── WebSocket manager ─────────────────────────────────────────────────────────
class WsManager:
    def __init__(self):
        self.connections: List[WebSocket] = []
    async def connect(self, ws: WebSocket):
        await ws.accept(); self.connections.append(ws)
    def disconnect(self, ws: WebSocket):
        if ws in self.connections: self.connections.remove(ws)
    async def broadcast(self, msg: dict):
        for ws in self.connections:
            try: await ws.send_text(json.dumps(_clean(msg)))
            except: pass

ws_mgr = WsManager()

@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws_mgr.connect(ws)
    try:
        while True: await ws.receive_text()
    except WebSocketDisconnect:
        ws_mgr.disconnect(ws)

async def notify(event: str, payload: dict):
    try: await ws_mgr.broadcast({"event": event, "payload": payload})
    except: pass

# ── Audit helper ──────────────────────────────────────────────────────────────
def log_audit(actor: str, action: str, target: str, meta: dict = None):
    entry = {"id": str(uuid.uuid4()), "actor": actor, "action": action,
             "target": target, "at": datetime.utcnow().isoformat(), "meta": meta or {}}
    try: get_collection("audit_logs").insert_one(entry)
    except: pass
    return entry

# ═════════════════════════════════════════════════════════════════════════════
# SYSTEM
# ═════════════════════════════════════════════════════════════════════════════
@app.get("/api/health")
def health():
    return {"status": "healthy", "database": "mongodb_atlas" if use_mongo else "json_fallback",
            "timestamp": datetime.utcnow().isoformat()}

@app.post("/api/seed")
def trigger_seed():
    if not seed.seed_db():
        raise HTTPException(500, "Seeding failed")
    return {"status": "ok", "message": "Database seeded."}

# ═════════════════════════════════════════════════════════════════════════════
# CUSTOMERS
# ═════════════════════════════════════════════════════════════════════════════
class CustomerConfig(BaseModel):
    client_code: str; client_name: str; city: str; industry: str
    contact_email: str; status: str; input_channels: List[str]
    dispatch_rule: str; validation_profile: dict

@app.get("/api/customers")
def get_customers():
    return clean_response(list(get_collection("customers").find()))

@app.post("/api/customers")
def upsert_customer(cust: CustomerConfig, x_user_email: Optional[str] = Header(None)):
    data = cust.dict()
    get_collection("customers").find_one_and_update(
        {"client_code": data["client_code"]}, {"$set": data}, upsert=True)
    log_audit(x_user_email or "system", "client_updated", data["client_code"])
    return clean_response(data)

# ═════════════════════════════════════════════════════════════════════════════
# EMPLOYEES
# ═════════════════════════════════════════════════════════════════════════════
@app.get("/api/employees")
def get_employees(client_code: Optional[str] = None, email: Optional[str] = None):
    q = {}
    if client_code: q["client_code"] = client_code
    if email:       q["email"] = email.lower()
    return clean_response(list(get_collection("employees").find(q)))

class LinkEmailReq(BaseModel):
    portal_email: str

@app.post("/api/employees/{emp_id}/link-email")
def link_email(emp_id: str, req: LinkEmailReq, x_user_email: Optional[str] = Header(None)):
    col = get_collection("employees")
    emp = col.find_one({"emp_id": emp_id, "is_demo_account": {"$ne": True}}) or \
          col.find_one({"emp_id": emp_id})
    if not emp:
        raise HTTPException(404, f"Employee {emp_id} not found")
    portal_email = req.portal_email.strip().lower()
    existing = col.find_one({"email": portal_email})
    if existing:
        if existing.get("emp_id") == emp_id:
            return clean_response({"status": "already_linked", "emp_id": emp_id})
        col.delete_many({"email": portal_email})
    alias = _clean(dict(emp))
    alias.update({"_id": str(uuid.uuid4()), "id": str(uuid.uuid4()),
                  "email": portal_email, "is_demo_account": True})
    col.insert_one(alias)
    log_audit(x_user_email or "admin", "employee_email_linked", emp_id, {"portal_email": portal_email})
    return clean_response({"status": "linked", "emp_id": emp_id,
                           "portal_email": portal_email, "name": emp.get("full_name")})

# ═════════════════════════════════════════════════════════════════════════════
# TIMESHEETS
# ═════════════════════════════════════════════════════════════════════════════

def _try_auto_process(ts: dict) -> dict:
    """
    If a timesheet is pending_review but confidence ≥ 90% with all employees matched
    and all records have valid working data, promote to processed + generate + dispatch invoice.
    """
    AUTO_DISPATCH_TH = float(os.getenv("AUTO_DISPATCH_THRESHOLD", 0.90))
    conf = float(ts.get("overall_confidence") or
                 ts.get("extracted_data", {}).get("overall_confidence") or 0.0)
    if ts.get("status") != "pending_review" or conf < AUTO_DISPATCH_TH:
        return ts

    records = ts.get("extracted_data", {}).get("records", [])
    if not records:
        return ts

    all_matched = all(r.get("match_status") == "matched" for r in records)
    if not all_matched:
        return ts

    # Require at least one record with usable hours/days
    has_data = any(
        (r.get("working_days") and int(r.get("working_days") or 0) > 0 and int(r.get("working_days") or 0) <= 31)
        or (r.get("total_hours") and float(r.get("total_hours") or 0) > 0)
        for r in records
    )
    if not has_data:
        return ts

    # Promote to processed
    col = get_collection("timesheets")
    updates = {
        "status":             "processed",
        "is_touchless":       True,
        "exceptions":         [],
        "overall_confidence": conf,
        "auto_processed_at":  datetime.utcnow().isoformat(),
    }
    col.update_one({"id": ts["id"]}, {"$set": updates})
    ts.update(updates)

    # Generate + dispatch invoice if not already done
    existing_inv = get_collection("invoices").find_one({"timesheet_id": ts["id"]})
    if not existing_inv:
        inv = _generate_invoice(ts, "auto_process")
        if inv and inv.get("total_amount", 0) > 0:
            _auto_dispatch(inv["id"], "auto_process")
    else:
        if existing_inv.get("dispatch_status") != "dispatched":
            _auto_dispatch(existing_inv["id"], "auto_process")

    log_audit("system", "timesheet_auto_promoted", ts["id"],
              {"confidence": conf, "reason": "confidence >= AUTO_DISPATCH_THRESHOLD"})
    return ts


@app.get("/api/timesheets")
def get_timesheets(client_code: Optional[str] = None):
    q    = {"client_code": client_code} if client_code else {}
    docs = list(get_collection("timesheets").find(q, sort=[("uploaded_at", -1)]))
    # Heal any stuck pending_review records that should have been auto-processed
    docs = [_try_auto_process(d) for d in docs]
    return clean_response(docs)


@app.post("/api/timesheets/process-pending")
async def process_pending_timesheets(x_user_email: Optional[str] = Header(None)):
    """Retroactively auto-process all pending_review timesheets with ≥90% confidence."""
    col   = get_collection("timesheets")
    stuck = list(col.find({"status": "pending_review"}))
    promoted = []
    for ts in stuck:
        updated = _try_auto_process(ts)
        if updated.get("status") == "processed":
            promoted.append(updated["id"])
    return clean_response({"promoted": len(promoted), "ids": promoted})

@app.post("/api/timesheets")
async def upload_timesheet(
    client_code: str = Form(...),
    pay_period: str = Form("June 2026"),
    input_type: str = Form("email"),
    text_content: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    x_user_email: Optional[str] = Header(None),
):
    file_bytes, file_name = None, None
    if file:
        file_bytes = await file.read()
        file_name  = file.filename

    extracted = agent.extract_timesheet(
        text_content=text_content, file_name=file_name,
        file_bytes=file_bytes, client_code=client_code)

    ts_id            = str(uuid.uuid4())
    overall_conf     = float(extracted.get("overall_confidence", 0.0))
    THRESHOLD        = float(os.getenv("CONFIDENCE_THRESHOLD", 0.70))
    AUTO_DISPATCH_TH = float(os.getenv("AUTO_DISPATCH_THRESHOLD", 0.90))
    has_exception    = False
    reasons: List[str] = []

    # ── Standard exception checks ─────────────────────────────────────────────
    all_matched = all(
        r.get("match_status") == "matched"
        for r in extracted.get("records", [])
    )
    for r in extracted.get("records", []):
        if r.get("match_status") in ("ambiguous", "unmatched"):
            has_exception = True
            reasons.append(r.get("warning") or f"Employee {r.get('match_status')}")

    cust = get_collection("customers").find_one({"client_code": client_code})

    # If confidence ≥ AUTO_DISPATCH_TH and all employees matched → always touchless
    if overall_conf >= AUTO_DISPATCH_TH and all_matched:
        has_exception = False
        reasons = []
    elif not has_exception and overall_conf < THRESHOLD:
        has_exception = True
        reasons.append(f"Confidence {overall_conf*100:.0f}% < threshold {int(THRESHOLD*100)}%.")

    status       = "pending_review" if has_exception else "processed"
    is_touchless = not has_exception

    doc = {
        "id": ts_id, "client_code": client_code,
        "client_name": cust["client_name"] if cust else client_code,
        "pay_period": pay_period, "input_type": input_type,
        "file_name": file_name, "status": status,
        "uploaded_at": datetime.utcnow().isoformat(),
        "uploaded_by": x_user_email or "portal",
        "extracted_data": extracted,
        "exceptions": reasons, "is_touchless": is_touchless,
        "overall_confidence": overall_conf,
    }
    get_collection("timesheets").insert_one(doc)
    log_audit(x_user_email or "portal", "timesheet_ingested", ts_id,
              {"client_code": client_code, "status": status,
               "confidence": overall_conf, "is_touchless": is_touchless})

    if is_touchless:
        inv = _generate_invoice(doc, x_user_email or "auto_bot")
        # ── Auto-dispatch if confidence ≥ 90% ─────────────────────────────────
        if inv and overall_conf >= AUTO_DISPATCH_TH:
            _auto_dispatch(inv["id"], x_user_email or "auto_dispatch")

    await notify("timesheet_updated", doc)
    return clean_response(doc)

# ── HITL endpoints ────────────────────────────────────────────────────────────
class HITLApprove(BaseModel):
    records: List[dict]

class HITLReject(BaseModel):
    comment: Optional[str] = ""

@app.post("/api/timesheets/{id}/reject")
async def reject_ts(id: str, payload: HITLReject, x_user_email: Optional[str] = Header(None)):
    col = get_collection("timesheets")
    ts  = col.find_one({"id": id})
    if not ts: raise HTTPException(404, "Timesheet not found")
    updates = {"status": "rejected", "admin_comment": payload.comment or "",
               "reviewed_by": x_user_email or "admin",
               "reviewed_at": datetime.utcnow().isoformat()}
    col.update_one({"id": id}, {"$set": updates})
    ts.update(updates)
    log_audit(x_user_email or "admin", "timesheet_rejected", id)
    await notify("timesheet_updated", ts)
    return clean_response(ts)

@app.post("/api/timesheets/{id}/approve")
async def approve_ts(id: str, payload: HITLApprove, x_user_email: Optional[str] = Header(None)):
    col  = get_collection("timesheets")
    ts   = col.find_one({"id": id})
    if not ts: raise HTTPException(404, "Timesheet not found")

    emp_col   = get_collection("employees")
    updated_r = []
    for r in payload.records:
        rec    = dict(r)
        emp_id = rec.get("matched_emp_id")
        if emp_id:
            emp = emp_col.find_one({"emp_id": emp_id})
            if emp:
                rec.update({"matched_name": emp["full_name"],
                            "client_code": emp["client_code"],
                            "client_name": emp["client_name"],
                            "match_status": "matched", "confidence": 1.0})
        updated_r.append(rec)

    ts["extracted_data"]["records"]           = updated_r
    ts["extracted_data"]["overall_confidence"] = 1.0
    ts["status"]     = "processed"
    ts["exceptions"] = []
    col.update_one({"id": id}, {"$set": ts})
    log_audit(x_user_email or "admin", "timesheet_hitl_approved", id)
    inv = _generate_invoice(ts, x_user_email or "admin")
    # Auto-dispatch after admin approval
    if inv:
        _auto_dispatch(inv["id"], x_user_email or "admin")
    await notify("timesheet_updated", ts)
    return clean_response(ts)

def _generate_invoice(ts: dict, actor: str) -> dict | None:
    """Generate and store invoice. Returns the validated invoice dict."""
    try:
        inv_doc   = agent.generate_invoice(ts)
        cust      = get_collection("customers").find_one({"client_code": ts["client_code"]})
        rules     = cust.get("validation_profile", {}) if cust else {}
        validated = agent.validate_invoice(inv_doc, rules)
        col       = get_collection("invoices")
        col.delete_many({"timesheet_id": ts["id"]})
        col.insert_one(validated)
        log_audit(actor, "invoice_generated", validated["id"],
                  {"client_code": validated["client_code"],
                   "validation_status": validated["validation_status"],
                   "total_amount": validated["total_amount"]})
        return validated
    except Exception as e:
        log_audit(actor, "invoice_generation_failed", ts.get("id","?"), {"error": str(e)})
        return None

def _auto_dispatch(invoice_id: str, actor: str):
    """Auto-approve and dispatch a single invoice. Used for ≥90% confidence path."""
    col = get_collection("invoices")
    inv = col.find_one({"id": invoice_id})
    if not inv:
        return
    # Force pass validation, then dispatch
    inv["validation_status"] = "passed"
    inv["validation_errors"] = []
    inv["dispatch_status"]   = "dispatched"
    inv["dispatched_at"]     = datetime.utcnow().isoformat()
    inv["auto_dispatched"]   = True
    col.update_one({"id": invoice_id}, {"$set": inv})
    log_audit(actor, "invoice_auto_dispatched", invoice_id,
              {"client_code": inv.get("client_code"),
               "total_amount": inv.get("total_amount"),
               "reason": "confidence >= AUTO_DISPATCH_THRESHOLD"})

# ═════════════════════════════════════════════════════════════════════════════
# INVOICES
# ═════════════════════════════════════════════════════════════════════════════
@app.get("/api/invoices")
def get_invoices(client_code: Optional[str] = None):
    q    = {"client_code": client_code} if client_code else {}
    docs = list(get_collection("invoices").find(q, sort=[("generated_at", -1)]))
    return clean_response(docs)

@app.post("/api/invoices/{id}/approve")
async def approve_invoice(id: str, x_user_email: Optional[str] = Header(None)):
    col = get_collection("invoices")
    inv = col.find_one({"id": id})
    if not inv: raise HTTPException(404, "Invoice not found")
    inv.update({"validation_status": "passed", "validation_errors": []})
    col.update_one({"id": id}, {"$set": inv})
    log_audit(x_user_email or "admin", "invoice_approved", id)
    await notify("invoice_updated", inv)
    return clean_response(inv)

@app.post("/api/invoices/dispatch")
async def dispatch_invoices(x_user_email: Optional[str] = Header(None)):
    inv_col   = get_collection("invoices")
    cust_col  = get_collection("customers")
    pending   = list(inv_col.find({"validation_status": "passed", "dispatch_status": "draft"}))
    dispatched = []
    for inv in pending:
        cust = cust_col.find_one({"client_code": inv["client_code"]})
        rule = (cust or {}).get("dispatch_rule", "spend_ascending")
        items = sorted(inv.get("line_items", []),
                       key=lambda x: x.get("net_pay", 0),
                       reverse=(rule == "spend_descending"))
        inv.update({"line_items": items, "dispatch_status": "dispatched",
                    "dispatched_at": datetime.utcnow().isoformat()})
        inv_col.update_one({"id": inv["id"]}, {"$set": inv})
        log_audit(x_user_email or "system", "invoice_dispatched", inv["id"])
        await notify("invoice_updated", inv)
        dispatched.append(inv)
    return clean_response({"status": "ok", "dispatched_count": len(dispatched), "invoices": dispatched})

# ═════════════════════════════════════════════════════════════════════════════
# QUERIES
# ═════════════════════════════════════════════════════════════════════════════
class QueryCreate(BaseModel):
    client_code: str; client_name: str; invoice_id: str; subject: str; message: str

class QueryResolve(BaseModel):
    reply: str

@app.get("/api/queries")
def get_queries(client_code: Optional[str] = None):
    q    = {"client_code": client_code} if client_code else {}
    docs = list(get_collection("queries").find(q, sort=[("created_at", -1)]))
    return clean_response(docs)

@app.post("/api/queries")
async def create_query(q: QueryCreate, x_user_email: Optional[str] = Header(None)):
    data = q.dict()
    data.update({"id": str(uuid.uuid4()), "status": "open",
                 "created_at": datetime.utcnow().isoformat(),
                 "created_by": x_user_email or "portal", "replies": []})
    get_collection("queries").insert_one(data)
    log_audit(x_user_email or "portal", "query_raised", data["id"])
    await notify("query_updated", data)
    return clean_response(data)

@app.post("/api/queries/{id}/resolve")
async def resolve_query(id: str, payload: QueryResolve, x_user_email: Optional[str] = Header(None)):
    col = get_collection("queries")
    q   = col.find_one({"id": id})
    if not q: raise HTTPException(404, "Query not found")
    q["status"] = "resolved"
    q.setdefault("replies", []).append(
        {"sender": x_user_email or "admin", "message": payload.reply,
         "at": datetime.utcnow().isoformat()})
    col.update_one({"id": id}, {"$set": q})
    log_audit(x_user_email or "admin", "query_resolved", id)
    await notify("query_updated", q)
    return clean_response(q)

# ═════════════════════════════════════════════════════════════════════════════
# CHAT
# ═════════════════════════════════════════════════════════════════════════════
class ChatReq(BaseModel):
    query: str; client_code: Optional[str] = None

@app.post("/api/chat")
def chat(req: ChatReq):
    return {"response": agent.chat_assistant(req.query, req.client_code)}

# ═════════════════════════════════════════════════════════════════════════════
# METRICS
# ═════════════════════════════════════════════════════════════════════════════
@app.get("/api/metrics")
def get_metrics():
    tss  = list(get_collection("timesheets").find({}, {"is_touchless": 1, "extracted_data.overall_confidence": 1}))
    invs = list(get_collection("invoices").find({}, {"total_amount": 1, "validation_status": 1}))
    n    = len(tss)
    tl   = sum(1 for t in tss if t.get("is_touchless"))
    conf = sum(float((t.get("extracted_data") or {}).get("overall_confidence") or 0) for t in tss)
    inv_total  = sum(float(i.get("total_amount") or 0) for i in invs)
    inv_passed = sum(1 for i in invs if i.get("validation_status") == "passed")
    proc_time  = sum(1.5 if t.get("is_touchless") else 18.0 for t in tss)
    return {
        "touchless_rate":          round(tl / n * 100, 1) if n else 0.0,
        "extraction_accuracy":     round(conf / n * 100, 1) if n else 100.0,
        "avg_processing_time_mins":round(proc_time / n, 1) if n else 0.0,
        "total_invoiced_amount":   round(inv_total, 2),
        "passed_validation_count": inv_passed,
        "total_invoices_count":    len(invs),
    }

# ═════════════════════════════════════════════════════════════════════════════
# AUDIT
# ═════════════════════════════════════════════════════════════════════════════
@app.get("/api/audit")
def get_audit(limit: int = 200):
    docs = list(get_collection("audit_logs").find(sort=[("at", -1)], limit=limit))
    return clean_response(docs)

@app.post("/api/audit")
def create_audit(data: dict):
    data.setdefault("id", str(uuid.uuid4()))
    data.setdefault("at", datetime.utcnow().isoformat())
    get_collection("audit_logs").insert_one(data)
    return clean_response(data)

# ═════════════════════════════════════════════════════════════════════════════
# LEGACY PROFILES & SESSIONS (backward-compat for EmployeeDashboard clock-in)
# ═════════════════════════════════════════════════════════════════════════════
@app.get("/api/profiles")
def list_profiles():
    emps = list(get_collection("employees").find({"is_demo_account": {"$ne": True}}))
    return clean_response([
        {"employeeId": e["emp_id"], "fullName": e["full_name"], "email": e["email"],
         "mobile": "", "department": e["department"], "employeeType": "permanent",
         "active": e.get("status") == "Active"}
        for e in emps
    ] or [])

@app.get("/api/profiles/{email}")
def get_profile(email: str):
    DEMO = {"employee@gmail.com": "EMP10001", "admin@gmail.com": None}
    emp_id = DEMO.get(email.lower())
    emp = None
    if emp_id:
        emp = get_collection("employees").find_one({"emp_id": emp_id, "is_demo_account": {"$ne": True}})
    if not emp:
        emp = get_collection("employees").find_one({"email": email.lower()})
    if emp:
        return {"employeeId": emp["emp_id"], "fullName": emp["full_name"],
                "email": email, "mobile": "", "department": emp["department"],
                "employeeType": "permanent", "active": emp.get("status") == "Active"}
    return {"employeeId": email.split("@")[0].upper(), "fullName": email.split("@")[0],
            "email": email, "mobile": "", "department": "—",
            "employeeType": "permanent", "active": True}

@app.post("/api/profiles")
def upsert_profile(data: dict):
    return clean_response(data)

@app.get("/api/sessions")
def list_sessions(email: Optional[str] = None, status: Optional[str] = None):
    q = {}
    if email:  q["email"]  = email
    if status: q["status"] = status
    docs = list(get_collection("sessions").find(q, sort=[("clockIn", -1)]))
    return clean_response(docs)

@app.post("/api/sessions")
def create_session(data: dict):
    data.setdefault("id", str(uuid.uuid4()))
    get_collection("sessions").insert_one(data)
    return clean_response(data)

@app.patch("/api/sessions/{id}")
def patch_session(id: str, patch: dict):
    col = get_collection("sessions")
    s   = col.find_one({"id": id})
    if not s: raise HTTPException(404, "Session not found")
    col.update_one({"id": id}, {"$set": patch})
    s.update(patch)
    return clean_response(s)

@app.get("/api/sessions/{id}")
def get_session(id: str):
    s = get_collection("sessions").find_one({"id": id})
    if not s: raise HTTPException(404, "Session not found")
    return clean_response(s)

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    uvicorn.run(app, host="0.0.0.0", port=port, reload=False)
