import requests

def test_download():
    # Fetch invoices first
    res = requests.get("http://127.0.0.1:5000/api/invoices")
    invoices = res.json()
    if not invoices:
        print("No invoices found")
        return
        
    inv = invoices[0]
    inv_id = inv["id"]
    if not inv.get("line_items"):
        print("No line items in invoice", inv_id)
        return
        
    emp_id = inv["line_items"][0]["emp_id"]
    print(f"Downloading slip for invoice {inv_id}, emp_id {emp_id}")
    
    url = f"http://127.0.0.1:5000/api/invoices/{inv_id}/salary-slip/{emp_id}"
    print(url)
    slip_res = requests.get(url)
    
    if slip_res.status_code == 200:
        with open(f"slip_{emp_id}.pdf", "wb") as f:
            f.write(slip_res.content)
        print("Success! Saved as", f"slip_{emp_id}.pdf")
    else:
        print("Failed:", slip_res.status_code, slip_res.text)

if __name__ == "__main__":
    test_download()
