import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { studyRouter } from './routes/study.routes.js';

export function createApp(): Express {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

  // ── API ──────────────────────────────────────────────────────────
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // Study Corner — public catalog of notes / PYQs / syllabi.
  app.use('/api/study', studyRouter);

  // Analyzer router mounted in a later phase:
  //   app.use('/api/analyzer', analyzerRouter)

  // ── Static frontend + SPA fallback ───────────────────────────────
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const clientDir = path.resolve(__dirname, '..', 'client');
  app.use(express.static(clientDir));
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(clientDir, 'index.html'));
    }
    next();
  });

  return app;
}
