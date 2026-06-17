import { useEffect, useState } from 'react';
import { api, type EvolutionTask } from '../api';

const styles = {
  heading: { fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20 },
  toolbar: { display: 'flex', gap: 8, marginBottom: 20 },
  button: {
    background: 'var(--accent)',
    border: 'none',
    borderRadius: 6,
    padding: '8px 16px',
    color: 'var(--accent-fg)',
    fontSize: 14,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  buttonSecondary: {
    background: 'var(--border)',
    border: 'none',
    borderRadius: 6,
    padding: '8px 16px',
    color: 'var(--text-primary)',
    fontSize: 14,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  buttonDanger: {
    background: 'var(--danger)',
    border: 'none',
    borderRadius: 6,
    padding: '6px 12px',
    color: 'var(--accent-fg)',
    fontSize: 12,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  buttonConfirm: {
    background: 'var(--accent)',
    border: 'none',
    borderRadius: 6,
    padding: '6px 12px',
    color: 'var(--accent-fg)',
    fontSize: 12,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 8 },
  card: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
  },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardId: { color: 'var(--text-accent)', fontSize: 12 },
  badge: (color: string, bg: string) => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 12,
    fontSize: 11,
    color,
    background: bg,
  }),
  cardDetail: { color: 'var(--text-primary)', fontSize: 14, marginBottom: 8 },
  cardTime: { color: 'var(--text-secondary)', fontSize: 11 },
  actions: { display: 'flex', gap: 8, marginTop: 8 },
  empty: { color: 'var(--text-secondary)', fontSize: 13, padding: 20 },
  error: { color: 'var(--danger)', fontSize: 13 },
  result: { color: 'var(--accent)', fontSize: 13, marginBottom: 12 },
  statusBadge: (s: string) => {
    if (s === 'pending') return { display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, color: '#d29922', background: '#d2992233' } as React.CSSProperties;
    if (s === 'confirmed' || s === 'executed') return { display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, color: '#3fb950', background: '#23863633' } as React.CSSProperties;
    return { display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, color: 'var(--danger)', background: '#f8514933' } as React.CSSProperties;
  },
};

export default function Evolution() {
  const [tasks, setTasks] = useState<EvolutionTask[]>([]);
  const [history, setHistory] = useState<EvolutionTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadTasks = () => api.listEvolutionTasks().then(setTasks).catch(() => {});
  const loadHistory = () => api.listEvolutionHistory().then(setHistory).catch(() => {});

  useEffect(() => {
    loadTasks();
    loadHistory();
  }, []);

  const handleAnalyze = async () => {
    setLoading(true);
    setErr('');
    setMsg('');
    try {
      const res = await api.analyze();
      setMsg(`Found ${res.new_tasks} new task(s)`);
      loadTasks();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (id: string) => {
    try {
      await api.confirmTask(id);
      loadTasks();
      loadHistory();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleReject = async (id: string) => {
    try {
      await api.rejectTask(id);
      loadTasks();
      loadHistory();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const statusStyle = (s: string) => {
    if (s === 'pending') return ['#d29922', '#d2992233'] as const;
    if (s === 'confirmed' || s === 'executed') return ['#3fb950', '#23863633'] as const;
    return ['var(--danger)', '#f8514933'] as const;
  };

  return (
    <>
      <h1 style={styles.heading}>Evolution</h1>

      <div style={styles.toolbar}>
        <button style={loading ? styles.buttonSecondary : styles.button} onClick={handleAnalyze} disabled={loading}>
          {loading ? 'Analyzing...' : 'Analyze'}
        </button>
      </div>

      {msg && <div style={styles.result}>{msg}</div>}
      {err && <div style={styles.error}>{err}</div>}

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Pending Tasks ({tasks.length})</div>
        {tasks.length === 0 ? <div style={styles.empty}>No pending tasks</div> : tasks.map((t) => (
          <div key={t.id} style={styles.card}>
            <div style={styles.cardHeader}>
              <span style={styles.cardId}>{t.id}</span>
              <span style={styles.statusBadge(t.status)}>{t.status}</span>
            </div>
            <div style={styles.cardDetail}>{t.detail}</div>
            <div style={styles.cardTime}>Type: {t.type} | Created: {t.created_at}</div>
            <div style={styles.actions}>
              <button style={styles.buttonConfirm} onClick={() => handleConfirm(t.id)}>Confirm</button>
              <button style={styles.buttonDanger} onClick={() => handleReject(t.id)}>Reject</button>
            </div>
          </div>
        ))}
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>History</div>
        {history.length === 0 ? <div style={styles.empty}>No history yet</div> : history.map((t) => (
          <div key={t.id} style={styles.card}>
            <div style={styles.cardHeader}>
              <span style={styles.cardId}>{t.id}</span>
              <span style={styles.statusBadge(t.status)}>{t.status}</span>
            </div>
            <div style={styles.cardDetail}>{t.detail}</div>
            <div style={styles.cardTime}>Type: {t.type} | Resolved: {t.resolved_at ?? '-'}</div>
          </div>
        ))}
      </div>
    </>
  );
}
