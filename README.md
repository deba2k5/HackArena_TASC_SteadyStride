# TIA — Touchless Invoice Agent

> AI-powered touchless payroll & timesheet processing platform built for the TASC Outsourcing Hackathon.

---

## What It Does

TIA (Touchless Invoice Agent) automates the full lifecycle of timesheet ingestion → invoice generation → payroll dispatch with zero manual intervention when confidence is high enough.

**Employee** submits a timesheet (handwritten image, Excel, PDF, email text) → **AI pipeline** extracts employee data, working days, project codes, pay amounts → **Invoice generated** at AED 500/hr × 8 hrs/day → **Auto-dispatched** if confidence ≥ 90%.

---

## Architecture Overview

```
Employee Portal (React)
        │
        │  multipart/form-data (image / xlsx / pdf / text)
        ▼
FastAPI Backend (Python)
        │
        ├─► OpenCV  ──► Tesseract OCR  ──► Groq Llama-4 Scout VLM
        │                                        │
        │                                        ▼
        ├─► BERT QA (RoBERTa-base-squad2) ──► Field Merge
        │                                        │
        │                                        ▼
        ├─► Heuristic / Regex Parser ────► Employee Match (MongoDB)
        │                                        │
        │                                        ▼
        └─► Invoice Generation ──► Validation ──► Auto-Dispatch
                                                   │
                                             MongoDB Atlas
```

---

## Tech Stack

### Frontend

| Technology | Version | Role |
|---|---|---|
| **React** | 18.3 | UI framework |
| **TypeScript** | 5.8 | Type safety |
| **Vite** | 5.4 | Build tool + dev server |
| **Tailwind CSS** | 3.4 | Styling |
| **shadcn/ui + Radix UI** | latest | Component library |
| **TanStack Query** | 5.x | Server state, caching, auto-refetch |
| **React Router v6** | 6.30 | Client-side routing |
| **Recharts** | 2.x | Dashboard charts |
| **Lucide React** | 0.462 | Icons |
| **Sonner** | 1.7 | Toast notifications |
| **jsPDF + AutoTable** | 4.x | PDF export |
| **Firebase** | 12.x | Authentication |

### Backend

| Technology | Version | Role |
|---|---|---|
| **Python** | 3.11+ | Runtime |
| **FastAPI** | 0.111 | REST API + WebSocket |
| **Uvicorn** | 0.30 | ASGI server |
| **MongoDB Atlas** | cloud | Primary database |
| **PyMongo** | 4.7 | MongoDB driver |
| **Pydantic** | 2.7 | Request/response validation |
| **Pandas** | 2.2 | Excel/CSV parsing |
| **python-dotenv** | 1.0 | Environment config |

### Database

- **MongoDB Atlas** — cloud-hosted NoSQL. Collections: `timesheets`, `invoices`, `employees`, `customers`, `queries`, `audit_logs`, `sessions`, `payroll_reference`
- **JSON fallback** — local JSON files in `backend/data/` used when MongoDB is unavailable

---

## AI / ML Pipeline

### Step 1 — OpenCV Image Preprocessing
```
Library: opencv-python-headless 4.10 + Pillow 10.4
```
Applied to handwritten/scanned images before OCR:
- Shadow removal via morphological dilation + median blur
- CLAHE contrast enhancement (L channel in LAB color space)
- Fast Non-Local Means denoising
- Deskew via Hough line detection
- Image sharpening (unsharp mask)
- Upscaling to minimum 1200px width for better OCR

### Step 2 — Tesseract OCR
```
Library: pytesseract 0.3.13
Config:  --psm 6 --oem 3 (uniform block of text, LSTM engine)
```
Converts preprocessed images into raw text. Used as input for both BERT and Groq VLM. Falls back to pdf2image for scanned PDFs.

### Step 3 — Groq Llama-4 Scout VLM (Primary AI)
```
Model:   meta-llama/llama-4-scout-17b-16e-instruct
API:     Groq Cloud (groq SDK 0.9.0)
Mode:    Vision Language Model — reads the image directly
Temp:    0.05 (near-deterministic)
```
The **main AI brain** for handwritten timesheets. Given the image + OCR pre-read, it extracts:
- `table_rows[]` — one object per employee row visible in the image
- Each row: `employee_name`, `emp_id`, `working_days`, `ot_hours`, `basic_pay`, `deductions`, `net_pay`, `project_code`
- `confidence` — self-reported extraction confidence (0.0–1.0)
- `client_name`, `pay_period`

