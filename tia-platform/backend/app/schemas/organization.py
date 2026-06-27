"""Organization schemas — Employee, Client, Project, Contract, Department."""

from pydantic import BaseModel, EmailStr
from datetime import datetime


# ── Department ────────────────────────────────────────────────────────────────

class DepartmentCreate(BaseModel):
    name: str
    code: str
    description: str | None = None
    is_active: bool = True


class DepartmentOut(BaseModel):
    id: str
    name: str
    code: str
    description: str | None
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Employee ──────────────────────────────────────────────────────────────────

class EmployeeCreate(BaseModel):
    employee_code: str
    full_name: str
    email: EmailStr
    phone: str | None = None
    department_id: str | None = None
    manager_id: str | None = None
    designation: str | None = None
    hourly_rate: float = 0.0
    overtime_rate: float = 0.0
    currency: str = "USD"
    join_date: str | None = None
    end_date: str | None = None
    is_active: bool = True
    tax_id: str | None = None
    bank_account: str | None = None


class EmployeeUpdate(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    department_id: str | None = None
    manager_id: str | None = None
    designation: str | None = None
    hourly_rate: float | None = None
    overtime_rate: float | None = None
    currency: str | None = None
    join_date: str | None = None
    end_date: str | None = None
    is_active: bool | None = None


class EmployeeOut(BaseModel):
    id: str
    employee_code: str
    full_name: str
    email: str
    phone: str | None
    designation: str | None
    hourly_rate: float
    overtime_rate: float
    currency: str
    join_date: str | None
    end_date: str | None
    is_active: bool
    created_at: datetime
    department: DepartmentOut | None = None
    model_config = {"from_attributes": True}


# ── Client ────────────────────────────────────────────────────────────────────

class ClientCreate(BaseModel):
    client_code: str
    company_name: str
    contact_name: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    country: str | None = None
    tax_id: str | None = None
    currency: str = "USD"
    payment_terms_days: int = 30
    is_active: bool = True


class ClientUpdate(BaseModel):
    company_name: str | None = None
    contact_name: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    country: str | None = None
    tax_id: str | None = None
    currency: str | None = None
    payment_terms_days: int | None = None
    is_active: bool | None = None


class ClientOut(BaseModel):
    id: str
    client_code: str
    company_name: str
    contact_name: str | None
    email: str | None
    phone: str | None
    address: str | None
    country: str | None
    tax_id: str | None
    currency: str
    payment_terms_days: int
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Project ───────────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    project_code: str
    name: str
    description: str | None = None
    client_id: str
    start_date: str | None = None
    end_date: str | None = None
    billing_rate: float = 0.0
    overtime_rate: float = 0.0
    currency: str = "USD"
    is_active: bool = True
    budget: float | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    billing_rate: float | None = None
    overtime_rate: float | None = None
    is_active: bool | None = None
    budget: float | None = None


class ProjectOut(BaseModel):
    id: str
    project_code: str
    name: str
    description: str | None
    client_id: str
    start_date: str | None
    end_date: str | None
    billing_rate: float
    overtime_rate: float
    currency: str
    is_active: bool
    budget: float | None
    created_at: datetime
    client: ClientOut | None = None
    model_config = {"from_attributes": True}


# ── Contract ──────────────────────────────────────────────────────────────────

class ContractCreate(BaseModel):
    contract_number: str
    client_id: str
    project_id: str | None = None
    employee_id: str | None = None
    billing_rate: float = 0.0
    overtime_rate: float = 0.0
    currency: str = "USD"
    start_date: str
    end_date: str | None = None
    payment_terms_days: int = 30
    gst_rate: float = 0.0
    tax_rate: float = 0.0
    is_active: bool = True
    notes: str | None = None


class ContractOut(BaseModel):
    id: str
    contract_number: str
    client_id: str
    project_id: str | None
    employee_id: str | None
    billing_rate: float
    overtime_rate: float
    currency: str
    start_date: str
    end_date: str | None
    payment_terms_days: int
    gst_rate: float
    tax_rate: float
    is_active: bool
    notes: str | None
    created_at: datetime
    model_config = {"from_attributes": True}
