# Touchless Invoice Agent (TIA)

**TIA** is a full-stack, Agentic AI-orchestrated pipeline designed to completely automate the end-to-end workflow of generating client invoices from raw, unstructured timesheet inputs. 

Built for the **TASC HackArena: Steady Stride** challenge, this solution demonstrates how AI can replace manual data entry, human verification, and rules-based dispatching in complex payroll operations.

---

## 🚀 How It Works & Automation Pipeline

The TIA pipeline is broken down into four major autonomous steps:

### 1. Ingestion & Agentic Extraction
Clients submit timesheets via multiple unstructured channels (e.g., pasting the body of a messy email, uploading a PDF, or an Excel file). 
- **The Automation:** A Gemini-powered AI Agent (`agent.py`) intercepts the unstructured data and uses function calling and strict Pydantic schemas to intelligently extract the core intent: Employee Names, IDs, Working Days, Overtime Hours, and Leaves.
- **Handling Ambiguity:** The agent acts as a fuzzy-matcher. If a client writes "John S." but the master database has "John Smith" and "John Snow", the AI flags an `ambiguity` and routes it to the FinOps Exception Queue. If it's a perfect match, it proceeds silently.

### 2. Simulated ERP Payroll Processing
Once the timesheet is structured and matched to valid employees in the master database, it enters the ERP calculation engine.
- **The Automation:** The system automatically references the employee's Master Profile to pull their Basic, Housing, Transport, and Food allowances. It calculates their Overtime Amount, applies any simulated deductions, and computes the final Gross and Net Pay.
- **Line Items:** The output is a fully formatted Invoice containing detailed Line Items for each employee.

### 3. Business Rules Validation (BTP Profile)
Before an invoice can be sent, it must pass the client's specific business rules.
- **The Automation:** The validator engine checks the invoice against the `validation_profile` configured for that client. For example, if a client's rule is `max_ot_hours_limit = 20`, and an employee billed 25 OT hours, the invoice automatically fails validation and is flagged for Finance review.

### 4. Dispatch & Tracking
Invoices that pass validation are queued in the Dispatch Tracker.
- **The Automation:** Finance can execute the dispatch runner with a single click. The runner automatically applies the client's `dispatch_rule` (e.g., "Sort descending by Net Pay") and pushes the invoices out to the client portal.
- Clients can log into their portal, download the finalized CSV invoices, and raise query tickets if they spot discrepancies.

---

## 🏗️ Architecture & Detailed User Flow

The application is built on a modern decoupled architecture (FastAPI Backend + React Frontend + Firebase Auth), featuring a seamless multi-persona user flow that allows the invoice to travel from creation to dispatch automatically. 

Here is exactly how the **User Flow** works across the three distinct personas:

### 1. The Client Persona (The Source)
The workflow begins at the client level. Clients are external entities who need to submit payroll data.
- **Action:** A client logs into the portal and navigates to the **Submit Timesheet** screen.
- **Input Channels:** They can upload a raw, messy email text, an unstructured PDF, or a structured Excel file.
- **Result:** They click "Submit". The file is sent to the backend where the **Local BERT Model** agentically extracts the hidden entities (Employee Names, Working Days, OT).
- **Post-Dispatch:** Later in the flow, the client will use this same portal to view their finalized invoices and raise discrepancy tickets.

### 2. The FinOps Persona (The Human-In-The-Loop)
While the AI processes 90% of timesheets completely touchless, edge cases require human intervention.
- **Action:** The FinOps operator logs into the **Approvals & Exceptions Dashboard**.
- **The Queue:** Any timesheet where the BERT model scored low confidence, or where a name like "John S." matched multiple people in the master database (an **ambiguity**), lands in this queue.
- **Resolution:** The FinOps operator sees the raw timesheet text side-by-side with the AI's extraction. They can select the correct employee from a dropdown of candidates and click "Approve". The timesheet then proceeds to the ERP engine for mathematical processing.

### 3. The Finance Persona (The Dispatcher)
Finance handles the high-level metrics and the final outgoing billing.
- **Action:** The Finance operator logs into the **Analytics Dashboard**. Here they can monitor the Touchless Processing Rate (%) and total invoiced AED.
- **Configuration:** Finance sets client-specific **Business Rules** (e.g., "Max OT Hours = 15"). The backend ERP engine applies these rules during generation. If a timesheet violates them, the generated invoice is marked as `failed` validation.
- **Dispatch:** Finance navigates to the **Dispatch Tracker**, reviews the queued invoices that passed validation, and clicks **Execute Dispatch**. The invoices are automatically sorted according to the client's preferred rules (e.g., "Sort descending by Net Pay") and sent back to the Client portal!

---

## 🧠 Agentic AI & RAG Pipeline

The application eliminates third-party API wrappers entirely, relying on local Hugging Face Models for privacy and data compliance.

### 1. The RAG Engine (ChromaDB + Sentence Transformers)
When a user asks a natural language question in the Chat Assistant (e.g., "What is Aisha's basic salary?"):
1. The user's query is embedded using a `sentence-transformers` model.
2. We query **ChromaDB** (`tia_knowledge` collection), which was seeded with all employee and client metadata during initialization.
3. ChromaDB returns the exact chunk of text containing the relevant employee's profile.

### 2. The Extraction Agent (RoBERTa QA)
Once the exact context is retrieved from ChromaDB, or when a raw timesheet is uploaded:
1. We pass the context into a **Local BERT QA Pipeline** (`deepset/roberta-base-squad2`).
2. The agent asks deterministic questions against the context (e.g., "What is the employee ID?").
3. The extracted answers are structured into JSON and passed to the backend ERP system.

### 3. Training Your Own Agent
To fulfill the requirement of a fully custom-trained agent, we provide a fine-tuning script:
- Run `python backend/train_bert.py`
- This script uses the `transformers` Trainer API to fine-tune `distilbert-base-uncased` for Token Classification (NER) on synthetic timesheet data. 
- It outputs the weights into a `local_bert_timesheet_model` folder, which you can load directly into the extraction pipeline.

---

## ⚙️ Setup & Installation

### Prerequisites
- Node.js (v18+)
- Python (3.10+)

### 1. Start the Backend
Navigate to the `backend` directory, install the Python requirements, and start the FastAPI server:

```bash
cd backend
python -m venv venv
# On Windows: venv\Scripts\activate
# On Mac/Linux: source venv/bin/activate
pip install -r requirements.txt

# Start the server on port 5000
python app.py
```

### 2. Start the Frontend
In a new terminal, navigate to the `frontend` directory, install dependencies, and start the Vite dev server:

```bash
cd frontend
npm install
npm run dev -- --port 5173
```

### 3. Seed the Database
1. Open your browser to `http://localhost:5173`
2. **Sign up / Sign in** using the Firebase authentication screen.
3. Once logged in, click the **"Seed Master Database"** button in the top navigation bar. This will read the `TASC_Sample_Database_vF.xlsx` file and populate the system with the 10 clients and 200 employees required for the demo.

### 4. Run the Demo!
- **As a Client:** Go to "Submit Timesheet" and paste a messy email requesting payroll for an employee.
- **As FinOps:** Switch personas (top right) to FinOps. Check the "Exception Queue" to see if the AI successfully extracted the data or if it needs manual confirmation.
- **As Finance:** Switch to the Finance Dashboard. Go to "Dispatch & Tracking" and hit "Execute Dispatch" to finalize the invoice!

---

*Developed for the HackArena TASC Steady Stride Challenge.*
