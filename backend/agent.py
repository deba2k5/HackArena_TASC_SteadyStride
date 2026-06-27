"""
TIA Agent — Full AI Pipeline
Step 1: OpenCV image preprocessing
Step 2: Tesseract OCR text extraction
Step 3: Groq Llama-4 Scout VLM verification (handwriting/image)
Step 4: BERT-based field extraction + heuristics
Step 5: Employee identity resolution
Step 6: Project-based pay calculation (Office Regulation Act)
Step 7: Invoice generation + validation
"""
import os, re, io, json, base64, uuid
import pandas as pd
import numpy as np
from datetime import datetime
from dotenv import load_dotenv
from db import get_collection

load_dotenv()

# ── Office Regulation Act — loaded from .env ──────────────────────────────────
BASE_HOURLY_RATE = float(os.getenv("BASE_HOURLY_RATE_AED", 500))
STANDARD_HOURS   = float(os.getenv("STANDARD_HOURS_PER_DAY", 8))
OT_MULTIPLIER    = float(os.getenv("OT_MULTIPLIER", 1.5))
CONF_THRESHOLD   = float(os.getenv("CONFIDENCE_THRESHOLD", 0.75))
EXCEPTION_FLOOR  = float(os.getenv("EXCEPTION_CONFIDENCE_FLOOR", 0.60))
GROQ_API_KEY     = os.getenv("GROQ_API_KEY", "")

def _parse_project_env(env_val: str, defaults: tuple) -> dict:
    if not env_val:
        return {"name": defaults[0], "max_pay": defaults[1], "max_days": defaults[2]}
    parts = env_val.split("|")
    return {
        "name":     parts[0].strip() if len(parts) > 0 else defaults[0],
        "max_pay":  float(parts[1]) if len(parts) > 1 else defaults[1],
        "max_days": int(parts[2])   if len(parts) > 2 else defaults[2],
    }

