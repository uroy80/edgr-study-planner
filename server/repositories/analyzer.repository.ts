import { query } from '../db/connection.js';

export interface AnalyzerSubjectRow {
  id: string;
  name: string;
  semester: number;
  code: string | null;
  note_count: number;
  chunks: number;
  has_roadmap: boolean;
}

export interface RetrievedChunk {
  content: string;
  unit: number | null;
  material_id: string;
  title: string;
  distance: number;
}

export class AnalyzerRepository {
  async subjectsWithNotes(semester?: number): Promise<AnalyzerSubjectRow[]> {
    const params: unknown[] = [];
    let semFilter = '';
    if (semester != null) {
      params.push(semester);
      semFilter = 'AND s.semester = $1';
    }
    const r = await query<{
      id: string; name: string; semester: number; code: string | null;
      note_count: string; chunks: string; has_roadmap: boolean;
    }>(
      `SELECT s.id, s.name, s.semester, s.code,
              COUNT(DISTINCT m.id)                                              AS note_count,
              (SELECT COUNT(*) FROM note_chunks c WHERE c.subject_id = s.id)    AS chunks,
              EXISTS(SELECT 1 FROM subject_roadmaps r WHERE r.subject_id = s.id) AS has_roadmap
         FROM study_subjects s
         JOIN study_materials m ON m.subject_id = s.id
        WHERE m.category = 'notes' AND m.status IN ('active','link_only') ${semFilter}
        GROUP BY s.id
        ORDER BY s.semester ASC, s.name ASC`,
      params,
    );
    return r.rows.map((x) => ({
      id: x.id, name: x.name, semester: x.semester, code: x.code,
      note_count: parseInt(x.note_count, 10) || 0,
      chunks: parseInt(x.chunks, 10) || 0,
      has_roadmap: x.has_roadmap,
    }));
  }

  async subjectMeta(id: string) {
    const r = await query<{ id: string; name: string; semester: number; code: string | null }>(
      `SELECT id, name, semester, code FROM study_subjects WHERE id = $1`,
      [id],
    );
    return r.rows[0] ?? null;
  }

  async chunkCount(subjectId: string): Promise<number> {
    const r = await query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM note_chunks WHERE subject_id = $1`,
      [subjectId],
    );
    return parseInt(r.rows[0].n, 10) || 0;
  }

  /** A spread of chunks across units for roadmap context (bounded). */
  async sampleChunks(subjectId: string, perUnit = 6, max = 50): Promise<{ unit: number | null; content: string }[]> {
    const r = await query<{ unit: number | null; content: string }>(
      `SELECT unit, content FROM (
         SELECT unit, content,
                ROW_NUMBER() OVER (PARTITION BY unit ORDER BY chunk_index) AS rn
           FROM note_chunks WHERE subject_id = $1
       ) t
       WHERE rn <= $2
       ORDER BY unit NULLS LAST, content
       LIMIT $3`,
      [subjectId, perUnit, max],
    );
    return r.rows;
  }

  /** Distinct numbered units present in this subject's note chunks. */
  async unitNumbers(subjectId: string): Promise<number[]> {
    const r = await query<{ unit: number }>(
      `SELECT DISTINCT unit FROM note_chunks WHERE subject_id = $1 AND unit IS NOT NULL ORDER BY unit ASC`,
      [subjectId],
    );
    return r.rows.map((x) => x.unit);
  }

  /** First N chunks of one unit, for per-unit roadmap generation. */
  async chunksForUnit(subjectId: string, unit: number, limit = 12): Promise<string[]> {
    const r = await query<{ content: string }>(
      `SELECT content FROM note_chunks WHERE subject_id = $1 AND unit = $2 ORDER BY chunk_index ASC LIMIT $3`,
      [subjectId, unit, limit],
    );
    return r.rows.map((x) => x.content);
  }

  /** Top-k chunks by cosine similarity to a query embedding. */
  async topChunks(subjectId: string, queryVecLiteral: string, k = 6): Promise<RetrievedChunk[]> {
    const r = await query<RetrievedChunk & { distance: string }>(
      `SELECT c.content, c.unit, c.material_id, m.title,
              (c.embedding <=> $2::vector) AS distance
         FROM note_chunks c
         JOIN study_materials m ON m.id = c.material_id
        WHERE c.subject_id = $1 AND c.embedding IS NOT NULL
        ORDER BY c.embedding <=> $2::vector
        LIMIT $3`,
      [subjectId, queryVecLiteral, k],
    );
    return r.rows.map((x) => ({ ...x, distance: Number(x.distance) }));
  }

  async getRoadmap(subjectId: string): Promise<{ roadmap: unknown; model: string | null; generated_at: Date } | null> {
    const r = await query<{ roadmap: unknown; model: string | null; generated_at: Date }>(
      `SELECT roadmap, model, generated_at FROM subject_roadmaps WHERE subject_id = $1`,
      [subjectId],
    );
    return r.rows[0] ?? null;
  }

  async saveRoadmap(subjectId: string, roadmap: unknown, model: string): Promise<void> {
    await query(
      `INSERT INTO subject_roadmaps (subject_id, roadmap, model, generated_at)
       VALUES ($1, $2::jsonb, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (subject_id) DO UPDATE
         SET roadmap = EXCLUDED.roadmap, model = EXCLUDED.model, generated_at = CURRENT_TIMESTAMP`,
      [subjectId, JSON.stringify(roadmap), model],
    );
  }
}

export const analyzerRepository = new AnalyzerRepository();
