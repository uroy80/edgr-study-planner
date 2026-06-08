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

// Schema for a single unit (per-unit roadmap generation).
const UNIT_SCHEMA = {
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
  required: ['title', 'topics'],
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

function normalizeOneUnit(raw: string, unitNum: number): RUnit | null {
  let o: unknown = extractJson(raw);
  if (!o) {
    try {
      o = JSON.parse(raw);
    } catch {
      o = null;
    }
  }
  if (!o || typeof o !== 'object') return null;
  const oo = o as Record<string, unknown>;
  const topics: RTopic[] = [];
  const tRaw = Array.isArray(oo.topics) ? oo.topics : [];
  for (const t of tRaw) {
    if (typeof t === 'string') {
      const tt = t.trim();
      if (tt) topics.push({ title: tt.slice(0, 200), subtopics: [] });
      continue;
    }
    if (!t || typeof t !== 'object') continue;
    const to = t as Record<string, unknown>;
    const ttitle = String(to.title ?? to.name ?? '').trim();
    if (!ttitle) continue;
    const subsRaw = Array.isArray(to.subtopics)
      ? to.subtopics
      : Array.isArray((to as Record<string, unknown>).subTopics)
        ? ((to as Record<string, unknown>).subTopics as unknown[])
        : [];
    const subs = (subsRaw as unknown[]).map((x) => String(x).trim()).filter(Boolean).slice(0, 8);
    topics.push({ title: ttitle.slice(0, 200), subtopics: subs });
  }
  if (!topics.length) return null;
  const rawTitle = String(oo.title ?? oo.name ?? '').trim();
  const title = !rawTitle
    ? `Unit ${unitNum}`
    : /^unit\b/i.test(rawTitle)
      ? rawTitle
      : `Unit ${unitNum}: ${rawTitle}`;
  return {
    title: title.slice(0, 200),
    summary: String(oo.summary ?? oo.description ?? '').trim().slice(0, 500),
    topics: topics.slice(0, 8),
  };
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
    if ((await analyzerRepository.chunkCount(subjectId)) === 0) {
      return { subject: meta, units: [], generatedAt: null, model: null, status: 'none' as const };
    }

    let units: RUnit[] = [];

    // Preferred: per-unit generation. The notes carry unit numbers, so we build
    // ONE unit at a time from that unit's own notes — this guarantees the roadmap
    // matches the real unit structure (fixes "only 1-2 of 5 units generated").
    const unitNums = await analyzerRepository.unitNumbers(subjectId);
    if (unitNums.length >= 2) {
      for (const n of unitNums) {
        const chunks = await analyzerRepository.chunksForUnit(subjectId, n, 12);
        if (!chunks.length) continue;
        const ctx = chunks.join('\n---\n').slice(0, 7000);
        const sys = `You extract a study roadmap for ONE unit of "${meta.name}" from its lecture notes.
Output ONLY JSON: {"title":"the unit's theme","summary":"1-2 line overview","topics":[{"title":"...","subtopics":["...","..."]}]}.
Use ONLY the notes; do not invent. Produce 3-6 topics; each with 2-6 subtopics.`;
        const user = `Unit ${n} notes:\n${ctx}\n\nReturn the unit JSON.`;
        try {
          const raw = await chat(
            [
              { role: 'system', content: sys },
              { role: 'user', content: user },
            ],
            { schema: UNIT_SCHEMA, temperature: 0.2, numCtx: 6144, timeoutMs: 180_000 },
          );
          const u = normalizeOneUnit(raw, n);
          if (u) units.push(u);
        } catch {
          /* skip a failed unit, keep the rest */
        }
      }
    }

    // Fallback: notes have no usable unit tags → single holistic generation.
    if (units.length === 0) {
      const chunks = await analyzerRepository.sampleChunks(subjectId, 6, 50);
      if (chunks.length === 0) {
        return { subject: meta, units: [], generatedAt: null, model: null, status: 'none' as const };
      }
      const context = chunks
        .map((c) => `${c.unit != null ? `[Unit ${c.unit}] ` : ''}${c.content}`)
        .join('\n---\n')
        .slice(0, 9000);
      const sys = `You are an expert tutor building a study roadmap STRICTLY from a subject's own lecture notes.
Output ONLY JSON: {"units":[{"title":"...","summary":"...","topics":[{"title":"...","subtopics":["...","..."]}]}]}
Rules: derive ONLY from the notes; never invent; order foundational→advanced; produce 4-8 units; each 2-6 topics; each 2-6 subtopics.`;
      const user = `Subject: ${meta.name} (Semester ${meta.semester}).
NOTES EXCERPTS:
${context}

Return the roadmap JSON now.`;
      const raw = await chat(
        [
          { role: 'system', content: sys },
          { role: 'user', content: user },
        ],
        { schema: ROADMAP_SCHEMA, temperature: 0.2, numCtx: 8192, timeoutMs: 240_000 },
      );
      units = normalizeUnits(extractJson(raw) ?? (() => { try { return JSON.parse(raw); } catch { return null; } })());
    }

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
    const q = question.trim();

    const qvec = await embedText(q);
    const chunks = await analyzerRepository.topChunks(subjectId, toVectorLiteral(qvec), 8);

    const context = chunks
      .map((c, i) => `[${i + 1}] (${c.title}${c.unit != null ? `, Unit ${c.unit}` : ''})\n${c.content}`)
      .join('\n\n')
      .slice(0, 12000);

    const sys = `You are an expert, genuinely helpful tutor for the university subject "${meta.name}".
Help the student learn THIS subject well:
- Explain concepts clearly, solve problems step by step, and WRITE complete, correct example code / programs / derivations / worked solutions whenever they help. For programming and technical subjects this is expected — give real, runnable sample code.
- Use the NOTES excerpts below as your primary reference, but you MAY apply standard, correct knowledge of "${meta.name}" to give a complete, useful answer (a working sample program, a full derivation, extra examples) as long as it stays within this subject.
- Cite note excerpts like [1], [2] when you draw directly from them (optional for general examples).

SCOPE — decline ONLY if the question is clearly NOT about "${meta.name}" or studying it (general chit-chat, unrelated domains, personal or current-events questions). Then reply briefly: "I'm your ${meta.name} study assistant — ask me anything about this subject." NEVER decline a legitimate ${meta.name} study request, including asks for sample code, programs, problems, proofs, or explanations — answer those fully.`;
    const user = chunks.length
      ? `NOTES EXCERPTS:\n${context}\n\nQUESTION: ${q}`
      : `(No notes are indexed for this subject yet. If the question is about ${meta.name}, answer it well from standard subject knowledge; otherwise decline per the scope rule.)\n\nQUESTION: ${q}`;

    const answer = await chat(
      [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
      { temperature: 0.35, numCtx: 8192, timeoutMs: 240_000 },
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
