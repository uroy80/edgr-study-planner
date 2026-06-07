import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { api } from '../api/client';
import { Spinner } from '../components/Spinner';
import type {
  StudySubjectSummary,
  StudySubjectDetail,
  StudyMaterialView,
  StudyPlaylist,
} from '../api/types';

function tone(triad: string) {
  return { bg: `var(--${triad}-bg)`, border: `var(--${triad}-border)`, text: `var(--${triad}-text)` };
}
function plural(n: number, w: string) {
  return `${n} ${w}${n === 1 ? '' : 's'}`;
}
function openFile(url: string) {
  window.open(url, '_blank', 'noopener');
}

type CatKey = 'syllabus' | 'notes' | 'pyq' | 'other';
const CATS: Record<CatKey, { label: string; triad: string; icon: ReactElement }> = {
  syllabus: { label: 'Syllabus', triad: 'cyan', icon: <path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM14 4v5h5M8 13h8M8 17h5" /> },
  notes: { label: 'Unit-wise Notes', triad: 'violet', icon: <path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5zM8 7h7M8 11h7" /> },
  pyq: { label: 'Previous Year Questions', triad: 'amber', icon: <path d="M9 3h6l1 2h3v15H5V5h3l1-2zM9 12l2 2 4-4" /> },
  other: { label: 'Other', triad: 'emerald', icon: <path d="M4 7h16M4 12h16M4 17h10" /> },
};

const ICONS: { test: RegExp; icon: ReactElement }[] = [
  { test: /secur|cyber|crypto|forensi|network|protocol/i, icon: <path d="M12 3l7 3v5c0 4.2-2.9 7.4-7 8.5C7.9 18.4 5 15.2 5 11V6l7-3z" /> },
  { test: /data|sql|mining|warehouse|analyt|statist|probab/i, icon: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /> },
  { test: /comput|program|algorithm|compil|software|\bdsa\b|\bai\b|machine|web|coding/i, icon: <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" /> },
  { test: /calcul|algebra|math|discrete|linear|transform|numeric/i, icon: <path d="M19 4H7l5 8-5 8h12" /> },
  { test: /physic|electro|circuit|electr|quantum|wave|mechanic/i, icon: <path d="M12 2v4M12 18v4M2 12h4M18 12h4" /> },
  { test: /chem|material|polymer|biolog|cell|environ/i, icon: <path d="M9 3h6M10 3v6l-5 8.5A2 2 0 006.7 21h10.6a2 2 0 001.7-3L14 9V3" /> },
  { test: /english|languag|communic|literat|philosoph|skill|management|business/i, icon: <path d="M21 15a2 2 0 01-2 2H8l-4 4V5a2 2 0 012-2h13a2 2 0 012 2v10z" /> },
];
const DEF_ICON = (
  <>
    <path d="M5 4a2 2 0 012-2h11v18H7a2 2 0 01-2 2V4z" />
    <path d="M9 7h7M9 11h7" />
  </>
);
function subjectIcon(name: string): ReactElement {
  for (const i of ICONS) if (i.test.test(name)) return i.icon;
  return DEF_ICON;
}

function MaterialRow({ m }: { m: StudyMaterialView }) {
  const ext = (m.kind || 'pdf').toUpperCase();
  return (
    <div className="flex items-center gap-3 pl-3 pr-2.5 py-2.5 rounded-xl backdrop-blur-sm bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--border-hover)] transition-all duration-300">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
          {m.title}
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          {m.hasFile && (
            <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: 'var(--rose-bg)', color: 'var(--rose-text)' }}>
              {ext}
            </span>
          )}
          {!m.hasFile && (
            <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
              opens externally
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => (m.hasFile && m.fileUrl ? openFile(m.fileUrl) : m.externalUrl && openFile(m.externalUrl))}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-transform active:scale-95"
          style={{ background: 'var(--accent-cyan)', color: '#001014' }}
        >
          Open
        </button>
        {m.hasFile && m.downloadUrl && (
          <a
            href={m.downloadUrl}
            className="p-2 rounded-lg transition-transform active:scale-95"
            style={{ background: 'var(--bg-active)', color: 'var(--text-secondary)' }}
            title="Download"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12M7 11l5 5 5-5M5 21h14" />
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}

function Section({ cat, items }: { cat: CatKey; items: StudyMaterialView[] }) {
  if (items.length === 0) return null;
  const c = CATS[cat];
  const t = tone(c.triad);
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg" style={{ background: t.bg, border: `1px solid ${t.border}` }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.text} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            {c.icon}
          </svg>
        </span>
        <h3 className="text-[13px] font-bold tracking-wide" style={{ color: 'var(--text-secondary)' }}>
          {c.label}
        </h3>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: t.bg, color: t.text }}>
          {items.length}
        </span>
      </div>
      <div className="space-y-2">
        {items.map((m) => (
          <MaterialRow key={m.id} m={m} />
        ))}
      </div>
    </div>
  );
}

function PlaylistLinks({ playlists }: { playlists: StudyPlaylist[] }) {
  if (!playlists?.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mb-5">
      {playlists.map((pl) => (
        <a
          key={pl.url}
          href={pl.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
          style={{ background: 'var(--rose-bg)', color: 'var(--rose-text)', border: '1px solid var(--rose-border)' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
          {/playlist/i.test(pl.label) ? 'Video playlist' : pl.label}
        </a>
      ))}
    </div>
  );
}

function SubjectDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [d, setD] = useState<StudySubjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .studySubject(id)
      .then((r) => alive && (r.success ? setD(r.data) : setErr(true)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  if (loading) return <Spinner label="Loading subject…" />;
  if (err || !d)
    return (
      <div className="text-center py-16">
        <p style={{ color: 'var(--text-faint)' }}>Couldn’t load this subject.</p>
        <button onClick={onBack} className="mt-3 text-sm" style={{ color: 'var(--accent-cyan)' }}>
          ← Back
        </button>
      </div>
    );

  const notes = [...d.materials.notes].sort((a, b) => (a.unit ?? 99) - (b.unit ?? 99));
  return (
    <div>
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm mb-4" style={{ color: 'var(--accent-cyan)' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M11 18l-6-6 6-6" />
        </svg>
        All subjects
      </button>
      <div
        className="flex items-start gap-4 p-4 rounded-2xl mb-5"
        style={{ background: 'linear-gradient(135deg, var(--bg-elevated), var(--bg-card))', border: '1px solid var(--border-subtle)', backdropFilter: 'blur(10px)' }}
      >
        <span className="shrink-0 inline-flex items-center justify-center w-12 h-12 rounded-xl" style={{ background: 'var(--bg-active)', border: '1px solid var(--border-subtle)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-cyan)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            {subjectIcon(d.subject.name)}
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold leading-tight" style={{ color: 'var(--text-strong, var(--text-primary))' }}>
            {d.subject.name}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
            Semester {d.subject.semester}
            {d.subject.code ? ` · ${d.subject.code}` : ''} · {d.counts.total} materials
          </p>
        </div>
      </div>
      <PlaylistLinks playlists={d.subject.playlists ?? []} />
      <Section cat="syllabus" items={d.materials.syllabus} />
      <Section cat="notes" items={notes} />
      <Section cat="pyq" items={d.materials.pyqs} />
      <Section cat="other" items={d.materials.other} />
      {d.counts.total === 0 && (
        <p className="text-center py-10 text-sm" style={{ color: 'var(--text-faint)' }}>
          No materials yet for this subject.
        </p>
      )}
    </div>
  );
}

function SubjectCard({ s, onClick }: { s: StudySubjectSummary; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group text-left p-4 rounded-2xl w-full backdrop-blur-sm bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-card-hover)] transition-all duration-300"
    >
      <div className="flex items-center gap-3.5">
        <span className="shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-xl" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-faint)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="transition-colors group-hover:[stroke:var(--accent-cyan)]">
            {subjectIcon(s.name)}
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>
            {s.name}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[11px]" style={{ color: 'var(--text-faint)' }}>
            <span>{plural(s.materialCount ?? 0, 'material')}</span>
            {(s.noteCount ?? 0) > 0 && <span>· {plural(s.noteCount!, 'note')}</span>}
            {(s.pyqCount ?? 0) > 0 && <span style={{ color: 'var(--amber-text)' }}>· {plural(s.pyqCount!, 'PYQ')}</span>}
          </div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-ghost)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 transition-transform group-hover:translate-x-0.5">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </div>
    </button>
  );
}

export function StudyCornerPage() {
  const [semesters, setSemesters] = useState<number[]>([]);
  const [semester, setSemester] = useState(1);
  const [subjects, setSubjects] = useState<StudySubjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    api.studySemesters().then((r) => {
      if (r.success && r.data.semesters.length) {
        setSemesters(r.data.semesters);
        if (!r.data.semesters.includes(semester)) setSemester(r.data.semesters[0]);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    api
      .studySubjects(semester)
      .then((r) => setSubjects(r.success ? r.data.subjects : []))
      .finally(() => setLoading(false));
  }, [semester]);

  useEffect(() => {
    setSelected(null);
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? subjects.filter((s) => s.name.toLowerCase().includes(q)) : subjects;
  }, [subjects, query]);

  const tabSems = semesters.length ? semesters : [semester];

  return (
    <div className="max-w-3xl mx-auto px-4 pt-6 pb-16">
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
        Study Corner
      </h1>
      <p className="text-xs mt-0.5 mb-4" style={{ color: 'var(--text-faint)' }}>
        Notes, PYQs &amp; syllabi — semester &amp; unit-wise
      </p>

      {selected ? (
        <SubjectDetail id={selected} onBack={() => setSelected(null)} />
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
            {tabSems.map((s) => (
              <button
                key={s}
                onClick={() => setSemester(s)}
                className="px-4 py-1.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all active:scale-95"
                style={
                  s === semester
                    ? { background: 'var(--accent-cyan)', color: '#001014' }
                    : { background: 'var(--bg-subtle)', color: 'var(--text-muted)', border: '1px solid var(--border-faint)' }
                }
              >
                Sem {s}
              </button>
            ))}
          </div>

          <input
            placeholder="Search subjects…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full px-3.5 py-2 rounded-xl text-sm outline-none mb-4 focus:ring-2 focus:ring-[var(--accent-cyan)]/40"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-faint)', color: 'var(--text-primary)' }}
          />

          {loading ? (
            <Spinner label="Loading subjects…" />
          ) : filtered.length === 0 ? (
            <p className="text-center py-16 text-sm" style={{ color: 'var(--text-faint)' }}>
              {subjects.length === 0 ? 'No subjects for this semester yet.' : 'No subjects match your search.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {filtered.map((s) => (
                <SubjectCard key={s.id} s={s} onClick={() => setSelected(s.id)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
