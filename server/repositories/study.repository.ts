/**
 * Study Corner repository — subjects + materials catalog (public, shared).
 */
import { query } from '../db/connection.js';

export type MaterialCategory = 'notes' | 'pyq' | 'syllabus' | 'other';
export type MaterialStatus = 'active' | 'pending' | 'rejected' | 'broken' | 'link_only';

export interface MaterialSource {
  site: string;
  url?: string;
  driveId?: string;
}

export interface StudySubject {
  id: string;
  semester: number;
  name: string;
  slug: string;
  code: string | null;
  youtube_playlist: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface StudyMaterial {
  id: string;
  subject_id: string;
  category: MaterialCategory;
  unit: number | null;
  unit_label: string | null;
  exam_session: string | null;
  title: string;
  file_path: string | null;
  file_sha256: string | null;
  file_size: number | null;
  mime_type: string | null;
  sources: MaterialSource[];
  status: MaterialStatus;
  created_at: Date;
  updated_at: Date;
}

export class StudyRepository {
  async listSemesters(): Promise<number[]> {
    const r = await query<{ semester: number }>(
      `SELECT DISTINCT semester FROM study_subjects ORDER BY semester ASC`,
    );
    return r.rows.map((x) => x.semester);
  }

  async findSubjectsWithCounts(
    semester: number,
  ): Promise<(StudySubject & { material_count: number; pyq_count: number; note_count: number })[]> {
    const r = await query<
      StudySubject & { material_count: string; pyq_count: string; note_count: string }
    >(
      `SELECT s.*,
              COUNT(m.id) FILTER (WHERE m.status IN ('active','link_only'))                          AS material_count,
              COUNT(m.id) FILTER (WHERE m.category='pyq'   AND m.status IN ('active','link_only'))   AS pyq_count,
              COUNT(m.id) FILTER (WHERE m.category='notes' AND m.status IN ('active','link_only'))   AS note_count
         FROM study_subjects s
         LEFT JOIN study_materials m ON m.subject_id = s.id
        WHERE s.semester = $1
        GROUP BY s.id
        ORDER BY s.name ASC`,
      [semester],
    );
    return r.rows.map((x) => ({
      ...x,
      material_count: parseInt(x.material_count, 10) || 0,
      pyq_count: parseInt(x.pyq_count, 10) || 0,
      note_count: parseInt(x.note_count, 10) || 0,
    }));
  }

  async findSubjectById(id: string): Promise<StudySubject | null> {
    const r = await query<StudySubject>(`SELECT * FROM study_subjects WHERE id = $1`, [id]);
    return r.rows[0] ?? null;
  }

  async findMaterialsBySubject(subjectId: string): Promise<StudyMaterial[]> {
    const r = await query<StudyMaterial>(
      `SELECT * FROM study_materials
        WHERE subject_id = $1 AND status IN ('active','link_only')
        ORDER BY CASE category WHEN 'syllabus' THEN 0 WHEN 'notes' THEN 1 WHEN 'pyq' THEN 2 ELSE 3 END,
                 unit NULLS LAST, exam_session DESC NULLS LAST, title ASC`,
      [subjectId],
    );
    return r.rows;
  }

  async findMaterialById(id: string): Promise<StudyMaterial | null> {
    const r = await query<StudyMaterial>(`SELECT * FROM study_materials WHERE id = $1`, [id]);
    return r.rows[0] ?? null;
  }
}

export const studyRepository = new StudyRepository();