**Post-extraction validation:**
- `working_days` rejected if not 1–31 (prevents year-as-days bugs)
- `project_code` must be exactly `P1`, `P2`, or `P3`
- Monetary fields stripped of currency symbols and validated as positive floats

### Step 4 — BERT Question Answering (Supporting)
```
Model:   deepset/roberta-base-squad2
Library: transformers 4.41.2 + torch 2.3.1
```
Run on OCR text to fill gaps the VLM may miss. Asks structured questions:
- "What is the employee ID or EMP number?"
- "How many days did the employee work?"
- "What is the project code?"
- etc.

Only fields with score > 0.15 are used. BERT results are merged into the base record but are overridden by VLM when both provide a value.

### Step 5 — Regex Heuristic Parser
```
Custom rule engine — no external library
```
Handles structured text formats (portal enrichment, email bodies, bulk name lists). Recognises:
- **Format A** — Portal enriched text: `Emp ID: EMP10001\nWorking Days: 22`
- **Format B** — Monthly Summary Excel: key-value layout with project breakdown
- **Format C** — Daily Timesheet Excel: per-day rows aggregated by project
- **Format D** — Bulk name lists: `Carlos Smith: 24 days`
- **Format E** — Email/payout requests: `payout for John Smith, gross AED 15,000`

### Step 6 — Employee Identity Resolution
```
Source: MongoDB employees collection (200+ records across 10 clients)
```
Each extracted record is matched against the master employee database:
- **Primary**: exact `emp_id` match (`EMP10001` → Carlos Smith)
- **Secondary**: fuzzy full name match with client scoping
- **Result**: `matched` (1:1), `ambiguous` (multiple candidates), `unmatched` (not found)
- Confidence: 0.95 for exact match, 0.82 for scoped name match, 0.20 for unmatched

### Step 7 — Billing Calculation (Office Regulation Act)
```
Rule:  AED 500 / hour × 8 hours / day
OT:    AED 500 × 1.5 = AED 750 / hour
```
Project caps:
| Project | Name | Max Pay | Max Days |
|---|---|---|---|
| P1 | Alpha Infrastructure | AED 24,000 | 6 days |
| P2 | Beta Integration | AED 20,000 | 5 days |
| P3 | Gamma Support | AED 16,000 | 4 days |

If the VLM extracted explicit `net_pay` from the handwritten document, that value is used directly (trusted over calculation). Otherwise, `working_days × 8 × 500 + ot_hours × 750`, capped at project maximum.

### Step 8 — Invoice Validation
Business rules checked:
- Unresolved employees (no valid Emp ID)
- OT hours exceeding client limit (default 15h)
- Gross component sum mismatch

### Step 9 — Auto-Dispatch Logic
```
Threshold: confidence ≥ 0.90 AND all employees matched
```
When both conditions are true, the timesheet is immediately:
1. Marked `processed` + `is_touchless: true`
2. Invoice generated
3. Invoice force-approved (`validation_status: passed`)
4. Invoice dispatched (`dispatch_status: dispatched`)

Below 90%: routed to the **Exception Queue** (HITL — Human-in-the-Loop) for admin review, correction, and manual approval.

---

## Custom Fine-tuned BERT Model

```
Base:      bert-base-uncased
Task:      Question Answering (timesheet field extraction)
Location:  backend/local_bert_timesheet_model/
Files:     model.safetensors, tokenizer.json, config.json
Training:  backend/train_bert.py (1 checkpoint)
```
A locally fine-tuned BERT model specifically trained on timesheet-style QA pairs. Used as a local alternative/supplement to the cloud VLM for text-based extractions. Loaded lazily on first use via HuggingFace `transformers` pipeline.

---

## Supported Input Formats

| Format | Processing Path | Accuracy |
|---|---|---|
| Handwritten image (JPG/PNG) | OpenCV → Tesseract → Groq VLM | High (VLM-dependent) |
| Excel — Monthly Summary | Pandas key-value parser | ~97% |
| Excel — Daily Timesheet | Pandas per-day aggregator | ~97% |
| PDF (text-based) | pypdf text extraction | ~90% |
| PDF (scanned) | pdf2image → Tesseract | ~75% |
| Email / plain text | Heuristic regex parser | ~85% |
| CSV | Pandas + heuristics | ~90% |

---

## Project Structure

