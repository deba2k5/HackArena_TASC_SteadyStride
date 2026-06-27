import os
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, Header, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import json

from db import get_collection, use_mongo
import agent
import seed

app = FastAPI(title="Touchless Invoicing Agent API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Active WebSocket connections
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(message))
            except Exception:
                pass

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

async def notify_clients(event: str, payload: dict):
    """Sends real-time updates to connected clients."""
    await manager.broadcast({"event": event, "payload": payload})

def log_audit(actor: str, action: str, target: str, meta: dict = None):
    """Logs action to database audit trail."""
    audit_col = get_collection("audit_logs")
    entry = {
        "actor": actor,
        "action": action,
        "target": target,
        "at": datetime.utcnow().isoformat(),
        "meta": meta or {}
    }
    audit_col.insert_one(entry)
    
    # Broadcast log event
    try:
        import asyncio
        asyncio.create_task(notify_clients("audit_log_created", entry))
    except Exception:
        pass
    return entry

# ============ SYSTEM ENDPOINTS ============

@app.get("/api/health")
def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "database": "mongodb" if use_mongo else "json_file_fallback",
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/seed")
def trigger_seed():
    """Triggers database seeding from the Excel sheet."""
    success = seed.seed_db()
    if not success:
        raise HTTPException(status_code=500, detail="Database seeding failed.")
    return {"status": "success", "message": "Database successfully re-seeded from Excel."}

# ============ CLIENT / CUSTOMER CONFIG ENDPOINTS ============

class CustomerConfig(BaseModel):
    client_code: str
    client_name: str
    city: str
    industry: str
    contact_email: str
    status: str
    input_channels: List[str]
    dispatch_rule: str
    validation_profile: dict

@app.get("/api/customers")
def get_customers():
    return get_collection("customers").find()

@app.post("/api/customers")
def upsert_customer(cust: CustomerConfig, x_user_email: Optional[str] = Header(None)):
    customers_col = get_collection("customers")
    data = cust.dict()
    
    result = customers_col.find_one_and_update(
        {"client_code": data["client_code"]},
        {"$set": data},
        upsert=True
    )
    
    log_audit(x_user_email or "system", "client_configuration_updated", data["client_code"], {"config": data})
    return data

# ============ EMPLOYEE ENDPOINTS ============

@app.get("/api/employees")
def get_employees(client_code: Optional[str] = None, email: Optional[str] = None):
    query = {}
    if client_code:
        query["client_code"] = client_code
    if email:
        query["email"] = email.lower()
    return get_collection("employees").find(query)

class LinkEmailRequest(BaseModel):
    portal_email: str

@app.post("/api/employees/{emp_id}/link-email")
def link_portal_email(emp_id: str, req: LinkEmailRequest, x_user_email: Optional[str] = Header(None)):
    """Link a Firebase portal email to an employee record (adds a duplicate entry with the portal email)."""
    import uuid
    employees_col = get_collection("employees")
    
    # Find the canonical employee record
    emp = employees_col.find_one({"emp_id": emp_id, "is_demo_account": {"$ne": True}})
    if not emp:
        # Fallback — find any record with this emp_id
        emp = employees_col.find_one({"emp_id": emp_id})
    if not emp:
        raise HTTPException(status_code=404, detail=f"Employee {emp_id} not found")
    
    portal_email = req.portal_email.strip().lower()
    
    # Check if this portal email is already linked
    existing = employees_col.find_one({"email": portal_email})
    if existing:
        if existing.get("emp_id") == emp_id:
            return {"status": "already_linked", "emp_id": emp_id, "email": portal_email}
        # Update the existing entry to point to the new emp_id
        employees_col.delete_many({"email": portal_email})
    
    # Create a new entry with the portal email mapped to this employee
    new_entry = dict(emp)
    new_entry["_id"] = str(uuid.uuid4())
    new_entry["id"] = str(uuid.uuid4())
    new_entry["email"] = portal_email
    new_entry["is_demo_account"] = True  # marks it as a portal alias
    
    employees_col.insert_one(new_entry)
    
    log_audit(
        actor=x_user_email or "admin",
        action="employee_email_linked",
        target=emp_id,
        meta={"portal_email": portal_email, "employee": emp.get("full_name")}
    )
    
    return {"status": "linked", "emp_id": emp_id, "portal_email": portal_email, "employee_name": emp.get("full_name")}

