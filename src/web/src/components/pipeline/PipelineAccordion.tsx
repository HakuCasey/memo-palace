import { useEffect, useState, useCallback } from "react";
import { api, type PipelineStageSummary } from "../../api";

interface Props {
  refreshKey: number;
  onClearRuns: () => Promise<void>;
}

const STAGES: Array<{ id: string; name: string; color: string }> = [
  { id: "normalizer", name: "归一器 (Normalizer)", color: "#a0c4ff" },
  { id: "filter",   name: "过滤器 (Filter)",   color: "#ffb347" },
];

function stageLabel(s?: string, inCount?: number, outCount?: number): { label: string; color: string; count: string } {
  const empty = { label: "空闲", color: "#2f9e44", count: "" };
  if (!s || s === "skipped") return empty;
  const total = inCount ?? 0;
  const done = outCount ?? 0;
  if (s === "running") return { label: "进化中", color: "#ffb347", count: "" };
  if (s === "failed")  return { label: "失败", color: "#c0392b", count: `${done}/${total}` };
  if (done === total)  return { label: "已完成", color: "#2f9e44", count: `${done}/${total}` };
  return { label: "部分完成", color: "#ffb347", count: `${done}/${total}` };
}

interface DisplayItem {
  id: string;
  title: string;
  reason?: string;
  error?: string;
  status: "passed" | "dropped" | "error";
}

export function PipelineAccordion({ refreshKey, onClearRuns }: Props) {
  const [stages, setStages] = useState<PipelineStageSummary[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await api.listPipelineStages();
      setStages(s);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh, refreshKey]);
  useEffect(() => {
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)", marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Pipeline 处理流水线</span>
        <button
          type="button"
          onClick={async () => { if (window.confirm("确认清除所有进化记录？")) { setStages([]); await onClearRuns(); } }}
          style={{ background: "transparent", border: "1px solid var(--border, #d2d2d7)", borderRadius: 4, padding: "4px 10px", fontSize: 11, fontFamily: "inherit", color: "var(--text-secondary)", cursor: "pointer" }}
        >
          清除记录
        </button>
      </div>
      {STAGES.map(s => {
        const summary = stages.find(x => x.stage_id === s.id);
        const last = summary?.runs?.[0];
        const st = stageLabel(last?.status, last?.in_count, last?.out_count);
        const open = expanded === s.id;
        return (
          <div key={s.id} style={{ background: "var(--bg-secondary)", border: `1px solid ${s.color}`, borderRadius: 4, padding: "6px 10px" }}>
            <button
              type="button"
              onClick={() => setExpanded(open ? null : s.id)}
              style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, width: "100%", color: "var(--text-primary)", fontFamily: "inherit", padding: 0 }}
            >
              <span style={{ color: s.color }}>{open ? "▼" : "▶"}</span>
              <span style={{ fontWeight: 600, fontSize: 12, color: s.color }}>{s.name}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-secondary)" }}>{st.label}</span>
              {st.count && <span style={{ fontSize: 10, background: st.color, color: "#fff", padding: "1px 6px", borderRadius: 2, marginLeft: 4 }}>{st.count}</span>}
            </button>
            {open && (
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--border, #d2d2d7)", maxHeight: 240, overflowY: "auto" }}>
                {(!summary?.runs || summary.runs.length === 0) && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>暂无记录</div>}
                {summary?.runs.map(run => {
                  const rk = stageLabel(run.status, run.in_count, run.out_count);
                  return (
                    <div key={run.run_id} style={{ fontSize: 11, padding: "2px 0", display: "flex", gap: 4, alignItems: "flex-start", borderBottom: "1px solid var(--border, #d2d2d7)" }}>
                      <span style={{ fontWeight: 600, color: rk.color }}>{rk.label}</span>
                      <span style={{ color: "var(--text-secondary)" }}>in:{run.in_count} out:{run.out_count} dropped:{run.dropped_count ?? 0}</span>
                      <span style={{ color: "var(--text-secondary)" }}>{run.started_at?.slice(0, 16)}</span>
                      {run.error_message && <span style={{ color: "#c0392b" }}>错误: {run.error_message}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
