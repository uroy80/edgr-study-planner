-- Migration 002: Analyzer — note embeddings (pgvector) + generated roadmaps.
-- Embedding dim 768 = nomic-embed-text. Idempotent.

CREATE TABLE IF NOT EXISTS note_chunks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id   UUID NOT NULL REFERENCES study_subjects(id) ON DELETE CASCADE,
  material_id  UUID NOT NULL REFERENCES study_materials(id) ON DELETE CASCADE,
  unit         INT,
  chunk_index  INT NOT NULL,
  content      TEXT NOT NULL,
  embedding    vector(768),
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_note_chunks_subject ON note_chunks(subject_id);
-- cosine HNSW index for fast top-k retrieval (no training needed)
CREATE INDEX IF NOT EXISTS idx_note_chunks_embedding
  ON note_chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS subject_roadmaps (
  subject_id   UUID PRIMARY KEY REFERENCES study_subjects(id) ON DELETE CASCADE,
  roadmap      JSONB NOT NULL,
  model        VARCHAR(100),
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
