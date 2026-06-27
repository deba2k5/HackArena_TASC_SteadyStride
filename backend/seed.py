import os
import pandas as pd
from db import get_collection

def seed_db():
    base_dir = r"C:\Users\Debangshu05\Downloads\Supporting Documents - Touchless Agent\For Contestants"
    xlsx_path = os.path.join(base_dir, "TASC_Sample_Database_vF.xlsx")
    
    if not os.path.exists(xlsx_path):
        print(f"Error: Excel file not found at {xlsx_path}")
        return False
        
    print("Reading Excel sheets...")
    xl = pd.ExcelFile(xlsx_path)
    
    # 1. Customers
    customers_df = xl.parse("Customers")
    customers_col = get_collection("customers")
    customers_col.delete_many({}) # Clear
    
    customers_list = []
    for _, row in customers_df.iterrows():
        client_code = str(row['Client Code']).strip()
        client_name = str(row['Client Name']).strip()
        city = str(row['City']).strip()
        industry = str(row['Industry']).strip()
        email = str(row['Contact Email']).strip()
        status = str(row['Status']).strip()
        
        # Build customer config
        cust = {
            "client_code": client_code,
            "client_name": client_name,
            "city": city,
            "industry": industry,
            "contact_email": email,
            "status": status,
            "input_channels": ["email", "portal", "timesheet_app"],
            "dispatch_rule": "spend_ascending" if client_code in ["CL001", "CL003", "CL005"] else "spend_descending",
            "validation_profile": {
                "max_ot_hours_limit": 15 if client_code != "CL005" else 5,
                "allow_variance": True,
                "max_salary_variance_pct": 5.0,
                "require_signature": True if client_code in ["CL001", "CL002", "CL004"] else False
            }
        }
        customers_list.append(cust)
    
    customers_col.insert_many(customers_list)
    print(f"Seeded {len(customers_list)} customers.")

    # 2. Employees
    employees_df = xl.parse("Employees")
    employees_col = get_collection("employees")
    employees_col.delete_many({}) # Clear
    
    employees_list = []
    for _, row in employees_df.iterrows():
        emp = {
            "emp_id": str(row['Emp ID']).strip(),
            "full_name": str(row['Full Name']).strip(),
            "first_name": str(row['First Name']).strip(),
            "last_name": str(row['Last Name']).strip(),
            "email": str(row['Email']).strip(),
            "client_code": str(row['Client Code']).strip(),
            "client_name": str(row['Client Name']).strip(),
            "job_title": str(row['Job Title']).strip(),
            "department": str(row['Department']).strip(),
            "nationality": str(row['Nationality']).strip(),
            "date_of_joining": str(row['Date of Joining']).strip(),
            "status": str(row['Status']).strip(),
            "iban": str(row['IBAN']).strip(),
            "basic": int(row['Basic']),
            "housing": int(row['Housing']),
            "transport": int(row['Transport']),
            "food": int(row['Food']),
            "phone": int(row['Phone']),
            "total_ctc": int(row['Total CTC'])
        }
        employees_list.append(emp)
        
    employees_col.insert_many(employees_list)
    print(f"Seeded {len(employees_list)} employees.")

    # 3. Payroll June 2026 Reference
    payroll_df = xl.parse("Payroll_June2026")
    payroll_ref_col = get_collection("payroll_reference")
    payroll_ref_col.delete_many({}) # Clear
    
    payroll_list = []
    for _, row in payroll_df.iterrows():
        pay = {
            "emp_id": str(row['Emp ID']).strip(),
            "employee_name": str(row['Employee Name']).strip(),
            "client_code": str(row['Client Code']).strip(),
            "client_name": str(row['Client Name']).strip(),
            "pay_period": str(row['Pay Period']).strip(),
            "basic": float(row['Basic']),
            "housing": float(row['Housing']),
            "transport": float(row['Transport']),
            "food": float(row['Food']),
            "phone": float(row['Phone']),
            "gross": float(row['Gross']),
            "ot_hours": float(row['OT Hours']),
            "ot_amount": float(row['OT Amount']),
            "deductions": float(row['Deductions']),
            "net_pay": float(row['Net Pay']),
            "currency": str(row['Currency']).strip(),
            "working_days": int(row['Working Days'])
        }
        payroll_list.append(pay)
        
    payroll_ref_col.insert_many(payroll_list)
    print(f"Seeded {len(payroll_list)} reference payroll records.")

    # Clear other collections to reset state
    get_collection("timesheets").delete_many({})
    get_collection("invoices").delete_many({})
    get_collection("queries").delete_many({})
    get_collection("audit_logs").delete_many({})
    
    # Insert a system audit log
    audit_col = get_collection("audit_logs")
    audit_col.insert_one({
        "actor": "system",
        "action": "database_seed",
        "target": "all",
        "at": pd.Timestamp.now().isoformat(),
        "meta": {"customers_seeded": len(customers_list), "employees_seeded": len(employees_list)}
    })
    
    print("Database seeding completed successfully.")
    return True

if __name__ == "__main__":
    seed_db()
