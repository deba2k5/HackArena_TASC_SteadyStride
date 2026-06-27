import sys
sys.path.insert(0, r'c:/Users/Debangshu05/Downloads/expensify-esque-main/expensify-esque-main/backend')
from db import get_collection
ts_col  = get_collection('timesheets')
inv_col = get_collection('invoices')

all_ts = list(ts_col.find({}))
removed_ts = 0
removed_inv = 0

for ts in all_ts:
    recs = ts.get('extracted_data', {}).get('records', [])
    bad = False
    for r in recs:
        wd = r.get('working_days')
        th = r.get('total_hours')
        # Bad: working_days > 31 (year extracted), or zero days AND zero hours
        if wd and wd > 31:
            bad = True
            break
        if (not wd or wd == 0) and (not th or th == 0):
            # No usable data at all
            emp = r.get('matched_emp_id') or r.get('emp_id')
            if not emp:
                bad = True
                break
            # Has emp but no days AND no hours → bad
            all_none = not wd and not th and not r.get('ot_hours')
            if all_none:
                bad = True
                break

    if bad:
        print(f"Removing bad ts: {ts['id'][:8]} status:{ts['status']}")
        # Delete invoice first
        del_inv = inv_col.delete_many({'timesheet_id': ts['id']})
        if del_inv.deleted_count:
            print(f"  Deleted {del_inv.deleted_count} invoice(s)")
            removed_inv += del_inv.deleted_count
        # Delete timesheet
        ts_col.delete_one({'id': ts['id']})
        removed_ts += 1

print(f'\nRemoved {removed_ts} bad timesheets, {removed_inv} bad invoices')

# Final count
print(f'Timesheets remaining: {ts_col.count_documents({})}')
print(f'Invoices remaining: {inv_col.count_documents({})}')
print(f'CL001 invoices: {inv_col.count_documents({"client_code": "CL001"})}')
print(f'CL001 processed ts: {ts_col.count_documents({"client_code": "CL001", "status": "processed"})}')