# ============ TIMESHEET INGESTION & EXTRCTION ============

@app.get("/api/timesheets")
def get_timesheets(client_code: Optional[str] = None):
    query = {"client_code": client_code} if client_code else {}
    # Sort newest first
    return get_collection("timesheets").find(query, sort=[("uploaded_at", -1)])

@app.post("/api/timesheets")
async def upload_timesheet(
    client_code: str = Form(...),
    pay_period: str = Form("June 2026"),
    input_type: str = Form("email"), # email, excel, handwriting, pdf
    text_content: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    x_user_email: Optional[str] = Header(None)
):
    timesheets_col = get_collection("timesheets")
    
    file_bytes = None
    file_name = None
    if file:
        file_bytes = await file.read()
        file_name = file.filename
        
    # Trigger AI Extraction Agent
    extracted = agent.extract_timesheet(
        text_content=text_content,
        file_name=file_name,
        file_bytes=file_bytes,
        client_code=client_code
    )
    
    # Generate database ID
    import uuid
    ts_id = str(uuid.uuid4())
    
    # Check if there are exceptions (unresolved employees, low confidence, signature mismatch)
    has_exception = False
    reasons = []
    
    for r in extracted["records"]:
        if r.get("match_status") in ["ambiguous", "unmatched"]:
            has_exception = True
            reasons.append(r.get("warning") or f"Match status is {r.get('match_status')}")
            
    # Check signature rule
    customers_col = get_collection("customers")
    cust = customers_col.find_one({"client_code": client_code})
    if cust and cust.get("validation_profile", {}).get("require_signature"):
        if not extracted["meta"].get("has_signature"):
            has_exception = True
            reasons.append("Missing required client signature.")
            
    status = "pending_review" if has_exception else "processed"
    
    # Store timesheet
    timesheet_doc = {
        "id": ts_id,
        "client_code": client_code,
        "client_name": cust["client_name"] if cust else client_code,
        "pay_period": pay_period,
        "input_type": input_type,
        "file_name": file_name,
        "status": status,
        "uploaded_at": datetime.utcnow().isoformat(),
        "uploaded_by": x_user_email or "client_portal",
        "extracted_data": extracted,
        "exceptions": reasons if has_exception else [],
        "is_touchless": not has_exception
    }
    
    timesheets_col.insert_one(timesheet_doc)
    
    # Log audit trail
    log_audit(
        actor=x_user_email or "client_portal",
        action="timesheet_ingested",
        target=ts_id,
        meta={
            "client_code": client_code,
            "status": status,
            "overall_confidence": extracted["overall_confidence"],
            "is_touchless": not has_exception
        }
    )
    
    # If no exceptions, immediately trigger simulated ERP invoice generation
    if not has_exception:
        trigger_invoice_generation(timesheet_doc, x_user_email or "tasc_smart_bot")
        
    await notify_clients("timesheet_updated", timesheet_doc)
    return timesheet_doc

# ============ HITL EXCEPTION QUEUE ENDPOINTS ============

class HITLResolveRequest(BaseModel):
    records: List[dict]

class HITLRejectRequest(BaseModel):
    comment: Optional[str] = ""

@app.post("/api/timesheets/{id}/reject")
async def reject_timesheet(id: str, payload: HITLRejectRequest, x_user_email: Optional[str] = Header(None)):
    timesheets_col = get_collection("timesheets")
    ts = timesheets_col.find_one({"id": id})
    if not ts:
        raise HTTPException(status_code=404, detail="Timesheet not found")
    ts["status"] = "rejected"
    ts["admin_comment"] = payload.comment or ""
    ts["reviewed_by"] = x_user_email or "admin"
    ts["reviewed_at"] = datetime.utcnow().isoformat()
    timesheets_col.update_one({"id": id}, {"$set": ts})
    log_audit(actor=x_user_email or "admin", action="timesheet_rejected", target=id,
              meta={"client_code": ts.get("client_code"), "comment": payload.comment})
    await notify_clients("timesheet_updated", ts)
    return ts

