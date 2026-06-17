interface StatCardProps {
  label: string;
  total: number;
  today: number;
  color: string;
  onClick?: () => void;
}

export default function StatCard({ label, total, today, color, onClick }: StatCardProps) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 16,
        cursor: onClick ? 'pointer' : 'default',
        flex: 1,
        minWidth: 120,
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{total}</div>
      {today > 0 && (
        <div style={{ fontSize: 12, color: '#3fb950', marginTop: 4 }}>+{today} today</div>
      )}
    </div>
  );
}
