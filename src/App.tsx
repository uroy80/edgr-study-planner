// Minimal scaffold shell — replaced by the full router/layout in SP-4.
export function App() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--bg-primary, #14141c)',
      }}
    >
      <div style={{ textAlign: 'center', padding: 24 }}>
        <h1 className="text-3xl font-extrabold" style={{ color: 'var(--text-primary, #e7e7ea)' }}>
          edgr · study planner
        </h1>
        <p style={{ color: 'var(--text-faint, #8a8a93)', marginTop: 8 }}>
          Study Corner + Analyzer — scaffold is up.
        </p>
      </div>
    </div>
  );
}
