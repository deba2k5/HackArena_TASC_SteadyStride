"""Invoice, InvoiceItem, BusinessRule, ValidationLog, FraudLog, AuditLog schemas."""

from pydantic import BaseModel
from datetime import datetime
from app.models.invoice import InvoiceStatus


class InvoiceItemOut(BaseModel):
    id: str
    description: str
    quantity: float
    unit_price: float
    amount: float
    item_type: str
    model_config = {"from_attributes": True}


class InvoiceOut(BaseModel):
    id: str
    invoice_number: str
    employee_id: str | None
    client_id: str
    project_id: str | None
    contract_id: str | None
    status: InvoiceStatus
    billing_period_start: str | None
    billing_period_end: str | None
    invoice_date: str | None
    due_date: str | None
    regular_hours: float
    overtime_hours: float
    hourly_rate: float
    overtime_rate: float
    subtotal: float
    gst_rate: float
    gst_amount: float
    tax_rate: float
    tax_amount: float
    discount: float
    total_amount: float
    currency: str
    pdf_path: str | None
    notes: str | None
    payment_terms: str | None
    fraud_risk_score: float | None
    fraud_risk_level: str | None
    extraction_confidence: float | None
    sent_at: str | None
    paid_at: str | None
    created_at: datetime
    items: list[InvoiceItemOut] = []
    model_config = {"from_attributes": True}


class InvoiceCreate(BaseModel):
    timesheet_id: str
    notes: str | None = None
    payment_terms: str | None = None


class InvoiceStatusUpdate(BaseModel):
    status: InvoiceStatus
    notes: str | None = None


class BusinessRuleCreate(BaseModel):
    name: str
    category: str
    rule_key: str
    rule_value: str
    data_type: str = "float"
    description: str | None = None
    is_active: bool = True
    client_id: str | None = None
    severity: str = "error"


class BusinessRuleUpdate(BaseModel):
    rule_value: str | None = None
    description: str | None = None
    is_active: bool | None = None
    severity: str | None = None


class BusinessRuleOut(BaseModel):
    id: str
    name: str
    category: str
    rule_key: str
    rule_value: str
    data_type: str
    description: str | None
    is_active: bool
    client_id: str | None
    severity: str
    created_at: datetime
    model_config = {"from_attributes": True}


class ValidationLogOut(BaseModel):
    id: str
    invoice_id: str | None
    timesheet_id: str | None
    rule_key: str
    rule_name: str | None
    passed: bool
    severity: str
    message: str | None
    actual_value: str | None
    expected_value: str | None
    created_at: datetime
    model_config = {"from_attributes": True}


class FraudLogOut(BaseModel):
    id: str
    invoice_id: str | None
    timesheet_id: str | None
    flag_type: str
    description: str
    risk_score: float
    risk_level: str
    details: dict | None
    is_resolved: bool
    resolution_note: str | None
    created_at: datetime
    model_config = {"from_attributes": True}


class AuditLogOut(BaseModel):
    id: str
    user_id: str | None
    invoice_id: str | None
    timesheet_id: str | None
    action: str
    resource_type: str | None
    resource_id: str | None
    old_values: dict | None
    new_values: dict | None
    ip_address: str | None
    notes: str | None
    created_at: datetime
    model_config = {"from_attributes": True}


class NotificationOut(BaseModel):
    id: str
    user_id: str
    title: str
    message: str
    type: str
    resource_type: str | None
    resource_id: str | None
    is_read: bool
    read_at: str | None
    created_at: datetime
    model_config = {"from_attributes": True}


class AnalyticsSummary(BaseModel):
    total_invoices: int
    total_revenue: float
    pending_reviews: int
    rejected_invoices: int
    fraud_alerts: int
    avg_processing_time_seconds: float
    extraction_accuracy_pct: float
    invoices_by_status: dict[str, int]
    revenue_by_client: list[dict]
    monthly_trend: list[dict]
    department_revenue: list[dict]
    avg_confidence: float
