import pandas as pd
import os

def main():
    base_dir = r"C:\Users\Debangshu05\Downloads\Supporting Documents - Touchless Agent\For Contestants"
    xlsx_path = os.path.join(base_dir, "TASC_Sample_Database_vF.xlsx")
    
    # Load Customers
    customers_df = pd.read_excel(xlsx_path, sheet_name="Customers")
    print("=== CUSTOMERS ===")
    print(customers_df)
    
    # Load TestCases
    testcases_df = pd.read_excel(xlsx_path, sheet_name="TestCases")
    print("\n=== TEST CASES ===")
    print(testcases_df)

    # Let's inspect some duplicate emails/names in Employees
    employees_df = pd.read_excel(xlsx_path, sheet_name="Employees")
    print(f"\n=== EMPLOYEES: Count = {len(employees_df)} ===")
    print(employees_df.info())
    
    # Check duplicates in Employees
    dup_names = employees_df[employees_df.duplicated(subset=['Full Name'], keep=False)]
    print("\n=== DUP NAMES ===")
    print(dup_names[['Emp ID', 'Full Name', 'Email', 'Client Code', 'Client Name', 'Total CTC']].head(10))

if __name__ == "__main__":
    main()