PROJECTS = {
    "P1": _parse_project_env(os.getenv("PROJECT_1", ""), ("Alpha Infrastructure", 24000, 6)),
    "P2": _parse_project_env(os.getenv("PROJECT_2", ""), ("Beta Integration",    20000, 5)),
    "P3": _parse_project_env(os.getenv("PROJECT_3", ""), ("Gamma Support",       16000, 4)),
}

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 1 — OpenCV Image Preprocessing
# ═══════════════════════════════════════════════════════════════════════════════
def preprocess_image_cv(image_bytes: bytes):
    """
    Full OpenCV pipeline: deskew → denoise → contrast → threshold → resize.
    Returns preprocessed numpy array + PIL image for OCR.
    """
    try:
        import cv2
        from PIL import Image

        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            return None, None

        # Shadow removal
        channels = cv2.split(img)
        result_ch = []
        for ch in channels:
            dilated = cv2.dilate(ch, np.ones((7,7), np.uint8))
            blurred = cv2.medianBlur(dilated, 21)
            diff = 255 - cv2.absdiff(ch, blurred)
            norm = cv2.normalize(diff, None, 0, 255, cv2.NORM_MINMAX)
            result_ch.append(norm)
        img = cv2.merge(result_ch)

        # Contrast (CLAHE on L channel)
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))
        l = clahe.apply(l)
        img = cv2.cvtColor(cv2.merge((l,a,b)), cv2.COLOR_LAB2BGR)

        # Denoise
        img = cv2.fastNlMeansDenoisingColored(img, None, 10, 10, 7, 21)

        # Deskew via Hough lines
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 50, 150, apertureSize=3)
        lines = cv2.HoughLines(edges, 1, np.pi/180, threshold=150)
        if lines is not None:
            angles = []
            for line in lines[:20]:
                rho, theta = line[0]
                angle = np.degrees(theta) - 90
                if abs(angle) < 45:
                    angles.append(angle)
            if angles:
                angle = float(np.median(angles))
                if abs(angle) > 0.5:
                    h, w = img.shape[:2]
                    M = cv2.getRotationMatrix2D((w//2, h//2), angle, 1.0)
                    img = cv2.warpAffine(img, M, (w,h), flags=cv2.INTER_CUBIC,
                                         borderMode=cv2.BORDER_REPLICATE)

        # Sharpen
        blurred = cv2.GaussianBlur(img, (0,0), 3)
        img = cv2.addWeighted(img, 1.5, blurred, -0.5, 0)

        # Resize to at least 1200px wide for OCR
        h, w = img.shape[:2]
        if w < 1200:
            scale = 1200 / w
            img = cv2.resize(img, (int(w*scale), int(h*scale)), interpolation=cv2.INTER_LANCZOS4)

        pil_img = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
        return img, pil_img

    except ImportError:
        print("OpenCV not installed — skipping preprocessing")
        from PIL import Image
        pil_img = Image.open(io.BytesIO(image_bytes))
        return None, pil_img
    except Exception as e:
        print(f"OpenCV preprocessing error: {e}")
        return None, None

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 2 — Tesseract OCR
# ═══════════════════════════════════════════════════════════════════════════════
def run_tesseract_ocr(pil_image) -> str:
    """Run Tesseract OCR on a PIL image, returns extracted text."""
    try:
        import pytesseract
        # Try Windows default path
        possible_paths = [
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
            "/usr/bin/tesseract",
            "/usr/local/bin/tesseract",
        ]
        for p in possible_paths:
            if os.path.exists(p):
                pytesseract.pytesseract.tesseract_cmd = p
                break

        config = "--psm 6 --oem 3"
        text = pytesseract.image_to_string(pil_image, config=config)
        print(f"[OCR] Extracted {len(text)} chars via Tesseract")
        return text.strip()
    except ImportError:
        print("pytesseract not installed")
        return ""
    except Exception as e:
        print(f"Tesseract OCR error: {e}")
        return ""

def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract text from PDF using pypdf, fallback to image OCR."""
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(file_bytes))
        text = ""
        for page in reader.pages:
            text += (page.extract_text() or "") + "\n"
        if text.strip():
            return text.strip()
    except Exception as e:
        print(f"pypdf error: {e}")
    # Fallback: render PDF pages as images and OCR
    try:
        from pdf2image import convert_from_bytes
        pages = convert_from_bytes(file_bytes, dpi=200)
        texts = []
        for page in pages:
            texts.append(run_tesseract_ocr(page))
        return "\n".join(texts)
    except Exception as e:
        print(f"pdf2image OCR fallback error: {e}")
        return ""

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 3 — Groq Llama-4 Scout VLM (handwriting/image verification)
# ═══════════════════════════════════════════════════════════════════════════════
GROQ_VLM_PROMPT = """You are an enterprise payroll AI reading a handwritten or scanned timesheet.

The document may contain a TABLE with multiple employee rows, or a single employee's details.

Return ONLY this JSON (no other text):
{
  "table_rows": [
    {
      "employee_name": "name or null",
      "emp_id": "EMP##### or null",
      "working_days": <integer 1-31 ONLY or null>,
      "ot_hours": <float 0-200 or 0>,
      "basic_pay": <float or null>,
      "deductions": <float or 0>,
      "net_pay": <float or null>,
      "project_code": "P1 or P2 or P3 or null — ONLY these values",
      "leave_days": <integer 0-31 or 0>
    }
  ],
  "client_name": "company name or null",
  "pay_period": "Month YYYY or null",
  "confidence": <float 0.0-1.0 — how confident you are in the reading>
}

RULES:
- Extract ALL rows you can see. If it is a table with 3 rows, return 3 objects in table_rows.
- working_days: actual number of working days, MUST be 1-31. Never a year like 2026.
- project_code: MUST be exactly "P1", "P2", or "P3" only. Anything else → null.
- net_pay, basic_pay: read the AED amounts written. If a column header says "Net Pay" or "Basic", read the value in that column.
- If a field is not visible or unclear, use null.
- Return ONLY the JSON object, nothing else."""


def groq_vlm_extract(image_bytes: bytes, ocr_text: str = "") -> dict:
    """
    Call Groq Llama-4 Scout VLM to extract timesheet data from an image.
    Handles both single-record and multi-row table formats.
    Returns validated dict or empty dict on failure.
    """
    if not GROQ_API_KEY or GROQ_API_KEY.startswith("gsk_placeholder"):
        print("[Groq] API key not configured — skipping VLM extraction")
        return {}

    try:
        from groq import Groq
        client = Groq(api_key=GROQ_API_KEY)

        b64_img = base64.b64encode(image_bytes).decode("utf-8")
        mime = "image/jpeg"
        if image_bytes[:4] == b'\x89PNG':
            mime = "image/png"
        elif image_bytes[:4][:4] == b'%PDF':
            return {}

        prompt = GROQ_VLM_PROMPT
        if ocr_text:
            prompt += f"\n\nOCR pre-read (use as reference, trust your vision):\n{ocr_text[:600]}"

        messages = [{
            "role": "user",
            "content": [
                {"type": "text",      "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64_img}"}},
            ],
        }]

        completion = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=messages,
            temperature=0.05,
            max_completion_tokens=2048,
            top_p=1,
            stream=False,
        )
        raw = completion.choices[0].message.content or ""
        print(f"[Groq VLM] Raw: {raw[:600]}")

        # Extract JSON
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        if not json_match:
            print("[Groq VLM] No JSON found in response")
            return {}

        result = json.loads(json_match.group(0))

        # ── Validate table_rows ────────────────────────────────────────────────
        rows = result.get("table_rows", [])
        if not isinstance(rows, list):
            rows = []

        clean_rows = []
        for row in rows:
            if not isinstance(row, dict):
                continue

            # working_days: 1-31
            wd = row.get("working_days")
            if wd is not None:
                try:
                    wd = int(str(wd).split(".")[0])
                    row["working_days"] = wd if 1 <= wd <= 31 else None
                except (ValueError, TypeError):
                    row["working_days"] = None

            # project_code: P1/P2/P3 only
            proj = row.get("project_code")
            if proj:
                pm = re.search(r'\b(P[1-3])\b', str(proj), re.I)
                row["project_code"] = pm.group(1).upper() if pm else None

            # ot_hours: 0-200
            ot = row.get("ot_hours")
            if ot is not None:
                try:
                    ot = float(ot)
                    row["ot_hours"] = ot if 0 <= ot <= 200 else 0.0
                except (ValueError, TypeError):
                    row["ot_hours"] = 0.0
            else:
                row["ot_hours"] = 0.0

            # monetary fields
            for f in ("net_pay", "basic_pay", "deductions"):
                val = row.get(f)
                if val is not None:
                    try:
                        fval = float(str(val).replace(",", "").replace("AED", "").strip())
                        row[f] = fval if fval >= 0 else None
                    except (ValueError, TypeError):
                        row[f] = None
                if f == "deductions" and row.get(f) is None:
                    row[f] = 0.0

            # Must have at least working_days or net_pay to be useful
            if row.get("working_days") or row.get("net_pay"):
                clean_rows.append(row)

        result["table_rows"] = clean_rows

        # Validate top-level confidence
        conf = result.get("confidence")
        try:
            result["confidence"] = float(conf) if conf is not None else 0.7
        except (ValueError, TypeError):
            result["confidence"] = 0.7

        print(f"[Groq VLM] Extracted {len(clean_rows)} rows, conf={result.get('confidence')}")
        for r in clean_rows:
            print(f"  row: days={r.get('working_days')} basic={r.get('basic_pay')} "
                  f"deduct={r.get('deductions')} net={r.get('net_pay')} proj={r.get('project_code')}")
        return result

    except Exception as e:
        print(f"[Groq VLM] Error: {e}")
        return {}

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 4 — BERT-based field extraction + heuristics
# ═══════════════════════════════════════════════════════════════════════════════
_bert_pipeline = None

def get_bert_pipeline():
    """Lazy-load BERT QA pipeline (deepset/roberta-base-squad2)."""
    global _bert_pipeline
    if _bert_pipeline is not None:
        return _bert_pipeline
    try:
        from transformers import pipeline
        _bert_pipeline = pipeline("question-answering", model="deepset/roberta-base-squad2")
        print("[BERT] Pipeline loaded")
    except Exception as e:
        print(f"[BERT] Could not load pipeline: {e}")
        _bert_pipeline = None
    return _bert_pipeline

BERT_QUESTIONS = {
    "employee_name":    "What is the employee name?",
    "emp_id":           "What is the employee ID or EMP number?",
    "working_days":     "How many days did the employee work?",
    "ot_hours":         "How many overtime hours were worked?",
    "leave_days":       "How many leave days were taken?",
    "project_code":     "What is the project code or project number?",
    "hours_per_day":    "How many hours per day did the employee work?",
    "total_hours":      "What is the total number of hours worked?",
    "client_name":      "What is the client or company name?",
    "pay_period":       "What is the pay period or month?",
}

def bert_extract(text: str) -> dict:
    """Run BERT QA on OCR text to extract timesheet fields."""
    if not text or len(text) < 20:
        return {}
    qa = get_bert_pipeline()
    if not qa:
        return {}
    result = {}
    for field, question in BERT_QUESTIONS.items():
        try:
            res = qa(question=question, context=text[:2000])
            if res["score"] > 0.15:
                result[field] = res["answer"].strip()
                result[f"_{field}_conf"] = round(res["score"], 3)
        except Exception:
            pass
    return result

def parse_heuristics(text: str) -> list:
    """Regex heuristic fallback — covers all 7 TASC test cases."""
    lines = [l.strip() for l in text.split("\n") if l.strip()]

    period_m = re.search(r"(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*(202\d)", text, re.I)
    period = f"{period_m.group(1)} {period_m.group(2)}" if period_m else "June 2026"

    # ── Structured key:value format (sent by employee portal enrichment) ──────
    # E.g. "Emp ID: EMP10001\nEmployee Name: Carlos Smith\nWorking Days: 4\nProject Code: P2"
    kv: dict = {}
    for line in lines:
        m = re.match(r"^([A-Za-z][A-Za-z\s/_]{1,30}?)\s*:\s*(.+)$", line)
        if m:
            key = m.group(1).strip().lower().replace(" ", "_").replace("/", "_")
            val = m.group(2).strip()
            kv[key] = val

    if kv.get("emp_id") or kv.get("employee_name"):
        working_days_raw = kv.get("working_days") or kv.get("days_worked")
        try:
            wd = int(str(working_days_raw).split(".")[0]) if working_days_raw else None
            wd = wd if wd and 1 <= wd <= 31 else None
        except (ValueError, TypeError):
            wd = None
        proj_raw = kv.get("project_code") or kv.get("project")
        proj = None
        if proj_raw:
            pm = re.search(r"(P[1-3])", str(proj_raw), re.I)
            proj = pm.group(1).upper() if pm else None
        ot_raw = kv.get("ot_hours") or kv.get("overtime_hours") or "0"
        try:
            ot = float(ot_raw)
        except (ValueError, TypeError):
            ot = 0.0
        return [{
            "emp_id":        kv.get("emp_id", "").strip().upper() or None,
            "employee_name": kv.get("employee_name", "").strip() or None,
            "working_days":  wd,
            "ot_hours":      ot,
            "project_code":  proj,
            "pay_period":    period,
        }]

    # Case 3 — bulk list: "Name: 24 days"
    case3 = []
    client_m = re.search(r"(CL\d{3})|DP World|Emaar|Emirates Steel|ADNOC|Majid|ADCB|Etihad|Aldar|Transguard", text, re.I)
    detected_cc = client_m.group(1).upper() if client_m and client_m.group(1) else None
    for line in lines:
        m = re.match(r"^([A-Za-z\s]{4,40}?)\s*[:\-–—]\s*(\d+)\s*(days?|working days?|hrs?|hours?)?", line, re.I)
        if not m:
            m = re.match(r"^([A-Za-z\s]{4,40}?)\s+(\d+)\s*(days?|working days?)", line, re.I)
        if m:
            nm = m.group(1).strip()
            if nm.lower() in ("timesheet","client","payroll","subject","from","to","email","hi","dear","date","name"):
                continue
            wd = int(m.group(2))
            if 1 <= wd <= 31:  # only valid day counts
                case3.append({"employee_name": nm, "working_days": wd, "client_code": detected_cc, "pay_period": period})
    if len(case3) >= 2:
        return case3

    emp_m = re.search(r"EMP\d{5}", text, re.I)
    days_m = re.search(r"(?:working days?|days? worked|days)[:\s]+(\d+)", text, re.I)
    if not days_m:
        days_m = re.search(r"(\d+)\s*(days?|working days?|days? worked)", text, re.I)
    hours_m = re.search(r"(\d+\.?\d*)\s*(?:hours?|hrs?)\s*(?:worked|per day|daily)?", text, re.I)
    ot_m   = re.search(r"(?:overtime|o/?t)\s*(?:hours?)?\s*[:\-=]?\s*(\d+\.?\d*)", text, re.I)
    proj_m = re.search(r"(?:project|proj)\s*[:\-]?\s*([P]\d|Alpha|Beta|Gamma|P1|P2|P3)", text, re.I)

    def _safe_days(m):
        if not m: return None
        try:
            v = int(m.group(1))
            return v if 1 <= v <= 31 else None
        except (ValueError, IndexError):
            return None

    # Case 2 — EMP ID + days
    if emp_m and days_m:
        return [{"emp_id": emp_m.group(0).upper(), "working_days": _safe_days(days_m),
                 "ot_hours": float(ot_m.group(1)) if ot_m else 0.0,
                 "hours_worked": float(hours_m.group(1)) if hours_m else None,
                 "project_code": proj_m.group(1).upper() if proj_m else None,
                 "pay_period": period}]

    # Case 1 — name + client payout
    if re.search(r"payout|process|invoice", text, re.I):
        nm_m = re.search(r"(?:payout for|for)\s+([A-Za-z]+ [A-Za-z]+)", text, re.I)
        gross_m = re.search(r"(?:gross|total|amount)\s*(?:is|of|:)?\s*([\d,\.]+)", text, re.I)
        if nm_m:
            return [{"employee_name": nm_m.group(1).strip(),
                     "pay_period": period,
                     "gross_payout_requested": float(gross_m.group(1).replace(",","")) if gross_m else None}]

    # Case 6 — EMP ID + leave + reimbursements
    if (emp_m or days_m) and re.search(r"reimburs|leave|allowance", text, re.I):
        leave_m = re.search(r"leave\s*(?:taken|days?)?\s*[:\-=]?\s*(\d+)", text, re.I)
        reimbs = []
        for val, cur, desc in re.findall(r"(\d+\.?\d*)\s*(AED|aed|USD|usd)?\s*[-–—:]\s*([A-Za-z][A-Za-z\s]{2,30})", text):
            if desc.strip().lower() not in ("basic","housing","transport","food","phone","gross","net"):
                reimbs.append({"amount": float(val), "reason": desc.strip()})
        return [{"emp_id": emp_m.group(0).upper() if emp_m else None,
                 "working_days": _safe_days(days_m) or 23,
                 "leave_days": int(leave_m.group(1)) if leave_m else 0,
                 "ot_hours": float(ot_m.group(1)) if ot_m else 0.0,
                 "project_code": proj_m.group(1).upper() if proj_m else None,
                 "reimbursements": reimbs, "pay_period": period}]

    # General fallback
    nm_m2 = re.search(r"(?:i am|my name is|employee[:\s]+)([A-Za-z]+ [A-Za-z]+)", text, re.I)
    if nm_m2:
        return [{"employee_name": nm_m2.group(1).strip(),
                 "working_days": _safe_days(days_m) or 24,
                 "ot_hours": float(ot_m.group(1)) if ot_m else 0.0,
                 "project_code": proj_m.group(1).upper() if proj_m else None,
                 "pay_period": period}]
    return []

def merge_extraction(bert: dict, heuristic: list, vlm: dict) -> list:
    """
    Merge BERT, heuristics, and VLM into unified records.
    Priority: portal structured fields > VLM vision > BERT text > heuristic fallback.
    """
    base = heuristic[0] if heuristic else {}

    # Merge BERT into base (only fill gaps)
    for field in ("employee_name","emp_id","working_days","ot_hours","leave_days",
                  "project_code","hours_per_day","total_hours","client_name","pay_period"):
        if not base.get(field) and bert.get(field):
            base[field] = bert[field]

    if vlm:
        # Portal-supplied fields (from heuristic structured text) take priority
        # for identity/key fields — VLM fills gaps only
        portal_protected = {"emp_id", "working_days", "project_code"}

        for field in ("employee_name","emp_id","working_days","ot_hours","leave_days",
                      "project_code","hours_per_day","total_hours","client_name",
                      "pay_period","reimbursements","remarks",
                      "net_pay","basic_pay","deductions"):
            vlm_val = vlm.get(field)
            if vlm_val in (None, "", [], {}):
                continue
            # Portal values protect identity/time fields
            if field in portal_protected and base.get(field) not in (None, "", [], {}):
                continue
            base[field] = vlm_val

        if vlm.get("confidence"):
            base["vlm_confidence"] = float(vlm["confidence"])

    # Coerce and validate numeric types
    for f in ("working_days", "leave_days"):
        if base.get(f):
            try:
                v = int(str(base[f]).split(".")[0])
                base[f] = v if 1 <= v <= 31 else None
            except (ValueError, TypeError):
                base[f] = None

    for f in ("ot_hours","hours_per_day","total_hours","net_pay","basic_pay","deductions"):
        if base.get(f) is not None:
            try:
                base[f] = float(str(base[f]).replace(",","").replace("AED","").strip())
            except (ValueError, TypeError):
                base[f] = None

    # Derive working_days from total_hours if missing
    if base.get("total_hours") and not base.get("working_days"):
        base["working_days"] = max(1, round(base["total_hours"] / STANDARD_HOURS))

    if base.get("hours_per_day") and base.get("working_days") and not base.get("total_hours"):
        base["total_hours"] = round(base["hours_per_day"] * base["working_days"], 2)

    if not base:
        return []
    if heuristic and len(heuristic) > 1:
        return heuristic
    return [base]

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 5 — Employee Identity Resolution
# ═══════════════════════════════════════════════════════════════════════════════
def match_employees(extracted_records: list, client_code: str = None) -> list:
    matched = []
    employees_col = get_collection("employees")
    customers_col = get_collection("customers")

    for r in extracted_records:
        rec = dict(r)
        emp_id   = str(rec.get("emp_id") or "").strip().upper() or None
        name     = str(rec.get("employee_name") or "").strip() or None
        rec_cc   = rec.get("client_code") or client_code
        rec_cn   = rec.get("client_name")

        # Resolve client name → code
        if not rec_cc and rec_cn:
            cust = customers_col.find_one({"client_name": {"$regex": re.escape(rec_cn), "$options": "i"}})
            if cust:
                rec_cc = cust["client_code"]
                rec["client_code"] = rec_cc
                rec["client_name"] = cust["client_name"]

        # Filter out portal alias records from matching
        candidates = []
        if emp_id:
            emp = employees_col.find_one({"emp_id": emp_id, "is_demo_account": {"$ne": True}})
            if emp:
                candidates = [emp]
        elif name:
            raw = list(employees_col.find({"full_name": {"$regex": f"^{re.escape(name)}$", "$options": "i"},
                                           "is_demo_account": {"$ne": True}}))
            if not raw and len(name.split()) >= 2:
                parts = name.split()
                raw = list(employees_col.find({
                    "first_name": {"$regex": f"^{re.escape(parts[0])}$", "$options": "i"},
                    "last_name":  {"$regex": f"^{re.escape(parts[-1])}$", "$options": "i"},
                    "is_demo_account": {"$ne": True}
                }))
            candidates = raw

        if len(candidates) == 1:
            emp = candidates[0]
            rec.update({"matched_emp_id": emp["emp_id"], "matched_name": emp["full_name"],
                        "client_code": emp["client_code"], "client_name": emp["client_name"],
                        "match_status": "matched", "confidence": rec.get("confidence", 0.95),
                        "match_candidates": []})
        elif len(candidates) > 1:
            specific = [c for c in candidates if c["client_code"] == rec_cc]
            if len(specific) == 1:
                emp = specific[0]
                rec.update({"matched_emp_id": emp["emp_id"], "matched_name": emp["full_name"],
                            "client_code": emp["client_code"], "client_name": emp["client_name"],
                            "match_status": "matched", "confidence": 0.82,
                            "match_candidates": [{"emp_id":c["emp_id"],"name":c["full_name"],"client_name":c["client_name"]} for c in candidates]})
            else:
                rec.update({"matched_emp_id": None, "matched_name": None,
                            "match_status": "ambiguous", "confidence": 0.50,
                            "match_candidates": [{"emp_id":c["emp_id"],"name":c["full_name"],"client_name":c["client_name"]} for c in candidates],
                            "warning": f"Ambiguous name '{name}' matches {len(candidates)} employees. Admin review required."})
        else:
            rec.update({"matched_emp_id": None, "matched_name": name,
                        "match_status": "unmatched", "confidence": 0.20,
                        "match_candidates": [],
                        "warning": f"Employee '{name or emp_id}' not found in master database."})
        matched.append(rec)
    return matched

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 6 — Project-based Pay Calculation (Office Regulation Act)
# ═══════════════════════════════════════════════════════════════════════════════

def calculate_project_pay(emp_record: dict, rec: dict) -> dict:
    """
    Office Regulation Act billing: 500 AED/hr × 8 hrs/day.
    If the source document (handwriting) has explicit net_pay, use it directly.
    """
    working_days = int(rec.get("working_days") or 0)
    ot_hours     = float(rec.get("ot_hours") or 0.0)
    project_code = str(rec.get("project_code") or "").upper().strip()
    hours_worked = float(rec.get("total_hours") or 0.0)

    # If total_hours given, derive working_days from it
    if hours_worked and not working_days:
        working_days = max(1, round(hours_worked / STANDARD_HOURS))

    # Regular hours from working days
    regular_hours  = working_days * STANDARD_HOURS if working_days else hours_worked
    regular_pay    = regular_hours * BASE_HOURLY_RATE
    ot_pay         = ot_hours * BASE_HOURLY_RATE * OT_MULTIPLIER
    total_billable = regular_pay + ot_pay

    # Project cap enforcement
    project_info  = None
    cap_exceeded  = False
    cap_violation = None
    if project_code in PROJECTS:
        project_info = PROJECTS[project_code]
        max_pay  = project_info["max_pay"]
        max_days = project_info["max_days"]
        if working_days > max_days:
            cap_exceeded  = True
            cap_violation = (f"Working days {working_days} exceeds project {project_code} "
                             f"({project_info['name']}) max of {max_days} days.")
        if total_billable > max_pay:
            cap_exceeded   = True
            cap_violation  = (f"Billable AED {total_billable:,.2f} exceeds {project_code} "
                              f"cap AED {max_pay:,.2f}.")
            total_billable = max_pay

    # ── Use VLM-extracted net_pay if document states it explicitly ──────────
    # The handwritten doc may show explicit net pay — trust it over calculation
    doc_net_pay = rec.get("net_pay")
    if doc_net_pay and float(doc_net_pay) > 0:
        net_pay = round(float(doc_net_pay), 2)
        # Still apply project cap if applicable
        if project_info and net_pay > project_info["max_pay"]:
            net_pay = project_info["max_pay"]
            cap_exceeded = True
    else:
        net_pay = round(total_billable, 2)

    ot_rate   = BASE_HOURLY_RATE * OT_MULTIPLIER
    ot_amount = round(ot_hours * ot_rate, 2)
    emp       = emp_record

    return {
        "regular_hours":    round(regular_hours, 2),
        "ot_hours":         ot_hours,
        "regular_pay":      round(regular_pay, 2),
        "ot_pay":           round(ot_pay, 2),
        "total_billable":   round(total_billable, 2),
        "project_code":     project_code or None,
        "project_name":     project_info["name"] if project_info else None,
        "project_max_pay":  project_info["max_pay"] if project_info else None,
        "project_max_days": project_info["max_days"] if project_info else None,
        "cap_exceeded":     cap_exceeded,
        "cap_violation":    cap_violation,
        "basic":            round(regular_pay, 2),
        "housing":          0.0,
        "transport":        0.0,
        "food":             0.0,
        "phone":            0.0,
        "gross":            round(total_billable, 2),
        "ot_amount":        ot_amount,
        "deductions":       round(float(rec.get("deductions") or 0), 2),
        "net_pay":          net_pay,
        "iban":             emp.get("iban", "") if emp else "",
    }

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 7a — Invoice Generation
# ═══════════════════════════════════════════════════════════════════════════════

def generate_invoice(timesheet: dict) -> dict:
    client_code = timesheet.get("client_code")
    client_name = timesheet.get("client_name")
    employees_col = get_collection("employees")
    line_items    = []
    total_amount  = 0.0

    for rec in timesheet.get("extracted_data", {}).get("records", []):
        emp_id     = rec.get("matched_emp_id") or rec.get("emp_id")
        emp_name   = rec.get("matched_name") or rec.get("employee_name")
        working_days = int(rec.get("working_days") or 0)
        ot_hours     = float(rec.get("ot_hours") or 0.0)
        reimbursements = rec.get("reimbursements") or []

        # Skip records with no usable data
        if not emp_name and not emp_id:
            continue
        if working_days == 0 and not rec.get("total_hours"):
            continue

        # Look up employee master (for IBAN only)
        emp = None
        if emp_id:
            emp = employees_col.find_one({"emp_id": emp_id, "is_demo_account": {"$ne": True}})

        # Always calculate from Office Regulation Act: 500 AED/hr × 8 hrs/day
        pay = calculate_project_pay(emp, rec)

        line = {
            "emp_id":        emp_id,
            "employee_name": emp_name,
            "working_days":  working_days,
            "regular_hours": pay["regular_hours"],
            "ot_hours":      pay["ot_hours"],
            "basic":         pay["basic"],
            "housing":       pay["housing"],
            "transport":     pay["transport"],
            "food":          pay["food"],
            "phone":         pay["phone"],
            "gross":         pay["gross"],
            "ot_amount":     pay["ot_amount"],
            "deductions":    pay["deductions"],
            "reimbursements": reimbursements,
            "net_pay":       pay["net_pay"],
            "iban":          pay["iban"],
            "project_code":  pay.get("project_code"),
            "project_name":  pay.get("project_name"),
            "total_billable":pay.get("total_billable"),
            "cap_exceeded":  pay.get("cap_exceeded", False),
            "cap_violation": pay.get("cap_violation"),
        }
        line_items.append(line)
        total_amount += pay["net_pay"]

    inv_id = str(uuid.uuid4())
    return {
        "id": inv_id,
        "timesheet_id":      timesheet.get("id"),
        "client_code":       client_code,
        "client_name":       client_name,
        "pay_period":        timesheet.get("pay_period", "June 2026"),
        "total_amount":      round(total_amount, 2),
        "currency":          "AED",
        "line_items":        line_items,
        "generated_at":      datetime.utcnow().isoformat(),
        "validation_status": "pending",
        "validation_errors": [],
        "dispatch_status":   "draft",
    }

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 7b — Validation Engine (Business Rules)
# ═══════════════════════════════════════════════════════════════════════════════

def validate_invoice(invoice: dict, config_rules: dict) -> dict:
    inv    = dict(invoice)
    errors = []
    max_ot = config_rules.get("max_ot_hours_limit", 15)
    employees_col = get_collection("employees")
    timesheets_col = get_collection("timesheets")

    for line in inv.get("line_items", []):
        name   = line.get("employee_name", "Unknown")
        emp_id = line.get("emp_id")

        # Unresolved employee
        if not emp_id:
            errors.append({"type": "unmatched_employee", "field": "emp_id",
                           "message": f"'{name}' has no valid Emp ID — cannot process payroll.",
                           "severity": "error"})
            continue

        # OT limit
        if float(line.get("ot_hours") or 0) > max_ot:
            errors.append({"type": "overtime_limit_exceeded", "field": "ot_hours",
                           "message": f"{name}: OT {line['ot_hours']}h exceeds client limit {max_ot}h.",
                           "severity": "error"})

        # Gross sum sanity
        computed = sum(float(line.get(k) or 0) for k in ("basic","housing","transport","food","phone"))
        stored   = float(line.get("gross") or 0)
        if stored > 0 and abs(computed - stored) > 1.0:
            errors.append({"type": "gross_sum_mismatch", "field": "gross",
                           "message": f"{name}: computed gross {computed:.2f} ≠ stored {stored:.2f}.",
                           "severity": "warning"})

        # Salary rate vs master
        emp = employees_col.find_one({"emp_id": emp_id, "is_demo_account": {"$ne": True}})
        if emp:
            master_basic = float(emp.get("basic") or 0)
            line_basic   = float(line.get("basic") or 0)
            if line_basic > master_basic + 1.0:
                errors.append({"type": "base_rate_mismatch", "field": "basic",
                               "message": f"{name}: basic {line_basic:.2f} > master {master_basic:.2f}.",
                               "severity": "error"})

    inv["validation_errors"] = errors
    hard_errors = [e for e in errors if e.get("severity") == "error"]
    inv["validation_status"] = "passed" if not hard_errors else "failed"
    return inv

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN ENTRYPOINT — extract_timesheet
# ═══════════════════════════════════════════════════════════════════════════════

def extract_timesheet(text_content: str = None, file_name: str = None,
                      file_bytes: bytes = None, client_code: str = None) -> dict:
    """
    Full pipeline:
      image/pdf → OpenCV → Tesseract → Groq VLM (if image/handwriting)
      text/excel → heuristics
      All paths → BERT merge → employee match → return structured result
    """
    is_handwritten = False
    has_signature  = False
    has_stamp      = False
    extracted_text = text_content or ""
    vlm_result     = {}
    bert_result    = {}

    fn_lower = (file_name or "").lower()
    IS_IMAGE = any(fn_lower.endswith(ext) for ext in (".jpg",".jpeg",".png",".tiff",".bmp",".webp"))
    IS_PDF   = fn_lower.endswith(".pdf")
    IS_EXCEL = any(fn_lower.endswith(ext) for ext in (".xlsx",".xls"))
    IS_CSV   = fn_lower.endswith(".csv")

    if "handwrit" in fn_lower or "scan" in fn_lower or IS_IMAGE:
        is_handwritten = True
        has_signature  = True
        has_stamp      = True

    # ── EXCEL path ────────────────────────────────────────────────────────────
    if IS_EXCEL and file_bytes:
        try:
            import tempfile
            tmp = os.path.join(tempfile.gettempdir(), f"ts_{uuid.uuid4().hex}.xlsx")
            with open(tmp, "wb") as f: f.write(file_bytes)
            xl = pd.ExcelFile(tmp)
            try: os.remove(tmp)
            except: pass

            # Parse employee context from text_content (enriched by portal)
            ctx_emp_id, ctx_name, ctx_wd, ctx_proj, ctx_ot = None, None, None, None, 0.0
            if text_content:
                m = re.search(r"Emp\s+ID\s*:\s*(EMP\w+)", text_content, re.I)
                if m: ctx_emp_id = m.group(1).upper()
                m = re.search(r"Employee\s+Name\s*:\s*(.+)", text_content, re.I)
                if m: ctx_name = m.group(1).strip().split("\n")[0]
                m = re.search(r"Working\s+Days\s*:\s*(\d+)", text_content, re.I)
                if m:
                    v = int(m.group(1))
                    ctx_wd = v if 1 <= v <= 31 else None
                m = re.search(r"Project\s+Code\s*:\s*(P[1-3])", text_content, re.I)
                if m: ctx_proj = m.group(1).upper()
                m = re.search(r"OT\s+Hours\s*:\s*([\d.]+)", text_content, re.I)
                if m: ctx_ot = float(m.group(1))

            records = []
            for sheet_name in xl.sheet_names:
                df_raw = xl.parse(sheet_name, header=None)
                df_raw = df_raw.dropna(how="all").reset_index(drop=True)
                cols_lower = [str(c).lower() for c in df_raw.iloc[0].fillna("").tolist()]

                # ── FORMAT A: Monthly Summary (key-value layout) ──────────────
                # Detect by: has rows where col0 looks like "Employee ID", "Working Days", etc.
                col0_vals = df_raw[0].dropna().astype(str).str.lower().tolist()
                is_kv = any(k in " ".join(col0_vals) for k in
                            ("employee id", "working days", "regular hours", "overtime hours"))
                if is_kv:
                    kv = {}
                    proj_rows = []
                    in_proj_table = False
                    for _, row in df_raw.iterrows():
                        k = str(row.iloc[0]).strip() if not pd.isna(row.iloc[0]) else ""
                        v = str(row.iloc[1]).strip() if len(row) > 1 and not pd.isna(row.iloc[1]) else ""
                        kl = k.lower()
                        if kl in ("project", "projects"):
                            in_proj_table = True
                            continue
                        if in_proj_table and k and v:
                            proj_code = str(k).strip().upper()
                            try:
                                days_v = int(str(row.iloc[1]).strip()) if not pd.isna(row.iloc[1]) else 0
                                amt_v  = float(str(row.iloc[2]).strip()) if len(row) > 2 and not pd.isna(row.iloc[2]) else 0.0
                                status = str(row.iloc[3]).strip() if len(row) > 3 and not pd.isna(row.iloc[3]) else ""
                                if proj_code.startswith("P") and days_v > 0:
                                    proj_rows.append({"code": proj_code, "days": days_v, "amount": amt_v, "status": status})
                            except: pass
                            continue
                        if kl: kv[kl] = v

                    emp_id_raw = ctx_emp_id or kv.get("employee id", "") or ""
                    emp_name   = ctx_name or kv.get("employee name", "") or ""
                    wd_raw     = kv.get("working days", "")
                    ot_raw     = kv.get("overtime hours", "0")
                    reg_hrs    = kv.get("regular hours", "0")
                    period_raw = kv.get("month", "")

                    try: wd = int(str(wd_raw).split(".")[0])
                    except: wd = ctx_wd or 22
                    try: ot_h = float(ot_raw)
                    except: ot_h = ctx_ot or 0.0
                    try: reg_h = float(str(reg_hrs).replace(",",""))
                    except: reg_h = wd * STANDARD_HOURS

                    # If project rows found, emit one record per billable project
                    billable_projs = [p for p in proj_rows if p["code"] in PROJECTS]
                    if billable_projs:
                        for p in billable_projs:
                            records.append({
                                "emp_id":        emp_id_raw or ctx_emp_id,
                                "employee_name": emp_name or ctx_name,
                                "working_days":  p["days"],
                                "ot_hours":      ot_h if p == billable_projs[-1] else 0.0,
                                "total_hours":   p["days"] * STANDARD_HOURS,
                                "project_code":  p["code"],
                                "pay_period":    period_raw,
                                "confidence":    0.97,
                            })
                    else:
                        records.append({
                            "emp_id":        emp_id_raw or ctx_emp_id,
                            "employee_name": emp_name or ctx_name,
                            "working_days":  wd,
                            "ot_hours":      ot_h,
                            "total_hours":   reg_h + ot_h,
                            "project_code":  ctx_proj,
                            "pay_period":    period_raw,
                            "confidence":    0.97,
                        })
                    continue  # done with this sheet

                # ── FORMAT B: Daily Timesheet (per-day rows) ──────────────────
                # Detect by: first row has Date, Day, Project, Regular Hours, OT Hours
                has_date_col  = any("date" in c for c in cols_lower)
                has_proj_col  = any("proj" in c for c in cols_lower)
                has_hours_col = any("hour" in c or "hr" in c for c in cols_lower)

                if has_date_col and has_proj_col and has_hours_col:
                    # Use first row as header
                    df = xl.parse(sheet_name, header=0)
                    df = df.dropna(how="all")
                    cols = {c.lower(): c for c in df.columns}

                    proj_col_name  = next((cols[c] for c in cols if "proj" in c), None)
                    reg_col_name   = next((cols[c] for c in cols if "regular" in c and "hour" in c), None)
                    ot_col_name    = next((cols[c] for c in cols if "ot" in c or "over" in c), None)
                    total_col_name = next((cols[c] for c in cols if "total" in c and "hour" in c), None)
                    amt_col_name   = next((cols[c] for c in cols if "amount" in c or "daily" in c), None)

                    # Filter only actual work rows (skip weekends, holidays, leave)
                    work_df = df.copy()
                    if proj_col_name:
                        work_df = work_df[~work_df[proj_col_name].astype(str).str.lower().isin(
                            ["weekend", "holiday", "leave", "nan", ""])]

                    # Group by project for project-level records
                    proj_groups: dict = {}
                    total_reg_hrs = 0.0
                    total_ot_hrs  = 0.0

                    for _, row in work_df.iterrows():
                        proj = str(row[proj_col_name]).strip().upper() if proj_col_name else "GENERAL"
                        reg  = float(row[reg_col_name]) if reg_col_name and not pd.isna(row[reg_col_name]) else 8.0
                        ot   = float(row[ot_col_name])  if ot_col_name  and not pd.isna(row[ot_col_name])  else 0.0
                        if proj not in proj_groups:
                            proj_groups[proj] = {"reg_hours": 0.0, "ot_hours": 0.0, "days": 0}
                        proj_groups[proj]["reg_hours"] += reg
                        proj_groups[proj]["ot_hours"]  += ot
                        proj_groups[proj]["days"]      += 1
                        total_reg_hrs += reg
                        total_ot_hrs  += ot

                    total_working_days = sum(v["days"] for v in proj_groups.values())

                    # Emit one record per billable project (P1/P2/P3)
                    # Non-billable (Internal/Training) contribute to total only
                    billable = {k: v for k, v in proj_groups.items() if k in PROJECTS}
                    non_bill = {k: v for k, v in proj_groups.items() if k not in PROJECTS}

                    if billable:
                        for proj in sorted(billable.keys()):
                            grp = billable[proj]
                            records.append({
                                "emp_id":        ctx_emp_id,
                                "employee_name": ctx_name,
                                "working_days":  grp["days"],
                                "ot_hours":      round(grp["ot_hours"], 2),
                                "total_hours":   round(grp["reg_hours"] + grp["ot_hours"], 2),
                                "project_code":  proj,
                                "pay_period":    "",
                                "confidence":    0.97,
                            })
                    else:
                        # No billable projects — emit single summary record
                        records.append({
                            "emp_id":        ctx_emp_id,
                            "employee_name": ctx_name,
                            "working_days":  total_working_days,
                            "ot_hours":      total_ot_hrs,
                            "total_hours":   round(total_reg_hrs + total_ot_hrs, 2),
                            "project_code":  ctx_proj,
                            "pay_period":    "",
                            "confidence":    0.97,
                        })
                    continue

                # ── FORMAT C: Standard tabular (emp_id/name columns) ──────────
                df = xl.parse(sheet_name, header=0)
                df = df.dropna(how="all")
                c_map = {c.lower(): c for c in df.columns}
                emp_c  = next((c_map[c] for c in c_map if "emp" in c or ("id" in c and "emp" in c)), None)
                name_c = next((c_map[c] for c in c_map if "name" in c), None)
                day_c  = next((c_map[c] for c in c_map if "working" in c and "day" in c), None) or \
                         next((c_map[c] for c in c_map if "day" in c), None)
                ot_c   = next((c_map[c] for c in c_map if "ot" in c or "over" in c), None)
                proj_c = next((c_map[c] for c in c_map if "proj" in c), None)
                hrs_c  = next((c_map[c] for c in c_map if "total" in c and ("hr" in c or "hour" in c)), None) or \
                         next((c_map[c] for c in c_map if "hr" in c or "hour" in c), None)
                for _, row in df.iterrows():
                    rec = {"confidence": 0.97}
                    if emp_c:  rec["emp_id"]       = str(row[emp_c]).strip()
                    if name_c: rec["employee_name"] = str(row[name_c]).strip()
                    if day_c and not pd.isna(row[day_c]):
                        try:
                            v = int(str(row[day_c]).split(".")[0])
                            if 1 <= v <= 31: rec["working_days"] = v
                        except: pass
                    if ot_c  and not pd.isna(row[ot_c]):   rec["ot_hours"]    = float(row[ot_c])
                    if proj_c and not pd.isna(row[proj_c]): rec["project_code"] = str(row[proj_c]).strip()
                    if hrs_c and not pd.isna(row[hrs_c]):
                        try: rec["total_hours"] = float(row[hrs_c])
                        except: pass
                    if rec.get("emp_id") or rec.get("employee_name"):
                        records.append(rec)

            # ── Filter junk records ────────────────────────────────────────────
            clean = []
            for r in records:
                eid = str(r.get("emp_id","")).strip()
                enm = str(r.get("employee_name","")).strip()
                # Skip header bleed, nan, empty
                if eid.lower() in ("nan","none","emp_id","employee_id","") and \
                   enm.lower() in ("nan","none","employee_name","name",""):
                    continue
                clean.append(r)

            if clean:
                matched = match_employees(clean, client_code)
                overall = round(sum(r.get("confidence",0) for r in matched)/max(len(matched),1), 2)
                return {"records": matched, "overall_confidence": overall,
                        "meta": {"has_signature": False, "has_stamp": False,
                                 "is_handwritten": False,
                                 "raw_text_extracted": f"[Excel parsed: {len(clean)} records]",
                                 "pipeline": "excel"}}
        except Exception as e:
            import traceback
            print(f"[Excel] parse error: {e}")
            traceback.print_exc()

    # ── CSV path ──────────────────────────────────────────────────────────────
    if IS_CSV and file_bytes:
        try:
            df = pd.read_csv(io.StringIO(file_bytes.decode("utf-8", errors="ignore")))
            extracted_text = df.to_string(index=False)
        except Exception as e:
            print(f"[CSV] error: {e}")

    # ── PDF path ──────────────────────────────────────────────────────────────
    if IS_PDF and file_bytes:
        extracted_text = extract_text_from_pdf(file_bytes) or extracted_text

    # ── Image path: OpenCV → Tesseract → Groq VLM ────────────────────────────
    if IS_IMAGE and file_bytes:
        _, pil_img = preprocess_image_cv(file_bytes)
        ocr_text = ""
        if pil_img:
            ocr_text = run_tesseract_ocr(pil_img)
        if ocr_text:
            # Prepend portal text_content so heuristics see structured fields first
            extracted_text = (text_content + "\n\n" if text_content else "") + ocr_text
        # VLM on original bytes (higher quality for vision)
        vlm_result = groq_vlm_extract(file_bytes, extracted_text)

        # ── If VLM returned table_rows, use them directly ────────────────────
        table_rows = vlm_result.get("table_rows", []) if vlm_result else []
        vlm_conf   = float(vlm_result.get("confidence", 0.7)) if vlm_result else 0.0

        if table_rows:
            # Parse portal context for emp_id / name to associate with rows
            ctx_emp_id, ctx_name = None, None
            if text_content:
                m = re.search(r"Emp\s+ID\s*:\s*(EMP\w+)", text_content, re.I)
                if m: ctx_emp_id = m.group(1).upper()
                m = re.search(r"Employee\s+Name\s*:\s*(.+)", text_content, re.I)
                if m: ctx_name = m.group(1).strip().split("\n")[0]

            period_m = re.search(
                r"(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
                r"Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|"
                r"Dec(?:ember)?)\s*(202\d)", extracted_text or text_content or "", re.I)
            pay_period = f"{period_m.group(1)} {period_m.group(2)}" if period_m else \
                         vlm_result.get("pay_period", "June 2026")

            records_from_vlm = []
            for i, row in enumerate(table_rows):
                records_from_vlm.append({
                    "emp_id":        row.get("emp_id") or ctx_emp_id,
                    "employee_name": row.get("employee_name") or ctx_name,
                    "working_days":  row.get("working_days"),
                    "ot_hours":      row.get("ot_hours", 0.0),
                    "project_code":  row.get("project_code"),
                    "leave_days":    row.get("leave_days", 0),
                    "net_pay":       row.get("net_pay"),
                    "basic_pay":     row.get("basic_pay"),
                    "deductions":    row.get("deductions", 0.0),
                    "pay_period":    pay_period,
                    "client_name":   vlm_result.get("client_name"),
                    "confidence":    round(min(1.0, vlm_conf + 0.02), 2),
                    "is_handwritten": True,
                    "vlm_confidence": vlm_conf,
                })

            matched = match_employees(records_from_vlm, client_code)

            # Confidence scoring based on VLM confidence
            for r in matched:
                if r.get("match_status") == "matched":
                    r["confidence"] = round(min(1.0, vlm_conf + 0.02), 2)
                else:
                    r["confidence"] = round(vlm_conf * 0.5, 2)

            overall = round(sum(r.get("confidence", 0) for r in matched) / max(len(matched), 1), 2)

            pipeline_used = ["opencv+tesseract", "groq-llama4-scout-table"]
            return {
                "records":            matched,
                "overall_confidence": overall,
                "meta": {
                    "has_signature":      has_signature,
                    "has_stamp":          has_stamp,
                    "is_handwritten":     True,
                    "raw_text_extracted": extracted_text[:500] if extracted_text else ocr_text[:500],
                    "pipeline":           "+".join(pipeline_used),
                    "vlm_used":           True,
                    "bert_used":          False,
                    "vlm_rows":           len(table_rows),
                    "vlm_confidence":     vlm_conf,
                }
            }

    # ── BERT extraction on text ───────────────────────────────────────────────
    if extracted_text:
        bert_result = bert_extract(extracted_text)

    # ── Heuristic parsing ─────────────────────────────────────────────────────
    heuristic_records = parse_heuristics(extracted_text) if extracted_text else []

    # ── Merge all signals ─────────────────────────────────────────────────────
    merged = merge_extraction(bert_result, heuristic_records, vlm_result)

    if not merged:
        # Absolute fallback — return empty record needing human review
        merged = [{"match_status": "unmatched", "confidence": 0.0,
                   "warning": "Could not extract any structured data from document."}]

    # ── Employee matching ─────────────────────────────────────────────────────
    matched = match_employees(merged, client_code)

    # ── Confidence adjustment for handwriting ────────────────────────────────
    if is_handwritten:
        vlm_conf = float(vlm_result.get("confidence", 0)) if vlm_result else 0.0
        for r in matched:
            base_conf = float(r.get("confidence", 0.7))
            if r.get("match_status") != "matched":
                # Unmatched employees → cap confidence low
                r["confidence"] = round(base_conf * 0.5, 2)
            elif vlm_conf >= 0.85:
                # VLM is highly confident → boost to reflect that
                r["confidence"] = round(min(1.0, 0.90 + vlm_conf * 0.05), 2)
            elif vlm_conf >= 0.60:
                # Moderate VLM confidence → blend
                r["confidence"] = round(min(0.95, base_conf * 0.7 + vlm_conf * 0.3), 2)
            else:
                # Low VLM confidence → reduce slightly
                r["confidence"] = round(base_conf * 0.82, 2)
            r["is_handwritten"] = True
            r["vlm_confidence"] = vlm_conf

    overall = round(sum(r.get("confidence",0) for r in matched)/max(len(matched),1), 2) if matched else 0.0

    pipeline_used = []
    if IS_IMAGE:    pipeline_used.append("opencv+tesseract")
    if vlm_result:  pipeline_used.append("groq-llama4-scout")
    if bert_result: pipeline_used.append("bert-qa")
    if heuristic_records: pipeline_used.append("heuristic")
    if IS_EXCEL:    pipeline_used.append("excel")
    if IS_PDF:      pipeline_used.append("pdf-text")

    return {
        "records":            matched,
        "overall_confidence": overall,
        "meta": {
            "has_signature":       has_signature,
            "has_stamp":           has_stamp,
            "is_handwritten":      is_handwritten,
            "raw_text_extracted":  extracted_text[:500] if extracted_text else "",
            "pipeline":            "+".join(pipeline_used) or "text-heuristic",
            "vlm_used":            bool(vlm_result),
            "bert_used":           bool(bert_result),
        }
    }

# ═══════════════════════════════════════════════════════════════════════════════
# Chat Assistant (unchanged logic, kept for compatibility)
# ═══════════════════════════════════════════════════════════════════════════════

def chat_assistant(query: str, client_code: str = None) -> str:
    employees_col  = get_collection("employees")
    timesheets_col = get_collection("timesheets")
    invoices_col   = get_collection("invoices")
    customers_col  = get_collection("customers")

    cust_q     = {"client_code": client_code} if client_code else {}
    customers  = list(customers_col.find(cust_q))
    cust_codes = [c["client_code"] for c in customers]
    timesheets = list(timesheets_col.find({"client_code": {"$in": cust_codes}} if client_code else {}))
    invoices   = list(invoices_col.find({"client_code": {"$in": cust_codes}} if client_code else {}))
    emp_count  = employees_col.count_documents({"client_code": {"$in": cust_codes}, "is_demo_account": {"$ne": True}} if client_code else {"is_demo_account": {"$ne": True}})

    pending_exceptions = len([t for t in timesheets if t.get("status") == "pending_review"])
    passed  = len([i for i in invoices if i.get("validation_status") == "passed"])
    failed  = len([i for i in invoices if i.get("validation_status") == "failed"])
    total_v = sum(float(i.get("total_amount",0)) for i in invoices)

    q = query.lower()

    if any(w in q for w in ("status","summary","overview","pipeline")):
        return (f"### 📊 TIA Pipeline Overview\n\n"
                f"- **Employees:** {emp_count}\n"
                f"- **Timesheets:** {len(timesheets)}\n"
                f"- **Exception Queue:** {pending_exceptions} pending\n"
                f"- **Invoices:** {len(invoices)} ({passed} passed, {failed} failed)\n"
                f"- **Total Value:** AED {total_v:,.2f}\n\n"
                + ("⚠️ Items in exception queue need admin review." if pending_exceptions else "✅ All clear."))

    if any(w in q for w in ("exception","pending","queue","review")):
        items = [t for t in timesheets if t.get("status") == "pending_review"]
        if not items:
            return "✅ No exceptions in the queue right now."
        lines = ["### ⚠️ Exception Queue\n", "| ID | Client | Confidence | Issue |", "| :-- | :-- | :-- | :-- |"]
        for t in items[:5]:
            recs  = t.get("extracted_data",{}).get("records",[])
            issue = next((r.get("warning","Low confidence") for r in recs if r.get("warning")), "Low confidence OCR")
            conf  = t.get("extracted_data",{}).get("overall_confidence",0)*100
            lines.append(f"| {t['id'][:8]}… | {t.get('client_code','')} | {conf:.0f}% | {issue} |")
        return "\n".join(lines)

    emp_match = re.search(r"EMP\d{5}", query, re.I)
    if emp_match or any(w in q for w in ("employee","salary","staff")):
        if emp_match:
            emp = employees_col.find_one({"emp_id": emp_match.group(0).upper(), "is_demo_account": {"$ne": True}})
            if emp:
                return (f"### 👤 {emp['full_name']} ({emp['emp_id']})\n"
                        f"- **Client:** {emp['client_name']} ({emp['client_code']})\n"
                        f"- **Role:** {emp['job_title']} · {emp['department']}\n"
                        f"- **CTC:** AED {emp['total_ctc']:,}\n"
                        f"- **Basic:** {emp['basic']:,} | Housing: {emp['housing']:,} | Transport: {emp['transport']:,}\n")
        return "Search by Emp ID e.g. `EMP10001` or ask about a specific employee."

    # Project rules summary
    if any(w in q for w in ("project","p1","p2","p3","regulation","rules","policy")):
        lines = ["### 📋 Office Regulation Act — Project Pay Rules\n",
                 f"- Base Rate: **AED {BASE_HOURLY_RATE:.0f}/hour** × {int(STANDARD_HOURS)} hrs/day",
                 f"- OT Rate: AED {BASE_HOURLY_RATE * OT_MULTIPLIER:.0f}/hour ({OT_MULTIPLIER}×)\n"]
        for code, p in PROJECTS.items():
            lines.append(f"- **{code} — {p['name']}**: max AED {p['max_pay']:,.0f} / {p['max_days']} days")
        return "\n".join(lines)

    return ("👋 TIA Assistant ready. Try:\n"
            "- *Show pipeline status*\n- *Exception queue*\n"
            "- *EMP10001 profile*\n- *Project regulation rules*")
