"""End-to-end API test."""
import requests, json

B = 'http://localhost:5000/api'

def ok(label, r):
    if r.status_code == 200:
        print('  [OK] ' + label + ': HTTP ' + str(r.status_code))
        return r.json()
    else:
        print('  [FAIL] ' + label + ': HTTP ' + str(r.status_code) + ' - ' + r.text[:150])
        return None

print('=== 1. Health ===')
ok('health', requests.get(B + '/health'))

print()
print('=== 2. Customers ===')
custs = ok('customers', requests.get(B + '/customers'))
if custs:
    print('     Count: ' + str(len(custs)) + '  first: ' + custs[0]['client_code'])

print()
print('=== 3. Employees ===')
emps = ok('employees', requests.get(B + '/employees'))
if emps:
    print('     Count: ' + str(len(emps)) + '  first: ' + emps[0]['emp_id'] + ' ' + emps[0]['full_name'])

print()
print('=== 4. Employee by email ===')
emp_r = ok('employee by email', requests.get(B + '/employees?email=employee%40gmail.com'))
if emp_r:
    print('     Found: ' + emp_r[0]['emp_id'] + ' ' + emp_r[0]['full_name'])

print()
print('=== 5. Submit timesheet ===')
r = requests.post(B + '/timesheets', data={
    'client_code': 'CL001', 'pay_period': 'June 2026', 'input_type': 'text',
    'text_content': 'Emp ID: EMP10001, Employee: Carlos Smith, working days: 24, OT hours: 2, Project: P1, June 2026'
})
ts = ok('upload timesheet', r)
if ts:
    print('     Status: ' + ts['status'] + '  Touchless: ' + str(ts['is_touchless']))
    print('     Confidence: ' + str(ts['extracted_data']['overall_confidence']))
    print('     Pipeline: ' + str(ts['extracted_data']['meta'].get('pipeline', '')))
    print('     Exceptions: ' + str(ts['exceptions']))

print()
print('=== 6. Invoices ===')
invs = ok('invoices', requests.get(B + '/invoices?client_code=CL001'))
if invs and len(invs) > 0:
    inv = invs[0]
    print('     Total: AED ' + str(inv['total_amount']) + '  Validation: ' + inv['validation_status'])
    if inv.get('line_items'):
        li = inv['line_items'][0]
        print('     Line: emp=' + str(li.get('emp_id')) + ' net_pay=' + str(li.get('net_pay')) + ' proj=' + str(li.get('project_code')))

print()
print('=== 7. Metrics ===')
m = ok('metrics', requests.get(B + '/metrics'))
if m:
    print('     Touchless: ' + str(m['touchless_rate']) + '%  Invoices: ' + str(m['total_invoices_count']))

print()
print('=== 8. Profile lookup ===')
p = ok('profile', requests.get(B + '/profiles/employee%40gmail.com'))
if p:
    print('     ' + str(p['employeeId']) + ' ' + str(p['fullName']))

print()
print('ALL TESTS DONE')
