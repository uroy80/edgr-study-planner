export function Spinner({ size = 28, label }: { size?: number; label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10">
      <span
        className="inline-block rounded-full animate-spin"
        style={{
          width: size,
          height: size,
          border: `${Math.max(2, size / 12)}px solid var(--border-subtle, rgba(255,255,255,0.1))`,
          borderTopColor: 'var(--accent-cyan, #06b6d4)',
        }}
      />
      {label && (
        <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
          {label}
        </span>
      )}
    </div>
  );
}
