import { analyzerRepository } from '../repositories/analyzer.repository.js';
import { chat, embedText, toVectorLiteral } from './ollama.service.js';
import { env } from '../config/env.js';

// Structured-output schema forcing the roadmap shape from the model.
const ROADMAP_SCHEMA = {
  type: 'object',
  properties: {
    units: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          topics: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                subtopics: { type: 'array', items: { type: 'string' } },
              },
              required: ['title', 'subtopics'],
            },
          },
        },
        required: ['title', 'summary', 'topics'],
      },
    },
  },
  required: ['units'],
} as const;

// ── helpers ──────────────────────────────────────────────────────────
function extractJson(raw: string): unknown {
  const s = raw.indexOf('{');
  const e = raw.lastIndexOf('}');
  if (s === -1 || e === -1 || e < s) return null;
  try {
    return JSON.parse(raw.slice(s, e + 1));
  } catch {
    return null;
  }
}

interface RTopic { title: string; subtopics: string[] }
interface RUnit { title: string; summary: string; topics: RTopic[] }

// Accept the schema'd shape AND tolerate model variations (sections/chapters,
// string topics, subTopics/items/points) as a safety net.
function pickUnits(input: unknown): unknown[] {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  if (typeof input === 'object') {
    const o = input as Record<string, unknown>;
    if (Array.isArray(o.units)) return o.units;
    if (Array.isArray(o.sections)) return o.sections;
    if (Array.isArray(o.chapters)) return o.chapters;
    if (o.roadmap) return pickUnits(o.roadmap);
  }
  return [];
}

function asSubtopics(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return (v as unknown[])
    .map((x) =>
      typeof x === 'string'
        ? x
        : String((x as Record<string, unknown>)?.title ?? (x as Record<string, unknown>)?.name ?? ''),
    )
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeUnits(input: unknown): RUnit[] {
  const arr = pickUnits(input);
  const units: RUnit[] = [];
  for (const u of arr) {
    if (!u || typeof u !== 'object') continue;
    const uo = u as Record<string, unknown>;
    const title = String(uo.title ?? uo.name ?? '').trim();
    if (!title) continue;
    const topicsRaw = Array.isArray(uo.topics)
      ? uo.topics
      : Array.isArray(uo.subtopics)
        ? (uo.subtopics as unknown[])
        : [];
    const topics: RTopic[] = [];
    for (const t of topicsRaw) {
      if (typeof t === 'string') {
        const tt = t.trim();
        if (tt) topics.push({ title: tt.slice(0, 200), subtopics: [] });
        continue;
      }
      if (!t || typeof t !== 'object') continue;
      const to = t as Record<string, unknown>;
      const ttitle = String(to.title ?? to.name ?? '').trim();
      if (!ttitle) continue;
      const subs = asSubtopics(to.subtopics ?? to.subTopics ?? to.items ?? to.points);
      topics.push({ title: ttitle.slice(0, 200), subtopics: subs });
    }
    units.push({
      title: title.slice(0, 200),
      summary: String(uo.summary ?? uo.description ?? '').trim().slice(0, 500),
      topics: topics.slice(0, 8),
    });
  }
  return units.slice(0, 10);
}

// ── service ──────────────────────────────────────────────────────────
export class AnalyzerService {
  async listSubjects(semester?: number) {
    const rows = await analyzerRepository.subjectsWithNotes(semester);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      semester: r.semester,
      code: r.code,
      noteCount: r.note_count,
      chunks: r.chunks,
      indexed: r.chunks > 0,
      hasRoadmap: r.has_roadmap,
    }));
  }

  async getRoadmap(subjectId: string) {
    const meta = await analyzerRepository.subjectMeta(subjectId);
    if (!meta) return null;
    const existing = await analyzerRepository.getRoadmap(subjectId);
    if (existing) {
      const rm = existing.roadmap as { units?: RUnit[] };
      return {
        subject: meta,
        units: rm.units ?? [],
        generatedAt: existing.generated_at,
        model: existing.model,
        status: 'ready' as const,
      };
    }
    return { subject: meta, units: [], generatedAt: null, model: null, status: 'none' as const };
  }

  async generateRoadmap(subjectId: string) {
    const meta = await analyzerRepository.subjectMeta(subjectId);
    if (!meta) return null;
    const chunks = await analyzerRepository.sampleChunks(subjectId, 6, 50);
    if (chunks.length === 0) {
      return { subject: meta, units: [], generatedAt: null, model: null, status: 'none' as const };
    }
    const context = chunks
      .map((c) => `${c.unit != null ? `[Unit ${c.unit}] ` : ''}${c.content}`)
      .join('\n---\n')
      .slice(0, 9000);

    const sys = `You are an expert tutor building a study roadmap STRICTLY from a subject's own lecture notes.
Output ONLY JSON of this exact shape:
{"units":[{"title":"...","summary":"...","topics":[{"title":"...","subtopics":["...","..."]}]}]}
Rules:
- Derive units, topics and subtopics ONLY from the provided notes; never invent material that isn't present.
- Order from foundational to advanced.
- 3-8 units; each 2-6 topics; each 2-6 subtopics. Keep titles concise.`;
    const user = `Subject: ${meta.name} (Semester ${meta.semester}).
NOTES EXCERPTS:
${context}

Return the roadmap JSON now.`;

    const raw = await chat(
      [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
      { schema: ROADMAP_SCHEMA, temperature: 0.2, timeoutMs: 240_000 },
    );
    let units = normalizeUnits(extractJson(raw) ?? (() => { try { return JSON.parse(raw); } catch { return null; } })());
    if (!units.length) throw new Error('roadmap generation produced no usable units');
    await analyzerRepository.saveRoadmap(subjectId, { units }, env.ollamaChatModel);
    return {
      subject: meta,
      units,
      generatedAt: new Date().toISOString(),
      model: env.ollamaChatModel,
      status: 'ready' as const,
    };
  }

  async answer(subjectId: string, question: string) {
    const meta = await analyzerRepository.subjectMeta(subjectId);
    if (!meta) return null;
    const qvec = await embedText(question);
    const chunks = await analyzerRepository.topChunks(subjectId, toVectorLiteral(qvec), 6);
    if (chunks.length === 0) {
      return { answer: "I don't have indexed notes for this subject yet, so I can't answer from them.", citations: [] };
    }
    const context = chunks
      .map((c, i) => `[${i + 1}] (${c.title}${c.unit != null ? `, Unit ${c.unit}` : ''})\n${c.content}`)
      .join('\n\n')
      .slice(0, 9000);

    const sys = `You answer questions using ONLY the provided notes excerpts from a single subject.
- If the answer is not in the excerpts, say you couldn't find it in the notes — do not use outside knowledge.
- Be concise and accurate. Cite the excerpt numbers you used, like [1], [2].`;
    const user = `NOTES EXCERPTS:\n${context}\n\nQUESTION: ${question}`;

    const answer = await chat(
      [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
      { temperature: 0.2, timeoutMs: 240_000 },
    );

    const seen = new Set<string>();
    const citations: { materialId: string; title: string; unit: number | null; snippet: string }[] = [];
    for (const c of chunks) {
      if (seen.has(c.material_id)) continue;
      seen.add(c.material_id);
      citations.push({ materialId: c.material_id, title: c.title, unit: c.unit, snippet: c.content.slice(0, 160) });
    }
    return { answer: answer.trim(), citations };
  }
}

export const analyzerService = new AnalyzerService();
