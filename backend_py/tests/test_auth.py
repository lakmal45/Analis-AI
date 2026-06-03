"""
Tests for the Auth API routes.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest_asyncio.fixture
async def client():
    """Async test client for FastAPI."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    """Health endpoint should return 200 with status ok."""
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["framework"] == "FastAPI"


@pytest.mark.asyncio
async def test_register_missing_fields(client: AsyncClient):
    """Register should fail with 422 if required fields are missing."""
    response = await client.post("/api/auth/register", json={})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_login_invalid_credentials(client: AsyncClient):
    """Login should fail with 401 for invalid credentials."""
    response = await client.post(
        "/api/auth/login",
        json={"email": "nonexistent@test.com", "password": "wrongpassword"}
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_me_unauthorized(client: AsyncClient):
    """Accessing /me without token should fail with 401."""
    response = await client.get("/api/auth/me")
    assert response.status_code == 401
