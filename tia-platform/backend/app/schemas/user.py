"""User / Role / Permission schemas."""

from pydantic import BaseModel, EmailStr
from datetime import datetime


class PermissionOut(BaseModel):
    id: str
    name: str
    resource: str
    action: str
    model_config = {"from_attributes": True}


class RoleOut(BaseModel):
    id: str
    name: str
    description: str | None
    permissions: list[PermissionOut] = []
    model_config = {"from_attributes": True}


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    is_active: bool
    is_verified: bool
    department: str | None
    phone: str | None
    avatar_url: str | None
    last_login_at: str | None
    created_at: datetime
    roles: list[RoleOut] = []
    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    full_name: str | None = None
    department: str | None = None
    phone: str | None = None
    avatar_url: str | None = None


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    department: str | None = None
    role_ids: list[str] = []
