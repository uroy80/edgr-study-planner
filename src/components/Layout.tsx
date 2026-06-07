import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/', label: 'Study Corner', end: true },
  { to: '/analyzer', label: 'Analyzer' },
];

export function Layout() {
  return (
    <div style={{ minHeight: '100vh', position: 'relative', background: 'var(--bg-primary)' }}>
      <div className="guilloche-bg" aria-hidden />

      <header
        className="sticky top-0 z-30 backdrop-blur-xl"
        style={{
          background: 'color-mix(in oklab, var(--bg-primary) 80%, transparent)',
          borderBottom: '1px solid var(--border-faint)',
        }}
      >
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-sm font-black"
              style={{ background: 'var(--accent-cyan)', color: '#001014' }}
            >
              e
            </span>
            <span className="font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              edgr <span style={{ color: 'var(--text-faint)' }}>· study</span>
            </span>
          </div>
          <nav className="flex gap-1.5">
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className="px-3.5 py-1.5 rounded-xl text-sm font-semibold transition-all active:scale-95"
                style={({ isActive }) =>
                  isActive
                    ? { background: 'var(--accent-cyan)', color: '#001014' }
                    : {
                        background: 'var(--bg-subtle)',
                        color: 'var(--text-muted)',
                        border: '1px solid var(--border-faint)',
                      }
                }
              >
                {t.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="relative z-10">
        <Outlet />
      </main>
    </div>
  );
}
