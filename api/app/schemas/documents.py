from datetime import datetime
from pydantic import BaseModel, ConfigDict


class DocumentResponse(BaseModel):
    id: int
    filename: str
    file_type: str
    file_size: int
    page_count: int
    status: str
    summary: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DocumentDetail(DocumentResponse):
    extracted_text: str
    chunk_count: int


class ChunkResponse(BaseModel):
    id: int
    content: str
    page_number: int | None
    chunk_index: int

    model_config = ConfigDict(from_attributes=True)


class MessageResponse(BaseModel):
    id: int
    role: str
    content: str
    sources: list | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
