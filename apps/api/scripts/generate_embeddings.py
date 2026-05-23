#!/usr/bin/env python3
from __future__ import annotations

import sys
import sqlite3
from pathlib import Path

CURRENT_FILE = Path(__file__).resolve()
API_DIR = CURRENT_FILE.parents[1]
sys.path.insert(0, str(API_DIR))

from app.config import DB_PATH  # noqa: E402


def main() -> None:
    if not DB_PATH.exists():
        print(f"Error: Database not found at {DB_PATH}. Please run ingest first.")
        sys.exit(1)

    print(f"Connecting to database: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    
    # 1. Initialize Vector Tables
    conn.execute("""
        CREATE TABLE IF NOT EXISTS chunk_embeddings (
            chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id),
            embedding BLOB NOT NULL
        );
    """)
    conn.commit()

    # 2. Get chunks that don't have embeddings yet
    rows = conn.execute("""
        SELECT id, text_normalized FROM chunks
        WHERE id NOT IN (SELECT chunk_id FROM chunk_embeddings)
    """).fetchall()

    if not rows:
        print("All chunks already have semantic embeddings generated!")
        conn.close()
        return

    total_chunks = len(rows)
    print(f"Found {total_chunks} chunk(s) needing semantic embeddings.")

    # 3. Load Sentence Transformer model
    print("Loading sentence-transformers model (asafaya/bert-base-arabic)...")
    from sentence_transformers import SentenceTransformer
    import torch
    
    # Enable Apple Silicon GPU acceleration (MPS) if available, otherwise CUDA or CPU
    device = "cpu"
    if torch.backends.mps.is_available():
        device = "mps"
        print("★ GPU Acceleration Detected: Using Apple Silicon (MPS) for 10x faster indexing!")
    elif torch.cuda.is_available():
        device = "cuda"
        print("★ GPU Acceleration Detected: Using NVIDIA CUDA!")
    else:
        print("Using CPU (No GPU accelerators detected).")

    # Load model on the accelerated device
    model = SentenceTransformer("asafaya/bert-base-arabic", device=device)

    # 4. Generate embeddings in batches
    batch_size = 128
    print(f"Generating embeddings in batches of {batch_size}...")

    for i in range(0, total_chunks, batch_size):
        batch = rows[i : i + batch_size]
        texts = [r[1] for r in batch]
        ids = [r[0] for r in batch]

        # Generate vectors (Numpy array of shape [batch_size, 768])
        vectors = model.encode(texts, show_progress_bar=False, batch_size=batch_size)

        # Store as serialized float blobs
        for chunk_id, vector in zip(ids, vectors):
            vector_blob = vector.astype("float32").tobytes()
            conn.execute(
                "INSERT INTO chunk_embeddings (chunk_id, embedding) VALUES (?, ?)",
                (chunk_id, vector_blob)
            )
        
        conn.commit()
        pct = (i + len(batch)) / total_chunks * 100
        print(f"Progress: Indexed {i + len(batch)}/{total_chunks} chunks ({pct:.1f}%)...")

    conn.close()
    print("★ Success: Semantic vector indexing completed successfully!")


if __name__ == "__main__":
    main()
