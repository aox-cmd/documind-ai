from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


def format_chunk(chunk, score=None):
    return {
        "chunk_id": chunk.id,
        "page_number": chunk.page_number,
        "chunk_index": chunk.chunk_index,
        "content": chunk.content,
        "score": score
    }


def retrieve_chunks(question: str, chunks: list, top_k: int = 6):
    if not chunks:
        return []

    if len(chunks) <= top_k:
        return [format_chunk(chunk) for chunk in chunks]

    texts = [chunk.content for chunk in chunks]

    vectorizer = TfidfVectorizer(
        lowercase=True,
        ngram_range=(1, 2),
        sublinear_tf=True,
        max_features=20000
    )

    try:
        matrix = vectorizer.fit_transform(texts)
        query_vector = vectorizer.transform([question])

        scores = cosine_similarity(
            query_vector, matrix
        )[0]

    except ValueError:
        return []

    ranked = sorted(
        range(len(chunks)),
        key=lambda index: scores[index],
        reverse=True
    )

    return [
        format_chunk(
            chunks[index],
            round(float(scores[index]), 4)
        )
        for index in ranked[:top_k]
        if scores[index] > 0
    ]


def summary_chunks(chunks: list, limit: int = 10):
    if not chunks:
        return []

    if len(chunks) <= limit:
        selected = chunks
    else:
        indexes = [
            round(i * (len(chunks) - 1) / (limit - 1))
            for i in range(limit)
        ]

        selected = [chunks[index] for index in indexes]

    return [format_chunk(chunk) for chunk in selected]
