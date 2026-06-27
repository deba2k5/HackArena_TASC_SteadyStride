"""
Database seeder — loads TASC_Sample_Database_vF.xlsx into MongoDB (or JSON fallback).
Searches several paths for the Excel file automatically.
"""
import os
import sys
import json
import pandas as pd
from db import get_collection

EXCEL_SEARCH_PATHS = [
    # Relative to this file
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "pages", "TASC_Sample_Database_vF.xlsx"),
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "TASC_Sample_Database_vF.xlsx"),
    # Absolute paths that might exist on this machine
    r"C:\Users\Debangshu05\Downloads\expensify-esque-main\expensify-esque-main\src\pages\TASC_Sample_Database_vF.xlsx",
    r"C:\Users\Debangshu05\Downloads\Supporting Documents - Touchless Agent\For Contestants\TASC_Sample_Database_vF.xlsx",
]

def find_excel():
    for p in EXCEL_SEARCH_PATHS:
        if os.path.exists(p):
            return p
    return None

def seed_db():
    xlsx_path = find_excel()
    if not xlsx_path:
        print("ERROR: Excel file not found. Searched paths:")
        for p in EXCEL_SEARCH_PATHS:
            print("  ", p)
        return False

    print(f"Reading Excel: {xlsx_path}")
    xl = pd.ExcelFile(xlsx_path)

    # ── 1. Customers ──────────────────────────────────────────────────────────
    customers_df = xl.parse("Customers")
    customers_col = get_collection("customers")
    customers_col.delete_many({})

    DISPATCH_RULES = {
        "CL001": "spend_ascending", "CL002": "spend_descending",
        "CL003": "spend_ascending", "CL004": "spend_descending",
        "CL005": "spend_ascending", "CL006": "spend_descending",
        "CL007": "spend_ascending", "CL008": "spend_descending",
        "CL009": "spend_ascending", "CL010": "spend_descending",
    }
    OT_LIMITS = {"CL005": 5}

    customers_list = []
    for _, row in customers_df.iterrows():
        cc = str(row["Client Code"]).strip()
        cust = {
            "client_code": cc,
            "client_name": str(row["Client Name"]).strip(),
            "city": str(row["City"]).strip(),
            "industry": str(row["Industry"]).strip(),
            "contact_email": str(row["Contact Email"]).strip(),
            "status": str(row["Status"]).strip(),
            "input_channels": ["email", "portal", "excel", "handwriting"],
            "dispatch_rule": DISPATCH_RULES.get(cc, "spend_ascending"),
            "validation_profile": {
                "max_ot_hours_limit": OT_LIMITS.get(cc, 15),
                "allow_variance": True,
                "max_salary_variance_pct": 5.0,
                "require_signature": cc in ("CL001", "CL002", "CL004"),
            },
        }
        customers_list.append(cust)

    customers_col.insert_many(customers_list)
    print(f"  Seeded {len(customers_list)} customers.")

    # ── 2. Employees ──────────────────────────────────────────────────────────
    employees_df = xl.parse("Employees")
    employees_col = get_collection("employees")
    employees_col.delete_many({})

    employees_list = []
    for _, row in employees_df.iterrows():
        emp = {
            "emp_id": str(row["Emp ID"]).strip(),
            "full_name": str(row["Full Name"]).strip(),
            "first_name": str(row["First Name"]).strip(),
            "last_name": str(row["Last Name"]).strip(),
            "email": str(row["Email"]).strip().lower(),
            "client_code": str(row["Client Code"]).strip(),
            "client_name": str(row["Client Name"]).strip(),
            "job_title": str(row["Job Title"]).strip(),
            "department": str(row["Department"]).strip(),
            "nationality": str(row["Nationality"]).strip(),
            "date_of_joining": str(row["Date of Joining"]).strip(),
            "status": str(row["Status"]).strip(),
            "iban": str(row["IBAN"]).strip(),
            "basic": int(row["Basic"]),
            "housing": int(row["Housing"]),
            "transport": int(row["Transport"]),
            "food": int(row["Food"]),
            "phone": int(row["Phone"]),
            "total_ctc": int(row["Total CTC"]),
        }
        employees_list.append(emp)

    employees_col.insert_many(employees_list)
    print(f"  Seeded {len(employees_list)} employees.")

    # ── 3. Payroll Reference ──────────────────────────────────────────────────
    payroll_df = xl.parse("Payroll_June2026")
    payroll_col = get_collection("payroll_reference")
    payroll_col.delete_many({})

    payroll_list = []
    for _, row in payroll_df.iterrows():
        pay = {
            "emp_id": str(row["Emp ID"]).strip(),
            "employee_name": str(row["Employee Name"]).strip(),
            "client_code": str(row["Client Code"]).strip(),
            "client_name": str(row["Client Name"]).strip(),
            "pay_period": str(row["Pay Period"]).strip(),
            "basic": float(row["Basic"]),
            "housing": float(row["Housing"]),
            "transport": float(row["Transport"]),
            "food": float(row["Food"]),
            "phone": float(row["Phone"]),
            "gross": float(row["Gross"]),
            "ot_hours": float(row["OT Hours"]),
            "ot_amount": float(row["OT Amount"]),
            "deductions": float(row["Deductions"]),
            "net_pay": float(row["Net Pay"]),
            "currency": str(row["Currency"]).strip(),
            "working_days": int(row["Working Days"]),
        }
        payroll_list.append(pay)

    payroll_col.insert_many(payroll_list)
    print(f"  Seeded {len(payroll_list)} payroll records.")

    # ── 4. Reset transactional collections ───────────────────────────────────
    for col_name in ("timesheets", "invoices", "queries", "audit_logs", "sessions"):
        get_collection(col_name).delete_many({})

    # Seed audit log
    import uuid
    from datetime import datetime
    get_collection("audit_logs").insert_one({
        "id": str(uuid.uuid4()),
        "actor": "system",
        "action": "database_seed",
        "target": "all",
        "at": datetime.utcnow().isoformat(),
        "meta": {
            "customers_seeded": len(customers_list),
            "employees_seeded": len(employees_list),
            "payroll_seeded": len(payroll_list),
        },
    })

    print("Database seeding complete.")
    return True


if __name__ == "__main__":
    ok = seed_db()
    sys.exit(0 if ok else 1)
