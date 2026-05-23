from __future__ import annotations

from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .config import DB_PATH
from .repository import connect, get_chunk, get_chunk_context, list_books, rebuild_index, search


app = FastAPI(
    title="fiqh.ai API",
    description="Citation-safe Hanafi fiqh reference retrieval API.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": DB_PATH.exists(), "db_path": str(DB_PATH)}


@app.post("/admin/reindex")
def reindex() -> dict[str, object]:
    return rebuild_index()


@app.get("/books")
def books() -> dict[str, object]:
    with connect() as conn:
        return {"books": list_books(conn)}


@app.get("/search")
def search_endpoint(
    q: str = Query(..., min_length=2),
    limit: int = Query(10, ge=1, le=50),
    book_ids: Optional[str] = Query(None, description="Comma-separated list of book IDs to filter by"),
    mode: str = Query("all", pattern="^(all|any|exact)$"),
) -> dict[str, object]:
    parsed_book_ids = None
    if book_ids:
        try:
            parsed_book_ids = [int(x.strip()) for x in book_ids.split(",") if x.strip()]
        except ValueError:
            raise HTTPException(status_code=400, detail="book_ids must be a comma-separated list of integers")

    with connect() as conn:
        results = [result.to_dict() for result in search(conn, q, limit, parsed_book_ids, mode)]
    return {
        "query": q,
        "count": len(results),
        "results": results,
        "disclaimer": "For study and reference lookup only. This is not a fatwa.",
    }


@app.get("/chunks/{chunk_id}")
def chunk(chunk_id: int, q: Optional[str] = Query(None)) -> dict[str, object]:
    with connect() as conn:
        result = get_chunk(conn, chunk_id, q)
    if result is None:
        raise HTTPException(status_code=404, detail="Chunk not found")
    return {"chunk": result.to_dict()}


@app.get("/chunks/{chunk_id}/context")
def chunk_context(
    chunk_id: int,
    window: int = Query(2, ge=1, le=5),
    q: Optional[str] = Query(None),
) -> dict[str, object]:
    with connect() as conn:
        results = [result.to_dict() for result in get_chunk_context(conn, chunk_id, window, q)]
    return {
        "chunk_id": chunk_id,
        "count": len(results),
        "results": results,
    }