```
expensify-esque-main/
├── backend/
│   ├── main.py              # FastAPI app, all routes, auto-dispatch logic
│   ├── agent.py             # Full AI pipeline (Steps 1–9)
│   ├── db.py                # MongoDB + JSON fallback adapter
│   ├── seed.py              # Database seeder (employees, customers)
│   ├── train_bert.py        # BERT fine-tuning script
│   ├── local_bert_timesheet_model/   # Fine-tuned BERT weights
│   ├── data/                # JSON fallback data files
│   ├── Daily_Timesheet_June_2026.xlsx
│   ├── Monthly_Timesheet_Summary_June_2026.xlsx
│   ├── requirements.txt
│   └── .env                 # API keys, thresholds, project rules
│
├── src/
│   ├── pages/
│   │   ├── admin/
│   │   │   ├── AdminDashboard.tsx
│   │   │   ├── AdminTimesheets.tsx
│   │   │   ├── AdminInvoices.tsx
│   │   │   ├── AdminPendingReports.tsx   # HITL exception queue
│   │   │   ├── AdminEmployees.tsx
│   │   │   └── AdminAuditLog.tsx
│   │   └── employee/
│   │       └── EmployeeTimesheetPortal.tsx  # Submit + VLM result panel
│   ├── lib/
│   │   ├── api.ts            # All API calls
│   │   └── types.ts          # TypeScript interfaces
│   └── contexts/
│       └── AuthContext.tsx   # Firebase auth
│
└── package.json
```

---

## Environment Variables

```env
# Database
MONGODB_URI=mongodb+srv://...
MONGODB_DB=tia_platform

# Groq VLM (Llama-4 Scout)
GROQ_API_KEY=gsk_...

# Billing Rules (Office Regulation Act)
BASE_HOURLY_RATE_AED=500
STANDARD_HOURS_PER_DAY=8
OT_MULTIPLIER=1.5

# Project Caps: NAME|MAX_PAY_AED|MAX_DAYS
PROJECT_1=Alpha Infrastructure|24000|6
PROJECT_2=Beta Integration|20000|5
PROJECT_3=Gamma Support|16000|4

# Confidence Thresholds
CONFIDENCE_THRESHOLD=0.70          # below this → pending_review
AUTO_DISPATCH_THRESHOLD=0.90       # above this → auto-approve + dispatch
```

---

## Running Locally

### Backend
```bash
cd backend
pip install -r requirements.txt
python main.py
# API runs at http://localhost:5000
```

### Frontend
```bash
npm install
npm run dev
# UI runs at http://localhost:8080
```

---

## Demo Credentials

| Role | Email | Password |
|---|---|---|
| Admin | admin@gmail.com | admin123 |
| Employee | employee@gmail.com | employee123 |

---

## Key Features

- **Touchless processing** — ≥90% confidence timesheets are fully processed without any human touch
- **Multi-format ingestion** — handwriting, Excel, PDF, email, CSV
- **Groq Llama-4 Scout VLM** — reads tabular handwritten data (Days / Basic / Deductions / Net Pay)
- **Real-time WebSocket** — live updates across admin and employee dashboards
- **HITL Exception Queue** — admin can correct and re-approve low-confidence extractions
- **Audit trail** — every action logged with actor, timestamp, and metadata
- **Project billing caps** — Office Regulation Act rules enforced automatically
- **Employee query system** — employees can raise disputes against specific invoices

---

## Data Flow Diagram

```
SUBMIT
  │
  ├─[image]──► OpenCV ──► Tesseract ──► Groq VLM ──────────────┐
  │                                                              │
  ├─[excel]──► Pandas (Format A/B/C detector) ─────────────────┤
  │                                                              │
  ├─[pdf]───► pypdf / pdf2image+Tesseract ─────────────────────┤
  │                                                              ▼
  └─[text]───► Regex Heuristic Parser ─────────► Merge Layer
                                                      │
                                           BERT QA fills gaps
                                                      │
                                           Employee Matching
                                           (MongoDB lookup)
                                                      │
                                           ┌──────────┴──────────┐
                                        matched?             not matched?
                                           │                      │
                                    conf ≥ 90%?           → Exception Queue
                                       │      │
                                      YES     NO
                                       │      │
                                  Auto      Pending
                                 Dispatch   Review
                                       │
                              Invoice Generated
                              (500/hr × 8hr/day)
                                       │
                              validation_status: passed
                              dispatch_status: dispatched
```
