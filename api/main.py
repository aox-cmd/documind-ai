from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.core.database import Base, engine
from app.models.entities import User, Document, DocumentChunk, Message
from app.routers.auth import router as auth_router
from app.routers.documents import router as documents_router
from app.routers.ai import router as ai_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield
    engine.dispose()


app = FastAPI(
    title="DocuMind AI",
    description="AI-powered document intelligence platform",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"]
)

app.include_router(auth_router)
app.include_router(documents_router)
app.include_router(ai_router)


@app.get("/")
def root():
    return {
        "application": "DocuMind AI",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
def health():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))

    return {
        "status": "UP",
        "database": "connected"
    }


