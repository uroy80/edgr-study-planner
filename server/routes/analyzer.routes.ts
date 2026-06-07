/**
 * Analyzer routes (public). Mounted under /api/analyzer.
 *   GET  /api/analyzer/subjects?semester=6
 *   GET  /api/analyzer/subject/:id/roadmap        (cached roadmap or {status:'none'})
 *   POST /api/analyzer/subject/:id/roadmap        (generate via Ollama)
 *   POST /api/analyzer/subject/:id/chat  {message} (RAG answer + citations)
 */
import { Router, type Request, type Response } from 'express';
import { analyzerService } from '../services/analyzer.service.js';
import { ollamaUp } from '../services/ollama.service.js';

const router = Router();

const ok = (res: Response, data: unknown) =>
  res.status(200).json({ success: true, data, timestamp: Date.now() });
const fail = (res: Response, code: number, message: string, errorCode = 'ERROR') =>
  res.status(code).json({ success: false, error: { code: errorCode, message }, timestamp: Date.now() });

router.get('/subjects', async (req: Request, res: Response) => {
  let semester: number | undefined;
  if (req.query.semester != null && String(req.query.semester) !== '') {
    const s = parseInt(String(req.query.semester), 10);
    if (!Number.isNaN(s)) semester = s;
  }
  try {
    return ok(res, { subjects: await analyzerService.listSubjects(semester) });
  } catch {
    return fail(res, 500, 'Failed to list subjects');
  }
});

router.get('/subject/:id/roadmap', async (req: Request, res: Response) => {
  try {
    const r = await analyzerService.getRoadmap(String(req.params.id));
    if (!r) return fail(res, 404, 'Subject not found', 'NOT_FOUND');
    return ok(res, r);
  } catch {
    return fail(res, 500, 'Failed to load roadmap');
  }
});

router.post('/subject/:id/roadmap', async (req: Request, res: Response) => {
  if (!(await ollamaUp())) {
    return fail(res, 503, 'Local model (Ollama) is not running. Start Ollama and try again.', 'OLLAMA_DOWN');
  }
  try {
    const r = await analyzerService.generateRoadmap(String(req.params.id));
    if (!r) return fail(res, 404, 'Subject not found', 'NOT_FOUND');
    return ok(res, r);
  } catch (e) {
    return fail(res, 500, `Roadmap generation failed: ${(e as Error).message}`);
  }
});

router.post('/subject/:id/chat', async (req: Request, res: Response) => {
  const message = String((req.body ?? {}).message ?? '').trim();
  if (!message) return fail(res, 400, 'message is required', 'INVALID_INPUT');
  if (!(await ollamaUp())) {
    return fail(res, 503, 'Local model (Ollama) is not running. Start Ollama and try again.', 'OLLAMA_DOWN');
  }
  try {
    const r = await analyzerService.answer(String(req.params.id), message);
    if (!r) return fail(res, 404, 'Subject not found', 'NOT_FOUND');
    return ok(res, r);
  } catch (e) {
    return fail(res, 500, `Chat failed: ${(e as Error).message}`);
  }
});

export { router as analyzerRouter };
