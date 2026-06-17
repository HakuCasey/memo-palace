import { useEffect, useState, useCallback } from 'react';
import { api, type PipelineScheduleRow, type PipelineStageSummary } from '../../api';

interface ScheduleDrawerProps {
  open: boolean;
  onClose: () => void;
}

const CRON_HELP = '5 段表达式：分 时 日 月 周；示例 `0 */2 * * *` = 每 2 小时';

interface Row {
  stage_id: string;
  schedule_id?: string;
  cron: string;
  enabled: boolean;
  last_run_at?: string | null;
  saved: boolean;
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

export function ScheduleDrawer({ open, onClose }: ScheduleDrawerProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [schedules, stages] = await Promise.all([
        api.listSchedules(),
        api.listPipelineStages(),
      ]);
      const byStage = new Map<string, PipelineScheduleRow>();
      for (const s of schedules) byStage.set(s.stage_id, s);
      const next: Row[] = stages.map((st: PipelineStageSummary) => {
        const sch = byStage.get(st.stage_id);
        return {
          stage_id: st.stage_id,
          schedule_id: sch?.schedule_id,
          cron: sch?.cron ?? '',
          enabled: sch ? sch.enabled === 1 : false,
          last_run_at: sch?.last_run_at,
          saved: !!sch,
        };
      });
      setRows(next);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  if (!open) return null;

  const update = (stageId: string, patch: Partial<Row>) => {
    setRows(prev => prev.map(r => r.stage_id === stageId ? { ...r, ...patch } : r));
  };

  const save = async (row: Row) => {
    setError(null);
    if (!row.cron.trim()) {
      setError(`${row.stage_id}: cron expression is required`);
      return;
    }
    try {
      await api.upsertSchedule({ stage_id: row.stage_id, cron: row.cron, enabled: row.enabled });
      await refresh();
    } catch (e) {
      setError(`${row.stage_id}: ${(e as Error).message}`);
    }
  };

  const runNow = async (row: Row) => {
    try {
      await api.runStage(row.stage_id, {});
    } catch (e) {
      setError(`${row.stage_id}: ${(e as Error).message}`);
    }
  };

  const disable = async (row: Row) => {
    if (!row.cron) { setError(`${row.stage_id}: nothing to disable (no cron set yet)`); return; }
    try {
      await api.upsertSchedule({ stage_id: row.stage_id, cron: row.cron, enabled: false });
      await refresh();
    } catch (e) {
      setError(`${row.stage_id}: ${(e as Error).message}`);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}
      onClick={onClose}
    >
      <aside
        style={{
          width: 560,
          height: '100%',
          background: 'var(--bg-primary)',
          borderLeft: '1px solid var(--border, #d2d2d7)',
          padding: 20,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--text-primary)' }}>Schedules</h2>
          <button type="button" style={btnBase} onClick={onClose}>Close</button>
        </div>

        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
          每个 stage 最多 1 个 schedule。Cron 表达式实时校验，保存后立即生效。
        </p>

        {error && (
          <div style={{ padding: 8, background: '#c0392b26', border: '1px solid #c0392b', borderRadius: 4, fontSize: 12, color: 'var(--text-primary)' }}>
            {error}
          </div>
        )}

        {busy && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Loading…</div>}

        {rows.map(row => (
          <div
            key={row.stage_id}
            style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, border: '1px solid var(--border, #d2d2d7)', borderRadius: 6, background: 'var(--bg-secondary)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={row.enabled}
                onChange={e => update(row.stage_id, { enabled: e.target.checked })}
              />
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.stage_id}</span>
              {row.last_run_at && (
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                  last run: {row.last_run_at.replace('T', ' ').slice(0, 19)}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="text"
                value={row.cron}
                placeholder="0 */2 * * *"
                onChange={e => update(row.stage_id, { cron: e.target.value })}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border, #d2d2d7)',
                  borderRadius: 4,
                  color: 'var(--text-primary)',
                  fontFamily: 'monospace',
                  fontSize: 12,
                }}
              />
              <span
                title={CRON_HELP}
                style={{
                  width: 22, height: 22, lineHeight: '22px', textAlign: 'center',
                  borderRadius: '50%', background: 'var(--bg-primary)',
                  border: '1px solid var(--border, #d2d2d7)',
                  color: 'var(--text-secondary)', cursor: 'help', fontSize: 12,
                }}
              >
                ?
              </span>
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" style={btnBase} onClick={() => save(row)}>Save</button>
              <button type="button" style={btnBase} onClick={() => runNow(row)}>Run now</button>
              <button type="button" style={btnBase} onClick={() => disable(row)} disabled={!row.saved || !row.enabled}>
                Disable
              </button>
            </div>
          </div>
        ))}
      </aside>
    </div>
  );
}
