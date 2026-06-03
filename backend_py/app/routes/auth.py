from __future__ import annotations

from typing import Annotated, Any

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User
from app.schemas.auth import TokenResponse, UserLogin, UserRegister, UserResponse

router = APIRouter(prefix="/api/auth", tags=["Auth"])

import bcrypt

def verify_password(plain_password: str, hashed_password: str) -> bool:
    if isinstance(hashed_password, str):
        hashed_password_bytes = hashed_password.encode("utf-8")
    else:
        hashed_password_bytes = hashed_password
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password_bytes)

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def create_access_token(user_id: int) -> str:
    return jwt.encode({"id": user_id}, settings.jwt_secret, algorithm="HS256")


@router.post("/register", response_model=TokenResponse)
async def register(
    user_data: UserRegister, db: Annotated[AsyncSession, Depends(get_db)]
) -> Any:
    # Check if user exists
    stmt = select(User).where(User.email == user_data.email)
    result = await db.execute(stmt)
    if result.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered"
        )

    # Create new user
    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        username=user_data.username,
        email=user_data.email,
        password=hashed_password,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    token = create_access_token(new_user.id)
    return {"token": token, "user": new_user}


@router.post("/login", response_model=TokenResponse)
async def login(
    user_data: UserLogin, db: Annotated[AsyncSession, Depends(get_db)]
) -> Any:
    stmt = select(User).where(User.email == user_data.email)
    result = await db.execute(stmt)
    user = result.scalars().first()

    if not user or not verify_password(user_data.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    token = create_access_token(user.id)
    return {"token": token, "user": user}


@router.get("/profile", response_model=UserResponse)
async def get_profile(current_user: Annotated[User, Depends(get_current_user)]) -> Any:
    return current_user
