import io
import re
import zipfile
from pathlib import Path

import pymupdf
from docx import Document as WordDocument
from fastapi import HTTPException


MAX_FILE_SIZE = 10 * 1024 * 1024
MAX_TEXT_LENGTH = 500_000
MAX_PAGES = 300
MAX_ZIP_SIZE = 50 * 1024 * 1024

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt"}


def clean_text(text: str) -> str:
    text = text.replace("\x00", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_pdf(data: bytes):
    pages = []

    with pymupdf.open(stream=data, filetype="pdf") as pdf:
        if pdf.needs_pass:
            raise HTTPException(
                422, "Password-protected PDFs are not supported"
            )

        if len(pdf) > MAX_PAGES:
            raise HTTPException(
                413, "PDF exceeds the 300-page limit"
            )

        for index, page in enumerate(pdf):
            text = clean_text(page.get_text())

            if text:
                pages.append({
                    "page_number": index + 1,
                    "content": text
                })

        return pages, len(pdf)


def extract_docx(data: bytes):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        total_size = sum(
            item.file_size for item in archive.infolist()
        )

        if total_size > MAX_ZIP_SIZE:
            raise HTTPException(
                413, "Word document is too large when decompressed"
            )

    document = WordDocument(io.BytesIO(data))

    paragraphs = [
        paragraph.text
        for paragraph in document.paragraphs
        if paragraph.text.strip()
    ]

    for table in document.tables:
        for row in table.rows:
            paragraphs.append(
                " | ".join(cell.text for cell in row.cells)
            )

    return [{
        "page_number": None,
        "content": clean_text("\n".join(paragraphs))
    }], 1


def extract_txt(data: bytes):
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(
            422, "TXT files must use UTF-8 encoding"
        )

    return [{
        "page_number": None,
        "content": clean_text(text)
    }], 1


def process_document(filename: str, data: bytes):
    extension = Path(filename).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            415, "Only PDF, DOCX and TXT files are supported"
        )

    if not data:
        raise HTTPException(422, "The file is empty")

    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(
            413, "Maximum file size is 10 MB"
        )

    try:
        if extension == ".pdf":
            pages, page_count = extract_pdf(data)
        elif extension == ".docx":
            pages, page_count = extract_docx(data)
        else:
            pages, page_count = extract_txt(data)

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            422, "Unable to read this document"
        )

    full_text = "\n\n".join(
        page["content"] for page in pages
    ).strip()

    if not full_text:
        raise HTTPException(
            422,
            "No readable text found. Scanned PDFs are not supported yet."
        )

    if len(full_text) > MAX_TEXT_LENGTH:
        raise HTTPException(
            413, "Document exceeds the extracted text limit"
        )

    return {
        "file_type": extension.lstrip("."),
        "page_count": page_count,
        "text": full_text,
        "pages": pages
    }


def chunk_document(
    pages: list,
    chunk_size: int = 220,
    overlap: int = 40
):
    chunks = []

    for page in pages:
        words = page["content"].split()

        if not words:
            continue

        start = 0

        while start < len(words):
            end = min(start + chunk_size, len(words))

            chunks.append({
                "content": " ".join(words[start:end]),
                "page_number": page["page_number"],
                "chunk_index": len(chunks)
            })

            if end == len(words):
                break

            start = end - overlap

    return chunks
