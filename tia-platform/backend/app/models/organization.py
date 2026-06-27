"""Employee, Department, Manager, Client, Project, Contract models."""

from sqlalchemy import Boolean, ForeignKey, Numeric, String, Text, Date, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class Department(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "departments"

    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    employees: Mapped[list["Employee"]] = relationship("Employee", back_populates="department")


class Manager(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "managers"

    employee_id: Mapped[str] = mapped_column(String(36), ForeignKey("employees.id"), nullable=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    phone: Mapped[str] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    employees: Mapped[list["Employee"]] = relationship("Employee", back_populates="manager", foreign_keys="Employee.manager_id")


class Employee(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "employees"

    employee_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    phone: Mapped[str] = mapped_column(String(50), nullable=True)
    department_id: Mapped[str] = mapped_column(String(36), ForeignKey("departments.id"), nullable=True)
    manager_id: Mapped[str] = mapped_column(String(36), ForeignKey("managers.id"), nullable=True)
    designation: Mapped[str] = mapped_column(String(200), nullable=True)
    hourly_rate: Mapped[float] = mapped_column(Numeric(12, 4), default=0.0)
    overtime_rate: Mapped[float] = mapped_column(Numeric(12, 4), default=0.0)
    currency: Mapped[str] = mapped_column(String(10), default="USD")
    join_date: Mapped[str] = mapped_column(String(20), nullable=True)
    end_date: Mapped[str] = mapped_column(String(20), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    tax_id: Mapped[str] = mapped_column(String(100), nullable=True)
    bank_account: Mapped[str] = mapped_column(String(100), nullable=True)

    department: Mapped[Department] = relationship("Department", back_populates="employees")
    manager: Mapped[Manager] = relationship("Manager", back_populates="employees", foreign_keys=[manager_id])
    timesheets: Mapped[list["Timesheet"]] = relationship("Timesheet", back_populates="employee")  # type: ignore[name-defined]
    invoices: Mapped[list["Invoice"]] = relationship("Invoice", back_populates="employee")  # type: ignore[name-defined]


class Client(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "clients"

    client_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    company_name: Mapped[str] = mapped_column(String(300), nullable=False)
    contact_name: Mapped[str] = mapped_column(String(255), nullable=True)
    email: Mapped[str] = mapped_column(String(255), nullable=True)
    phone: Mapped[str] = mapped_column(String(50), nullable=True)
    address: Mapped[str] = mapped_column(Text, nullable=True)
    country: Mapped[str] = mapped_column(String(100), nullable=True)
    tax_id: Mapped[str] = mapped_column(String(100), nullable=True)
    currency: Mapped[str] = mapped_column(String(10), default="USD")
    payment_terms_days: Mapped[int] = mapped_column(Integer, default=30)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    logo_url: Mapped[str] = mapped_column(String(500), nullable=True)

    projects: Mapped[list["Project"]] = relationship("Project", back_populates="client")
    contracts: Mapped[list["Contract"]] = relationship("Contract", back_populates="client")
    invoices: Mapped[list["Invoice"]] = relationship("Invoice", back_populates="client")  # type: ignore[name-defined]


class Project(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "projects"

    project_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    client_id: Mapped[str] = mapped_column(String(36), ForeignKey("clients.id"), nullable=False)
    start_date: Mapped[str] = mapped_column(String(20), nullable=True)
    end_date: Mapped[str] = mapped_column(String(20), nullable=True)
    billing_rate: Mapped[float] = mapped_column(Numeric(12, 4), default=0.0)
    overtime_rate: Mapped[float] = mapped_column(Numeric(12, 4), default=0.0)
    currency: Mapped[str] = mapped_column(String(10), default="USD")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    budget: Mapped[float] = mapped_column(Numeric(14, 2), nullable=True)

    client: Mapped[Client] = relationship("Client", back_populates="projects")
    contracts: Mapped[list["Contract"]] = relationship("Contract", back_populates="project")
    timesheets: Mapped[list["Timesheet"]] = relationship("Timesheet", back_populates="project")  # type: ignore[name-defined]
    invoices: Mapped[list["Invoice"]] = relationship("Invoice", back_populates="project")  # type: ignore[name-defined]


class Contract(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "contracts"

    contract_number: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    client_id: Mapped[str] = mapped_column(String(36), ForeignKey("clients.id"), nullable=False)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=True)
    employee_id: Mapped[str] = mapped_column(String(36), ForeignKey("employees.id"), nullable=True)
    billing_rate: Mapped[float] = mapped_column(Numeric(12, 4), default=0.0)
    overtime_rate: Mapped[float] = mapped_column(Numeric(12, 4), default=0.0)
    currency: Mapped[str] = mapped_column(String(10), default="USD")
    start_date: Mapped[str] = mapped_column(String(20), nullable=False)
    end_date: Mapped[str] = mapped_column(String(20), nullable=True)
    payment_terms_days: Mapped[int] = mapped_column(Integer, default=30)
    gst_rate: Mapped[float] = mapped_column(Numeric(6, 4), default=0.0)
    tax_rate: Mapped[float] = mapped_column(Numeric(6, 4), default=0.0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    client: Mapped[Client] = relationship("Client", back_populates="contracts")
    project: Mapped[Project] = relationship("Project", back_populates="contracts")
