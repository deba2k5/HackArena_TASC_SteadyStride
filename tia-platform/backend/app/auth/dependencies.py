"""FastAPI dependency injection for authentication and RBAC."""

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.user import User
from app.auth.security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        user_id: str = payload.get("sub", "")
        if not user_id:
            raise credentials_exc
        token_type = payload.get("type", "")
        if token_type != "access":
            raise credentials_exc
    except ValueError:
        raise credentials_exc

    result = await db.execute(
        select(User)
        .where(User.id == user_id)
        .options(selectinload(User.roles).selectinload(User.roles.property.mapper.class_.permissions))
    )
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise credentials_exc
    return user


async def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user")
    return current_user


def require_permission(permission_name: str):
    """Factory that returns a dependency checking for a specific permission."""
    async def _checker(current_user: User = Depends(get_current_active_user)) -> User:
        if permission_name not in current_user.permission_names:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {permission_name} required",
            )
        return current_user
    return _checker


def require_role(*role_names: str):
    """Factory that returns a dependency checking for one of the given roles."""
    async def _checker(current_user: User = Depends(get_current_active_user)) -> User:
        if not any(r in current_user.role_names for r in role_names):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role required: {' or '.join(role_names)}",
            )
        return current_user
    return _checker
