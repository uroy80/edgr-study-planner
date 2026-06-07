-- Migration 001: extensions, shared trigger fn, Study Corner schema.
-- Idempotent. pgvector enabled here; analyzer tables come in a later migration.

CREATE EXTENSION IF NOT EXISTS vector;

-- shared updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Subjects, scoped to a semester.
CREATE TABLE IF NOT EXISTS study_subjects (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semester         INT NOT NULL CHECK (semester BETWEEN 1 AND 8),
  name             VARCHAR(255) NOT NULL,
  slug             VARCHAR(255) NOT NULL,
  code             VARCHAR(50),
  youtube_playlist TEXT,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_study_subjects_sem_slug UNIQUE (semester, slug)
);
CREATE INDEX IF NOT EXISTS idx_study_subjects_semester ON study_subjects(semester);

-- Materials belonging to a subject (notes | pyq | syllabus | other).
CREATE TABLE IF NOT EXISTS study_materials (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id    UUID NOT NULL REFERENCES study_subjects(id) ON DELETE CASCADE,
  category      VARCHAR(20) NOT NULL,
  unit          INT,
  unit_label    TEXT,
  exam_session  VARCHAR(50),
  title         VARCHAR(500) NOT NULL,
  file_path     TEXT,
  file_sha256   VARCHAR(64),
  file_size     BIGINT,
  mime_type     VARCHAR(100),
  sources       JSONB NOT NULL DEFAULT '[]'::jsonb,
  status        VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_study_materials_sha UNIQUE (file_sha256)
);
CREATE INDEX IF NOT EXISTS idx_study_materials_subject  ON study_materials(subject_id);
CREATE INDEX IF NOT EXISTS idx_study_materials_category ON study_materials(subject_id, category);

DROP TRIGGER IF EXISTS trg_study_subjects_updated ON study_subjects;
CREATE TRIGGER trg_study_subjects_updated BEFORE UPDATE ON study_subjects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_study_materials_updated ON study_materials;
CREATE TRIGGER trg_study_materials_updated BEFORE UPDATE ON study_materials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
