export function MethodologyBanner() {
  return (
    <div
      style={{
        padding: 8,
        background: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        width: '100%',
        marginBottom: 20,
      }}
    >
      <svg
        viewBox="0 0 800 100"
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        <rect x="40" y="25" width="90" height="50" rx="5" fill="var(--bg-secondary)" stroke="var(--border)" strokeWidth="1.2" />
        <text x="85" y="50" textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--text-primary)">资产</text>
        <text x="85" y="66" textAnchor="middle" fontSize="10" fill="var(--text-secondary)">Assets</text>

        <rect x="670" y="25" width="90" height="50" rx="5" fill="var(--bg-secondary)" stroke="var(--border)" strokeWidth="1.2" />
        <text x="715" y="50" textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--text-primary)">记忆</text>
        <text x="715" y="66" textAnchor="middle" fontSize="10" fill="var(--text-secondary)">Memory</text>

        <defs>
          <marker id="ev" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
            <polygon points="0 0, 9 4.5, 0 9" fill="var(--accent)" />
          </marker>
          <marker id="dv" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
            <polygon points="0 0, 9 4.5, 0 9" fill="var(--text-secondary)" />
          </marker>
        </defs>

        <path d="M 130 35 Q 400 0 670 35" fill="none" stroke="var(--accent)" strokeWidth="1.6" markerEnd="url(#ev)" />
        <rect x="355" y="2" width="90" height="18" rx="9" fill="var(--bg-secondary)" stroke="var(--accent)" strokeWidth="1" />
        <text x="400" y="15" textAnchor="middle" fontSize="11" fill="var(--accent)">进化·提炼</text>

        <g>
          <title>Forgetting · 设计中 (RFC-004)</title>
          <path d="M 670 65 Q 400 100 130 65" fill="none" stroke="var(--text-secondary)" strokeWidth="1.6" strokeDasharray="4 3" markerEnd="url(#dv)" />
          <rect x="355" y="80" width="90" height="18" rx="9" fill="var(--bg-secondary)" stroke="var(--text-secondary)" strokeWidth="1" />
          <text x="400" y="93" textAnchor="middle" fontSize="11" fill="var(--text-secondary)">退化·遗忘</text>
        </g>
      </svg>
    </div>
  );
}
