import { useEffect, useState } from 'react';
import { api, type ServerStatus } from '../api';
import { MethodologyBanner } from '../components/MethodologyBanner';

const styles = {
  heading: { fontSize: 22, fontWeight: 700 as const, color: 'var(--text-primary)', marginBottom: 20 },
  section: { marginBottom: 28 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 600 as const,
    color: 'var(--text-primary)',
    marginBottom: 12,
    borderBottom: '1px solid var(--border)',
    paddingBottom: 8,
  },
  cards: { display: 'flex', gap: 16, flexWrap: 'wrap' as const },
  card: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '20px 24px',
    minWidth: 160,
    flex: '1 1 160px',
  },
  cardLabel: {
    color: 'var(--text-secondary)',
    fontSize: 12,
    marginBottom: 6,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  cardValue: { color: 'var(--text-primary)', fontSize: 28, fontWeight: 700 as const },
  evoRow: { display: 'flex', gap: 16, flexWrap: 'wrap' as const },
  evoCol: {
    flex: '1 1 280px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 20,
    minHeight: 120,
  },
  evoColTitle: {
    fontSize: 14,
    fontWeight: 600 as const,
    color: 'var(--text-primary)',
    marginBottom: 8,
  },
  evoColBody: {
    color: 'var(--text-secondary)',
    fontSize: 13,
    fontStyle: 'italic' as const,
  },
};

function fmt(n: number | undefined | null): string {
  return n === undefined || n === null ? '-' : String(n);
}

export default function Dashboard() {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [sources, setSources] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<number | null>(null);
  const [highValue, setHighValue] = useState<number | null>(null);

  useEffect(() => {
    api.getStatus().then(setStatus).catch(() => {});
    api.listStageItems('collect').then((r) => setSources(r.total)).catch(() => {});
    api.listStageItems('filter').then((r) => setCandidates(r.total)).catch(() => {});
    api.listStageItems('shape').then((r) => setHighValue(r.total)).catch(() => {});
  }, []);

  return (
    <>
      <MethodologyBanner />
      <h1 style={styles.heading}>Dashboard</h1>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Memory</div>
        <div style={styles.cards}>
          <div style={styles.card}>
            <div style={styles.cardLabel}>Episodic Floor</div>
            <div style={styles.cardValue}>{fmt(status?.memory_counts.episodic)}</div>
          </div>
          <div style={styles.card}>
            <div style={styles.cardLabel}>Semantic Floor</div>
            <div style={styles.cardValue}>{fmt(status?.memory_counts.semantic)}</div>
          </div>
          <div style={styles.card}>
            <div style={styles.cardLabel}>Procedural Floor</div>
            <div style={styles.cardValue}>{fmt(status?.memory_counts.procedural)}</div>
          </div>
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Collection</div>
        <div style={styles.cards}>
          <div style={styles.card}>
            <div style={styles.cardLabel}>Sources</div>
            <div style={styles.cardValue}>{fmt(sources)}</div>
          </div>
          <div style={styles.card}>
            <div style={styles.cardLabel}>Candidates</div>
            <div style={styles.cardValue}>{fmt(candidates)}</div>
          </div>
          <div style={styles.card}>
            <div style={styles.cardLabel}>High Value</div>
            <div style={styles.cardValue}>{fmt(highValue)}</div>
          </div>
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Evolution</div>
        <div style={styles.evoRow}>
          <div style={styles.evoCol}>
            <div style={styles.evoColTitle}>进化 · Evolution</div>
            <div style={styles.evoColBody}>Coming soon — task counts & confirmation stats</div>
          </div>
          <div style={styles.evoCol}>
            <div style={styles.evoColTitle}>退化 · Devolution</div>
            <div style={styles.evoColBody}>设计中 (RFC-004) — forgetting & decay metrics</div>
          </div>
        </div>
      </div>
    </>
  );
}