@app.post("/api/timesheets/{id}/approve")
async def approve_timesheet(id: str, payload: HITLResolveRequest, x_user_email: Optional[str] = Header(None)):
    timesheets_col = get_collection("timesheets")
    ts = timesheets_col.find_one({"id": id})
    
    if not ts:
        raise HTTPException(status_code=404, detail="Timesheet not found")
        
    # Apply human-in-the-loop corrections
    records = payload.records
    employees_col = get_collection("employees")
    
    updated_records = []
    for r in records:
        rec = dict(r)
        emp_id = rec.get("matched_emp_id")
        if emp_id:
            emp = employees_col.find_one({"emp_id": emp_id})
            if emp:
                rec["matched_name"] = emp["full_name"]
                rec["client_code"] = emp["client_code"]
                rec["client_name"] = emp["client_name"]
                rec["match_status"] = "matched"
                # Since a human corrected/verified it, confidence is bumped to 1.0
                rec["confidence"] = 1.0
        updated_records.append(rec)
        
    ts["extracted_data"]["records"] = updated_records
    ts["extracted_data"]["overall_confidence"] = 1.0
    ts["status"] = "processed"
    ts["exceptions"] = []
    
    # Save timesheet
    timesheets_col.update_one({"id": id}, {"$set": ts})
    
    log_audit(
        actor=x_user_email or "finops_agent",
        action="timesheet_hitl_resolved",
        target=id,
        meta={"client_code": ts["client_code"]}
    )
    
    # Trigger simulated ERP payroll run to produce invoice
    trigger_invoice_generation(ts, x_user_email or "finops_agent")
    
    await notify_clients("timesheet_updated", ts)
    return ts

def trigger_invoice_generation(timesheet: dict, actor: str):
    """Simulates payroll BOT invoice generation and validation rules engine."""
    invoices_col = get_collection("invoices")
    customers_col = get_collection("customers")
    
    # Generate Invoice structure
    invoice_doc = agent.generate_invoice(timesheet)
    
    # Run validation engine
    cust = customers_col.find_one({"client_code": timesheet["client_code"]})
    rules = cust.get("validation_profile", {}) if cust else {}
    
    validated_invoice = agent.validate_invoice(invoice_doc, rules)
    
    # Store invoice (overwrite if exists for the timesheet)
    invoices_col.delete_many({"timesheet_id": timesheet["id"]})
    invoices_col.insert_one(validated_invoice)
    
    log_audit(
        actor=actor,
        action="invoice_generated",
        target=validated_invoice["id"],
        meta={
            "client_code": validated_invoice["client_code"],
            "validation_status": validated_invoice["validation_status"],
            "total_amount": validated_invoice["total_amount"]
        }
    )

# ============ INVOICE & DISPATCH ENDPOINTS ============

@app.get("/api/invoices")
def get_invoices(client_code: Optional[str] = None):
    query = {"client_code": client_code} if client_code else {}
    return get_collection("invoices").find(query, sort=[("generated_at", -1)])

@app.post("/api/invoices/{id}/approve")
async def approve_invoice(id: str, x_user_email: Optional[str] = Header(None)):
    invoices_col = get_collection("invoices")
    inv = invoices_col.find_one({"id": id})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
        
    inv["validation_status"] = "passed"
    inv["validation_errors"] = []
    
    invoices_col.update_one({"id": id}, {"$set": inv})
    
    log_audit(
        actor=x_user_email or "finance_officer",
        action="invoice_manually_approved",
        target=id,
        meta={"client_code": inv["client_code"]}
    )
    
    await notify_clients("invoice_updated", inv)
    return inv

@app.post("/api/invoices/dispatch")
async def execute_dispatch(x_user_email: Optional[str] = Header(None)):
    """Dispatches all 'passed' status invoices, sorting them per client rules."""
    invoices_col = get_collection("invoices")
    customers_col = get_collection("customers")
    
    # Fetch all invoices that passed validation and are not yet dispatched
    pending_invoices = list(invoices_col.find({"validation_status": "passed", "dispatch_status": "draft"}))
    
    dispatched_list = []
    
    for inv in pending_invoices:
        # Load client dispatch rule
        cust = customers_col.find_one({"client_code": inv["client_code"]})
        rule = cust.get("dispatch_rule", "spend_ascending") if cust else "spend_ascending"
        
        # Sort line items based on dispatch rules (ascending/descending)
        items = list(inv.get("line_items", []))
        if rule == "spend_ascending":
            items.sort(key=lambda x: x.get("net_pay", 0))
        elif rule == "spend_descending":
            items.sort(key=lambda x: x.get("net_pay", 0), reverse=True)
            
        inv["line_items"] = items
        inv["dispatch_status"] = "dispatched"
        inv["dispatched_at"] = datetime.utcnow().isoformat()
        
        invoices_col.update_one({"id": inv["id"]}, {"$set": inv})
        dispatched_list.append(inv)
        
        log_audit(
            actor=x_user_email or "dispatch_system",
            action="invoice_dispatched",
            target=inv["id"],
            meta={"client_code": inv["client_code"], "rule_applied": rule}
        )
        
        await notify_clients("invoice_updated", inv)
        
    return {"status": "success", "dispatched_count": len(dispatched_list), "invoices": dispatched_list}

