from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import select, delete
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.entities import User, DocumentChunk, Message
from app.routers.documents import get_owned_document
from app.schemas.documents import MessageResponse
from app.services.retrieval import retrieve_chunks, summary_chunks
from app.services.ai_service import generate_answer


router = APIRouter(
    prefix="/api/documents",
    tags=["Artificial Intelligence"]
)


class ChatRequest(BaseModel):
    question: str = Field(
        min_length=2,
        max_length=2000
    )


class SummaryResponse(BaseModel):
    summary: str
    sources: list
    sampled: bool = False


def load_chunks(document_id: int, db: Session):
    return db.scalars(
        select(DocumentChunk)
        .where(DocumentChunk.document_id == document_id)
        .order_by(DocumentChunk.chunk_index)
    ).all()


@router.post(
    "/{document_id}/chat",
    response_model=MessageResponse
)
def chat(
    document_id: int,
    request: ChatRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    document = get_owned_document(
        document_id, user.id, db
    )

    question = request.question.strip()

    if len(question) < 2:
        raise HTTPException(422, "Enter a valid question")

    chunks = load_chunks(document.id, db)

    history = list(reversed(db.scalars(
        select(Message)
        .where(Message.document_id == document.id)
        .order_by(Message.id.desc())
        .limit(6)
    ).all()))

    retrieval_query = question

    if len(question.split()) < 8:
        previous_questions = [
            message.content
            for message in history
            if message.role == "user"
        ]

        if previous_questions:
            retrieval_query += " " + previous_questions[-1]

    passages = retrieve_chunks(
        retrieval_query,
        chunks,
        top_k=6
    )

    result = generate_answer(
        question,
        passages,
        history=history
    )

    user_message = Message(
        document_id=document.id,
        role="user",
        content=question,
        sources=None
    )

    assistant_message = Message(
        document_id=document.id,
        role="assistant",
        content=result["answer"],
        sources=result["sources"]
    )

    db.add(user_message)
    db.add(assistant_message)
    db.commit()
    db.refresh(assistant_message)

    return assistant_message


@router.post(
    "/{document_id}/summarize",
    response_model=SummaryResponse
)
def summarize(
    document_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    document = get_owned_document(
        document_id, user.id, db
    )

    chunks = load_chunks(document.id, db)

    if not chunks:
        raise HTTPException(
            422, "Document has no readable content"
        )

    passages = summary_chunks(chunks)

    result = generate_answer(
        "Provide a structured summary of this document.",
        passages,
        summarize=True
    )

    sampled = len(chunks) > len(passages)

    summary = result["answer"]

    if sampled:
        summary = (
            "Note: This summary is based on selected "
            "document excerpts.\n\n" + summary
        )

    document.summary = summary
    db.commit()

    return SummaryResponse(
        summary=summary,
        sources=result["sources"],
        sampled=sampled
    )


@router.delete(
    "/{document_id}/messages",
    status_code=204
)
def clear_messages(
    document_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    get_owned_document(document_id, user.id, db)

    db.execute(
        delete(Message).where(
            Message.document_id == document_id
        )
    )

    db.commit()

    return Response(status_code=204)
