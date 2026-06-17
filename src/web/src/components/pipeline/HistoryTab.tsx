import { useEffect, useState, useCallback } from 'react';
import { api, type PipelineRunRow } from '../../api';

const STAGE_IDS = ['collect', 'filter', 'shape', 'materialize'];
const STATUS_OPTS = ['running', 'success', 'partial', 'failed', 'skipped'];

function fmtDate(s: string | null): string {
  if (!s) return '-';
  return s.replace('T', ' ').slice(0, 19);
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    success: '#2f9e44',
    partial: '#f59f00',
    failed:  '#c0392b',
    running: '#3b82f6',
    skipped: '#6b7280',
  };
  const c = colors[status] ?? '#6b7280';
  return (
    <span
      style={{
        color: c,
        background: `${c}26`,
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {status}
    </span>
  );
}

const btnBase = {
  background: 'transparent',
  border: '1px solid var(--border, #d2d2d7)',
  borderRadius: 4,
  padding: '4px 10px',
  fontSize: 12,
  fontFamily: 'inherit',
  color: 'var(--text-primary)',
  cursor: 'pointer',
};

export function HistoryTab() {
  const [rows, setRows] = useState<PipelineRunRow[]>([]);
  const [stats, setStats] = useState<{ total: number; threshold: number; over_threshold: boolean } | null>(null);
  const [stageFilter, setStageFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [detail, setDetail] = useState<PipelineRunRow | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const refresh = useCallback(async () => {
    const [runs, st] = await Promise.all([
      api.listRuns({
        stage_id: stageFilter || undefined,
        status: statusFilter || undefined,
        limit: 200,
      }),
      api.getRunStats(),
    ]);
    setRows(runs.rows);
    setStats(st);
  }, [stageFilter, statusFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  const cleanupOld = async () => {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await api.clearRuns({ before: cutoff, status: 'success' });
    setConfirmOpen(false);
    await refresh();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Run History</h2>

      {stats && stats.over_threshold && (
        <div style={{ padding: 12, background: '#f59f0026', border: '1px solid #f59f00', borderRadius: 6, fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>共 {stats.total} 条历史记录，建议保留 &lt; {stats.threshold}</span>
          <button type="button" style={btnBase} onClick={() => setConfirmOpen(true)}>
            清理 30 天前的成功 run
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
        <span style={{ color: 'var(--text-secondary)' }}>Stage:</span>
        <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} style={{ padding: '4px 8px', background: 'var(--bg-primary)', border: '1px solid var(--border, #d2d2d7)', borderRadius: 4, color: 'var(--text-primary)', fontFamily: 'inherit' }}>
          <option value="">All</option>
          {STAGE_IDS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{ color: 'var(--text-secondary)', marginLeft: 12 }}>Status:</span>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '4px 8px', background: 'var(--bg-primary)', border: '1px solid var(--border, #d2d2d7)', borderRadius: 4, color: 'var(--text-primary)', fontFamily: 'inherit' }}>
          <option value="">All</option>
          {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{ color: 'var(--text-secondary)', marginLeft: 12 }}>{rows.length} rows</span>
      </div>

      <div style={{ border: '1px solid var(--border, #d2d2d7)', borderRadius: 6, overflow: 'auto', maxHeight: 500 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead style={{ background: 'var(--bg-secondary)', position: 'sticky', top: 0 }}>
            <tr style={{ color: 'var(--text-secondary)', textAlign: 'left' }}>
              <th style={{ padding: '6px 10px' }}>run_id</th>
              <th style={{ padding: '6px 10px' }}>stage</th>
              <th style={{ padding: '6px 10px' }}>trigger</th>
              <th style={{ padding: '6px 10px' }}>status</th>
              <th style={{ padding: '6px 10px', textAlign: 'right' }}>in</th>
              <th style={{ padding: '6px 10px', textAlign: 'right' }}>out</th>
              <th style={{ padding: '6px 10px', textAlign: 'right' }}>drop</th>
              <th style={{ padding: '6px 10px', textAlign: 'right' }}>err</th>
              <th style={{ padding: '6px 10px', textAlign: 'right' }}>ms</th>
              <th style={{ padding: '6px 10px' }}>started_at</th>
              <th style={{ padding: '6px 10px' }}>actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={11} style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>No runs match these filters.</td></tr>
            )}
            {rows.map(r => (
              <tr key={r.run_id} style={{ borderTop: '1px solid var(--border, #d2d2d7)', color: 'var(--text-primary)' }}>
                <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{r.run_id}</td>
                <td style={{ padding: '6px 10px' }}>{r.stage_id}</td>
                <td style={{ padding: '6px 10px' }}>{r.trigger}</td>
                <td style={{ padding: '6px 10px' }}>{statusBadge(r.status)}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right' }}>{r.in_count}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right' }}>{r.out_count}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right' }}>{r.dropped_count}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right', color: r.error_count > 0 ? '#c0392b' : undefined }}>{r.error_count}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right' }}>{r.duration_ms ?? '-'}</td>
                <td style={{ padding: '6px 10px' }}>{fmtDate(r.started_at)}</td>
                <td style={{ padding: '6px 10px' }}>
                  <button type="button" style={btnBase} onClick={() => setDetail(r)}>Detail</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setDetail(null)}
        >
          <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border, #d2d2d7)', borderRadius: 8, padding: 20, minWidth: 480, maxWidth: 720, maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>{detail.run_id}</h3>
            <pre style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 4, fontSize: 11, overflow: 'auto', color: 'var(--text-primary)', border: '1px solid var(--border, #d2d2d7)' }}>
              {JSON.stringify(detail, null, 2)}
            </pre>
            <button type="button" style={{ ...btnBase, marginTop: 12 }} onClick={() => setDetail(null)}>Close</button>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setConfirmOpen(false)}
        >
          <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border, #d2d2d7)', borderRadius: 8, padding: 20, minWidth: 360 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>确认清理</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              将删除所有 30 天前 status=success 的 pipeline_run 记录。此操作不可撤销。
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" style={btnBase} onClick={() => setConfirmOpen(false)}>取消</button>
              <button type="button" style={{ ...btnBase, background: '#c0392b', color: '#fff', border: '1px solid #c0392b' }} onClick={cleanupOld}>确认清理</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
