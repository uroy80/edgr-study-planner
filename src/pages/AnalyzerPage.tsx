import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { Spinner } from '../components/Spinner';
import type { AnalyzerSubjectCard, SubjectRoadmap, ChatCitation } from '../api/types';

// ── Roadmap view ─────────────────────────────────────────────────────
function RoadmapView({ subjectId }: { subjectId: string }) {
  const [roadmap, setRoadmap] = useState<SubjectRoadmap | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [open, setOpen] = useState<Record<number, boolean>>({ 0: true });

  const load = () => {
    setLoading(true);
    api.roadmap(subjectId).then((r) => {
      setRoadmap(r.success ? r.data : null);
      setLoading(false);
    });
  };
  useEffect(load, [subjectId]);

  const generate = async () => {
    setGenerating(true);
    const r = await api.generateRoadmap(subjectId);
    if (r.success) setRoadmap(r.data);
    setGenerating(false);
  };

  if (loading) return <Spinner label="Loading roadmap…" />;
  const ready = roadmap?.status === 'ready' && roadmap.units?.length;

  if (!ready) {
    return (
      <div className="text-center py-10">
        <p className="text-sm mb-3" style={{ color: 'var(--text-faint)' }}>
          {generating
            ? 'Reading the notes and building your roadmap… (local model, ~1–2 min)'
            : 'No roadmap yet for this subject.'}
        </p>
        {generating ? (
          <Spinner label="Generating with qwen3:8b…" />
        ) : (
          <button
            onClick={generate}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-transform active:scale-95"
            style={{ background: 'var(--accent-cyan)', color: '#001014' }}
          >
            Generate roadmap from notes
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {roadmap!.units.map((u, ui) => (
        <div key={ui} className="rounded-xl backdrop-blur-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
          <button
            onClick={() => setOpen((o) => ({ ...o, [ui]: !o[ui] }))}
            className="w-full flex items-center gap-3 p-3.5 text-left"
          >
            <span className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold" style={{ background: 'var(--violet-bg)', color: 'var(--violet-text)' }}>
              {ui + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                {u.title}
              </div>
              {u.summary && (
                <div className="text-[11px] mt-0.5 line-clamp-1" style={{ color: 'var(--text-faint)' }}>
                  {u.summary}
                </div>
              )}
            </div>
            <span className="text-xs" style={{ color: 'var(--text-ghost)' }}>
              {u.topics.length} topics
            </span>
          </button>
          {open[ui] && (
            <div className="px-3.5 pb-3.5 space-y-2.5">
              {u.summary && (
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {u.summary}
                </p>
              )}
              {u.topics.map((t, ti) => (
                <div key={ti} className="pl-3 border-l-2" style={{ borderColor: 'var(--cyan-border)' }}>
                  <div className="text-[13px] font-semibold" style={{ color: 'var(--accent-cyan)' }}>
                    {t.title}
                  </div>
                  {t.subtopics?.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {t.subtopics.map((s, si) => (
                        <li key={si} className="text-xs flex gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                          <span style={{ color: 'var(--text-ghost)' }}>·</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <p className="text-[10px] text-center pt-1" style={{ color: 'var(--text-ghost)' }}>
        Generated from this subject's notes{roadmap!.model ? ` · ${roadmap!.model}` : ''}
      </p>
    </div>
  );
}

// ── Chat view ────────────────────────────────────────────────────────
type Msg = { role: 'user' | 'assistant'; text: string; citations?: ChatCitation[] };

function ChatView({ subjectId }: { subjectId: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, busy]);

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput('');
    setMsgs((m) => [...m, { role: 'user', text: q }]);
    setBusy(true);
    const r = await api.chat(subjectId, q);
    setMsgs((m) => [
      ...m,
      r.success
        ? { role: 'assistant', text: r.data.answer, citations: r.data.citations }
        : { role: 'assistant', text: '⚠️ Couldn’t answer (is the analyzer indexed and Ollama running?).' },
    ]);
    setBusy(false);
  };

  return (
    <div className="flex flex-col" style={{ height: '60vh' }}>
      <div className="flex-1 overflow-y-auto space-y-3 pb-3">
        {msgs.length === 0 && (
          <p className="text-sm text-center py-10" style={{ color: 'var(--text-faint)' }}>
            Ask anything about this subject — answers are grounded in its notes, with citations.
          </p>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className="max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-wrap"
              style={
                m.role === 'user'
                  ? { background: 'var(--accent-cyan)', color: '#001014' }
                  : { background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }
              }
            >
              {m.text}
              {m.citations && m.citations.length > 0 && (
                <div className="mt-2 pt-2 flex flex-wrap gap-1.5" style={{ borderTop: '1px solid var(--border-faint)' }}>
                  {m.citations.map((c, ci) => (
                    <span key={ci} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--violet-bg)', color: 'var(--violet-text)' }} title={c.snippet}>
                      {c.title}
                      {c.unit ? ` · U${c.unit}` : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <Spinner label="Thinking…" />}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2 pt-2" style={{ borderTop: '1px solid var(--border-faint)' }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Ask about this subject…"
          className="flex-1 px-3.5 py-2 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/40"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-faint)', color: 'var(--text-primary)' }}
        />
        <button
          onClick={send}
          disabled={busy || !input.trim()}
          className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 transition-transform active:scale-95"
          style={{ background: 'var(--accent-cyan)', color: '#001014' }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────
export function AnalyzerPage() {
  const [subjects, setSubjects] = useState<AnalyzerSubjectCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [notReady, setNotReady] = useState(false);
  const [sel, setSel] = useState<AnalyzerSubjectCard | null>(null);
  const [tab, setTab] = useState<'roadmap' | 'chat'>('roadmap');

  useEffect(() => {
    api.analyzerSubjects().then((r) => {
      if (r.success) setSubjects(r.data.subjects);
      else setNotReady(true);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="max-w-3xl mx-auto px-4 pt-6"><Spinner label="Loading analyzer…" /></div>;

  if (notReady) {
    return (
      <div className="max-w-3xl mx-auto px-4 pt-6 pb-16">
        <h1 className="text-2xl font-extrabold" style={{ color: 'var(--text-primary)' }}>Analyzer</h1>
        <div className="mt-6 p-5 rounded-2xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            The Analyzer is being set up. Once the notes are indexed and a local model is running, you'll get a
            <strong> Units → Topics → Sub-topics roadmap</strong> and a <strong>notes-grounded chat</strong> for every subject.
          </p>
        </div>
      </div>
    );
  }

  if (sel) {
    return (
      <div className="max-w-3xl mx-auto px-4 pt-6 pb-16">
        <button onClick={() => setSel(null)} className="inline-flex items-center gap-1.5 text-sm mb-4" style={{ color: 'var(--accent-cyan)' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M11 18l-6-6 6-6" />
          </svg>
          All subjects
        </button>
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{sel.name}</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--text-faint)' }}>
          Semester {sel.semester} · {sel.noteCount} notes{sel.chunks ? ` · ${sel.chunks} indexed chunks` : ' · not indexed yet'}
        </p>
        <div className="flex gap-2 mb-4">
          {(['roadmap', 'chat'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-4 py-1.5 rounded-xl text-sm font-semibold transition-all active:scale-95"
              style={tab === t ? { background: 'var(--accent-cyan)', color: '#001014' } : { background: 'var(--bg-subtle)', color: 'var(--text-muted)', border: '1px solid var(--border-faint)' }}
            >
              {t === 'roadmap' ? 'Roadmap' : 'Ask (chat)'}
            </button>
          ))}
        </div>
        {tab === 'roadmap' ? <RoadmapView subjectId={sel.id} /> : <ChatView subjectId={sel.id} />}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pt-6 pb-16">
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>Analyzer</h1>
      <p className="text-xs mt-0.5 mb-4" style={{ color: 'var(--text-faint)' }}>
        Notes-grounded roadmaps &amp; chat — pick a subject
      </p>
      {subjects.length === 0 ? (
        <p className="text-center py-16 text-sm" style={{ color: 'var(--text-faint)' }}>No subjects indexed yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {subjects.map((s) => (
            <button
              key={s.id}
              onClick={() => { setSel(s); setTab('roadmap'); }}
              className="group text-left p-4 rounded-2xl backdrop-blur-sm bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--border-hover)] transition-all duration-300"
            >
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{s.name}</div>
              <div className="flex flex-wrap items-center gap-x-2 mt-1 text-[11px]" style={{ color: 'var(--text-faint)' }}>
                <span>Sem {s.semester}</span>
                <span>· {s.noteCount} notes</span>
                {s.hasRoadmap && <span style={{ color: 'var(--violet-text)' }}>· roadmap ✓</span>}
                {s.indexed && <span style={{ color: 'var(--emerald-text)' }}>· indexed</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
