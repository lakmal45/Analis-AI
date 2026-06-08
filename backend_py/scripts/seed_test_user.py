import asyncio
import os
import sys

# Ensure backend_py is in the Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import engine, Base
from app.models.user import User
from app.routes.auth import get_password_hash
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

async def main():
    print("Connecting to database...")
    async with engine.begin() as conn:
        # Create all tables if they don't exist yet
        await conn.run_sync(Base.metadata.create_all)
    
    async with AsyncSession(engine) as db:
        # Check if the test user exists
        email = "test@test.com"
        stmt = select(User).where(User.email == email)
        result = await db.execute(stmt)
        user = result.scalars().first()
        if not user:
            print(f"Creating test user {email}...")
            new_user = User(
                username="testuser",
                email=email,
                password=get_password_hash("12345678")
            )
            db.add(new_user)
            await db.commit()
            print("✅ Test user created successfully!")
        else:
            print(f"ℹ️ Test user {email} already exists.")

if __name__ == "__main__":
    asyncio.run(main())
