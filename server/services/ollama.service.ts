/**
 * Minimal Ollama client (HTTP). Talks to a native Ollama on the host
 * (host.docker.internal:11434) — embeddings + chat. No SDK needed.
 */
import { env } from '../config/env.js';

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

async function post(path: string, body: unknown, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(`${env.ollamaHost}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error(`ollama ${path} -> ${r.status} ${t.slice(0, 200)}`);
    }
    return r.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function ollamaUp(): Promise<boolean> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 3000);
    const r = await fetch(`${env.ollamaHost}/api/tags`, { signal: c.signal });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

export async function embedText(text: string): Promise<number[]> {
  const j = await post('/api/embeddings', { model: env.ollamaEmbedModel, prompt: text }, 60_000);
  if (!Array.isArray(j.embedding)) throw new Error('ollama: no embedding returned');
  return j.embedding as number[];
}

export async function chat(
  messages: Msg[],
  opts: { json?: boolean; schema?: object; temperature?: number; numCtx?: number; timeoutMs?: number } = {},
): Promise<string> {
  // Ollama structured output: `format` may be the string 'json' OR a full JSON
  // schema object the model is forced to conform to.
  const format = opts.schema ?? (opts.json ? 'json' : undefined);
  const j = await post(
    '/api/chat',
    {
      model: env.ollamaChatModel,
      messages,
      stream: false,
      think: false, // qwen3: skip the thinking phase for speed
      ...(format ? { format } : {}),
      options: {
        temperature: opts.temperature ?? 0.3,
        ...(opts.numCtx ? { num_ctx: opts.numCtx } : {}),
      },
    },
    opts.timeoutMs ?? 180_000,
  );
  return (j.message?.content as string) ?? '';
}

/** pgvector literal: '[0.1,0.2,...]' */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}
