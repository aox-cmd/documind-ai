from fastapi import (
    APIRouter, Depends, HTTPException,
    UploadFile, File, Response
)
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.entities import (
    User, Document, DocumentChunk, Message
)
from app.schemas.documents import (
    DocumentResponse,
    DocumentDetail,
    ChunkResponse,
    MessageResponse
)
from app.services.document_processor import (
    process_document,
    chunk_document,
    MAX_FILE_SIZE
)


router = APIRouter(
    prefix="/api/documents",
    tags=["Documents"]
)

MAX_DOCUMENTS_PER_USER = 20


def get_owned_document(
    document_id: int,
    user_id: int,
    db: Session
) -> Document:

    document = db.scalar(
        select(Document).where(
            Document.id == document_id,
            Document.user_id == user_id
        )
    )

    if not document:
        raise HTTPException(
            404, "Document not found"
        )

    return document


@router.post(
    "/upload",
    response_model=DocumentResponse,
    status_code=201
)
def upload_document(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db.execute(
        select(User.id)
        .where(User.id == user.id)
        .with_for_update()
    )

    document_count = db.scalar(
        select(func.count(Document.id)).where(
            Document.user_id == user.id
        )
    )

    if document_count >= MAX_DOCUMENTS_PER_USER:
        raise HTTPException(
            409, "You have reached the 20-document limit"
        )

    filename = (
        (file.filename or "document")
        .replace("\\", "/")
        .split("/")[-1]
    )

    if len(filename) > 255:
        raise HTTPException(422, "Filename is too long")

    try:
        data = file.file.read(MAX_FILE_SIZE + 1)
    finally:
        file.file.close()

    processed = process_document(filename, data)
    chunks = chunk_document(processed["pages"])

    document = Document(
        user_id=user.id,
        filename=filename,
        file_type=processed["file_type"],
        file_size=len(data),
        extracted_text=processed["text"],
        page_count=processed["page_count"],
        status="ready"
    )

    db.add(document)
    db.flush()

    db.add_all([
        DocumentChunk(
            document_id=document.id,
            **chunk
        )
        for chunk in chunks
    ])

    db.commit()
    db.refresh(document)

    return document


@router.get("", response_model=list[DocumentResponse])
def list_documents(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return db.scalars(
        select(Document)
        .where(Document.user_id == user.id)
        .order_by(Document.created_at.desc())
    ).all()


@router.get(
    "/{document_id}",
    response_model=DocumentDetail
)
def get_document(
    document_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    document = get_owned_document(
        document_id, user.id, db
    )

    chunk_count = db.scalar(
        select(func.count(DocumentChunk.id))
        .where(
            DocumentChunk.document_id == document.id
        )
    )

    return DocumentDetail(
        **DocumentResponse.model_validate(
            document
        ).model_dump(),
        extracted_text=document.extracted_text,
        chunk_count=chunk_count
    )


@router.get(
    "/{document_id}/chunks",
    response_model=list[ChunkResponse]
)
def get_chunks(
    document_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    get_owned_document(document_id, user.id, db)

    return db.scalars(
        select(DocumentChunk)
        .where(
            DocumentChunk.document_id == document_id
        )
        .order_by(DocumentChunk.chunk_index)
    ).all()


@router.get(
    "/{document_id}/messages",
    response_model=list[MessageResponse]
)
def get_messages(
    document_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    get_owned_document(document_id, user.id, db)

    return db.scalars(
        select(Message)
        .where(Message.document_id == document_id)
        .order_by(Message.created_at, Message.id)
    ).all()


@router.delete(
    "/{document_id}",
    status_code=204
)
def delete_document(
    document_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    document = get_owned_document(
        document_id, user.id, db
    )

    db.delete(document)
    db.commit()

    return Response(status_code=204)