# ============ CLIENT PORTAL QUERIES ENDPOINTS ============

class QueryCreate(BaseModel):
    client_code: str
    client_name: str
    invoice_id: str
    subject: str
    message: str

class QueryResolve(BaseModel):
    reply: str

@app.get("/api/queries")
def get_queries(client_code: Optional[str] = None):
    query = {"client_code": client_code} if client_code else {}
    return get_collection("queries").find(query, sort=[("created_at", -1)])

@app.post("/api/queries")
async def create_query(q: QueryCreate, x_user_email: Optional[str] = Header(None)):
    queries_col = get_collection("queries")
    import uuid
    data = q.dict()
    data["id"] = str(uuid.uuid4())
    data["status"] = "open"
    data["created_at"] = datetime.utcnow().isoformat()
    data["created_by"] = x_user_email or "client_portal"
    data["replies"] = []
    
    queries_col.insert_one(data)
    
    log_audit(
        actor=x_user_email or "client_portal",
        action="client_query_raised",
        target=data["id"],
        meta={"client_code": data["client_code"], "invoice_id": data["invoice_id"]}
    )
    
    await notify_clients("query_updated", data)
    return data

@app.post("/api/queries/{id}/resolve")
async def resolve_query(id: str, payload: QueryResolve, x_user_email: Optional[str] = Header(None)):
    queries_col = get_collection("queries")
    q = queries_col.find_one({"id": id})
    if not q:
        raise HTTPException(status_code=404, detail="Query not found")
        
    q["status"] = "resolved"
    q["replies"].append({
        "sender": x_user_email or "finops_agent",
        "message": payload.reply,
        "at": datetime.utcnow().isoformat()
    })
    
    queries_col.update_one({"id": id}, {"$set": q})
    
    log_audit(
        actor=x_user_email or "finops_agent",
        action="client_query_resolved",
        target=id,
        meta={"client_code": q["client_code"]}
    )
    
    await notify_clients("query_updated", q)
    return q

# ============ CONTEXT-AWARE AI CHAT ENDPOINT ============

class ChatRequest(BaseModel):
    query: str
    client_code: Optional[str] = None

@app.post("/api/chat")
def get_chat_response(req: ChatRequest):
    response = agent.chat_assistant(req.query, req.client_code)
    return {"response": response}

# ============ SYSTEM METRICS ENDPOINT ============

@app.get("/api/metrics")
def get_metrics():
    timesheets = get_collection("timesheets").find()
    invoices = get_collection("invoices").find()
    
    total_ts = len(timesheets)
    touchless_ts = len([t for t in timesheets if t.get("is_touchless")])
    
    touchless_rate = (touchless_ts / total_ts * 100) if total_ts > 0 else 0.0
    
    # Calculate average confidence
    conf_sum = sum(float(t.get("extracted_data", {}).get("overall_confidence", 0)) for t in timesheets)
    avg_confidence = (conf_sum / total_ts * 100) if total_ts > 0 else 100.0
    
    # Invoice stats
    total_invoiced = sum(float(i.get("total_amount", 0)) for i in invoices)
    passed_validation = len([i for i in invoices if i.get("validation_status") == "passed"])
    
    # Simulated processing time (touchless takes 1.5 min, manual exception resolution takes 18 min on average)
    total_time = sum(1.5 if t.get("is_touchless") else 18.0 for t in timesheets)
    avg_processing_time = (total_time / total_ts) if total_ts > 0 else 0.0
    
    return {
        "touchless_rate": round(touchless_rate, 1),
        "extraction_accuracy": round(avg_confidence, 1),
        "avg_processing_time_mins": round(avg_processing_time, 1),
        "total_invoiced_amount": round(total_invoiced, 2),
        "passed_validation_count": passed_validation,
        "total_invoices_count": len(invoices)
    }

