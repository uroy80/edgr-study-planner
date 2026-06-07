/**
 * Study Corner routes (public — no auth). Mounted under /api/study.
 *   GET /api/study/semesters
 *   GET /api/study/subjects?semester=6
 *   GET /api/study/subjects/:id
 *   GET /api/study/material/:id/file       (inline)
 *   GET /api/study/material/:id/download   (attachment)
 */
import { Router, type Request, type Response } from 'express';
import { createReadStream } from 'fs';
import { studyRepository, type StudyMaterial } from '../repositories/study.repository.js';
import { absolutePathForFile, fileExists, extForMime } from '../services/storage.service.js';

const router = Router();

const ok = (res: Response, data: unknown) =>
  res.status(200).json({ success: true, data, timestamp: Date.now() });
const fail = (res: Response, code: number, message: string, errorCode = 'ERROR') =>
  res.status(code).json({ success: false, error: { code: errorCode, message }, timestamp: Date.now() });

export interface StudyPlaylist {
  label: string;
  url: string;
}

export function parsePlaylists(raw: string | null | undefined): StudyPlaylist[] {
  if (!raw || !raw.trim()) return [];
  const out: StudyPlaylist[] = [];
  for (const part of raw.split(',')) {
    const token = part.trim();
    if (!token) continue;
    const pipe = token.indexOf('|');
    const label = pipe >= 0 ? token.slice(0, pipe).trim() : '';
    const url = pipe >= 0 ? token.slice(pipe + 1).trim() : token;
    if (!/^https?:\/\//i.test(url)) continue;
    out.push({ label: label || 'Playlist', url });
  }
  return out;
}

function presentMaterial(m: StudyMaterial) {
  return {
    id: m.id,
    category: m.category,
    unit: m.unit,
    unitLabel: m.unit_label,
    examSession: m.exam_session,
    title: m.title,
    status: m.status,
    hasFile: !!m.file_path,
    previewable:
      !!m.file_path && (m.mime_type === 'application/pdf' || (m.mime_type ?? '').startsWith('image/')),
    kind: extForMime(m.mime_type || 'application/pdf'),
    sources: m.sources,
    fileUrl: m.file_path ? `/api/study/material/${m.id}/file` : null,
    downloadUrl: m.file_path ? `/api/study/material/${m.id}/download` : null,
    externalUrl: m.sources?.[0]?.url ?? null,
  };
}

router.get('/semesters', async (_req: Request, res: Response) => {
  try {
    return ok(res, { semesters: await studyRepository.listSemesters() });
  } catch {
    return fail(res, 500, 'Failed to list semesters');
  }
});

router.get('/subjects', async (req: Request, res: Response) => {
  const semester = parseInt(String(req.query.semester ?? ''), 10);
  if (Number.isNaN(semester) || semester < 1 || semester > 8) {
    return fail(res, 400, 'A valid semester (1-8) is required', 'INVALID_INPUT');
  }
  try {
    const subjects = await studyRepository.findSubjectsWithCounts(semester);
    return ok(res, {
      semester,
      subjects: subjects.map((s) => {
        const playlists = parsePlaylists(s.youtube_playlist);
        return {
          id: s.id,
          name: s.name,
          slug: s.slug,
          code: s.code,
          youtubePlaylist: playlists[0]?.url ?? null,
          playlists,
          materialCount: s.material_count,
          pyqCount: s.pyq_count,
          noteCount: s.note_count,
        };
      }),
    });
  } catch {
    return fail(res, 500, 'Failed to load subjects');
  }
});

router.get('/subjects/:id', async (req: Request, res: Response) => {
  try {
    const subject = await studyRepository.findSubjectById(String(req.params.id));
    if (!subject) return fail(res, 404, 'Subject not found', 'NOT_FOUND');
    const present = (await studyRepository.findMaterialsBySubject(subject.id)).map(presentMaterial);
    const grouped = {
      syllabus: present.filter((m) => m.category === 'syllabus'),
      notes: present.filter((m) => m.category === 'notes'),
      pyqs: present.filter((m) => m.category === 'pyq'),
      other: present.filter((m) => m.category === 'other'),
    };
    return ok(res, {
      subject: {
        id: subject.id,
        semester: subject.semester,
        name: subject.name,
        code: subject.code,
        youtubePlaylist: parsePlaylists(subject.youtube_playlist)[0]?.url ?? null,
        playlists: parsePlaylists(subject.youtube_playlist),
      },
      materials: grouped,
      counts: {
        total: present.length,
        syllabus: grouped.syllabus.length,
        notes: grouped.notes.length,
        pyqs: grouped.pyqs.length,
      },
    });
  } catch {
    return fail(res, 500, 'Failed to load subject');
  }
});

async function streamMaterial(req: Request, res: Response, asAttachment: boolean) {
  try {
    const material = await studyRepository.findMaterialById(String(req.params.id));
    if (!material || !material.file_path) return fail(res, 404, 'Material file not available', 'NOT_FOUND');
    if (!(await fileExists(material.file_path))) return fail(res, 404, 'Material file not available', 'NOT_FOUND');
    const mime = material.mime_type || 'application/pdf';
    const ext = extForMime(mime);
    const safeName = material.title.replace(/[^a-zA-Z0-9 _.-]/g, '_').slice(0, 120) || 'material';
    const inlineable = mime === 'application/pdf' || mime.startsWith('image/');
    const disposition = asAttachment || !inlineable ? 'attachment' : 'inline';
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Disposition', `${disposition}; filename="${safeName}.${ext}"`);
    createReadStream(absolutePathForFile(material.file_path)).pipe(res);
  } catch {
    return fail(res, 500, 'Failed to stream material');
  }
}

router.get('/material/:id/file', (req, res) => streamMaterial(req, res, false));
router.get('/material/:id/download', (req, res) => streamMaterial(req, res, true));

export { router as studyRouter };