# ============ AUDIT TRAILS ENDPOINTS ============

@app.get("/api/audit")
def list_audit_logs(limit: int = 200):
    return get_collection("audit_logs").find(limit=limit, sort=[("at", -1)])

# ============ BACKWARD-COMPATIBILITY MOCK PROFILE & SESSIONS ============
# Keep these so existing pages open without crashing immediately

DEFAULT_EMPLOYEES = [
    {"employeeId": "EMP001", "fullName": "Debangshu", "email": "debangshu@sinhas.ch", "department": "Administration", "employeeType": "permanent", "active": True},
    {"employeeId": "EMP002", "fullName": "Nirmalya", "email": "nirmalya@sinhas.ch", "department": "Administration", "employeeType": "permanent", "active": True},
    {"employeeId": "EMP003", "fullName": "Rishu", "email": "rishu@sinhas.ch", "department": "Administration", "employeeType": "permanent", "active": True},
]

@app.get("/api/profiles")
def list_profiles():
    # Attempt to read employee master and format as legacy profile list
    try:
        employees = get_collection("employees").find()
        if employees:
            return [
                {
                    "employeeId": e["emp_id"],
                    "fullName": e["full_name"],
                    "email": e["email"],
                    "mobile": "",
                    "department": e["department"],
                    "employeeType": "permanent",
                    "active": e["status"] == "Active"
                }
                for e in employees
            ]
    except Exception:
        pass
    return DEFAULT_EMPLOYEES

@app.get("/api/profiles/{email}")
def get_profile(email: str):
    # Special demo accounts — map to real employees in the TASC database
    DEMO_EMAIL_MAP = {
        "employee@gmail.com": "EMP10001",  # Carlos Smith, Emirates Steel
        "admin@gmail.com": None,           # admin — no employee record
    }
    # Check if it's a demo account with an employee mapping
    demo_emp_id = DEMO_EMAIL_MAP.get(email.lower())
    if demo_emp_id:
        emp = get_collection("employees").find_one({"emp_id": demo_emp_id})
        if emp:
            return {
                "employeeId": emp["emp_id"],
                "fullName": emp["full_name"],
                "email": email,  # keep the login email
                "mobile": "",
                "department": emp["department"],
                "employeeType": "permanent",
                "active": emp["status"] == "Active"
            }
    # Normal lookup by email in employee master
    emp = get_collection("employees").find_one({"email": email.lower()})
    if emp:
        return {
            "employeeId": emp["emp_id"],
            "fullName": emp["full_name"],
            "email": emp["email"],
            "mobile": "",
            "department": emp["department"],
            "employeeType": "permanent",
            "active": emp["status"] == "Active"
        }
    return {
        "employeeId": email.split("@")[0].upper(),
        "fullName": email.split("@")[0],
        "email": email,
        "mobile": "",
        "department": "—",
        "employeeType": "permanent",
        "active": True
    }

@app.post("/api/profiles")
def upsert_profile(data: dict):
    return data

@app.get("/api/sessions")
def list_sessions(email: Optional[str] = None, status: Optional[str] = None):
    sessions_col = get_collection("sessions")
    query = {}
    if email:
        query["email"] = email
    if status:
        query["status"] = status
    return sessions_col.find(query, sort=[("clockIn", -1)])

@app.post("/api/sessions")
def create_session(data: dict):
    sessions_col = get_collection("sessions")
    import uuid
    if "id" not in data or not data["id"]:
        data["id"] = str(uuid.uuid4())
    sessions_col.insert_one(data)
    return data

@app.patch("/api/sessions/{id}")
def patch_session(id: str, patch: dict):
    sessions_col = get_collection("sessions")
    s = sessions_col.find_one({"id": id})
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    sessions_col.update_one({"id": id}, {"$set": patch})
    s.update(patch)
    return s

@app.get("/api/sessions/{id}")
def get_session(id: str):
    sessions_col = get_collection("sessions")
    s = sessions_col.find_one({"id": id})
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    return s

@app.post("/api/audit")
def create_audit_log(data: dict):
    audit_col = get_collection("audit_logs")
    import uuid
    if "id" not in data or not data["id"]:
        data["id"] = str(uuid.uuid4())
    if "at" not in data or not data["at"]:
        data["at"] = datetime.utcnow().isoformat()
    audit_col.insert_one(data)
    return data

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    uvicorn.run(app, host="0.0.0.0", port=port)
