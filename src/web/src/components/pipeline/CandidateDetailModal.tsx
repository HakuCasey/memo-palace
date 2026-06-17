import { useState } from "react";
import { api, type CandidateDTO } from "../../api";

type EpisodicType = "debug_case" | "api_trap" | "config_trap" | "dev_note";

interface Props {
  candidate: CandidateDTO;
  onClose: () => void;
  onDeleted: (id: string) => void;
  onMemoryCreated: (id: string) => void;
}

function fullContent(c: CandidateDTO): string {
  const p = c.payload;
  if (p.source_channel === "huawei_forum") return [p.question, p.answer].filter(Boolean).join("\n\n");
  if (p.source_channel === "opencode_sessions" || p.source_channel === "dev_trouble_shot") return [p.problem, p.solution, p.evidence].filter(Boolean).join("\n\n");
  return p.content ?? "";
}

function sourceMap(ch?: string): string {
  if (ch === "huawei_forum") return "crawler";
  if (ch === "opencode_sessions" || ch === "dev_trouble_shot") return "opencode_hook";
  return "manual";
}

export function CandidateDetailModal({ candidate, onClose, onDeleted, onMemoryCreated }: Props) {
  const [mode, setMode] = useState<"view" | "add">("view");
  const [episodicType, setEpisodicType] = useState<EpisodicType | "">("");
  const [title, setTitle] = useState(candidate.payload.title ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const p = candidate.payload;
  const content = fullContent(candidate);

  const handleAddMemory = async () => {
    if (!episodicType) { setError("请选择 episodic_type"); return; }
    setBusy(true);
    setError(null);
    try {
      await api.createEpisodic({
        episodic_type: episodicType,
        title,
        source: sourceMap(p.source_channel),
        trigger: { error_signals: p.signals ?? [], error_message: "", scenario: content.slice(0, 200) },
        context: { timestamp: new Date().toISOString() },
        tags: { keywords: p.tags ?? [], severity: "minor", bug_type: [] },
        consolidation: { promoted_to_semantic: false, related_semantic_ids: [] },
      });
      try { await api.removeArtifacts("evolved", [candidate.id]); } catch { /* non-critical */ }
      onMemoryCreated(candidate.id);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("确认删除此条目？")) return;
    setBusy(true);
    try {
      await api.removeArtifacts("evolved", [candidate.id]);
      onDeleted(candidate.id);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={onClose}>
      <div
        style={{
          background: "var(--bg-primary)",
          border: "1px solid var(--border, #d2d2d7)",
          borderRadius: 6,
          width: 520,
          height: 560,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* header — 固定 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px 10px", borderBottom: "1px solid var(--border, #d2d2d7)", flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title || "(无标题)"}</span>
          <span style={{ fontSize: 10, background: "var(--border, #d2d2d7)", color: "var(--text-primary)", padding: "1px 6px", borderRadius: 2, marginLeft: 8, flexShrink: 0 }}>{p.source_channel}</span>
        </div>

        {/* body — 滚动 */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, color: "var(--text-primary)", background: "var(--bg-secondary)", padding: 10, borderRadius: 4, margin: 0 }}>
            {content}
          </pre>
          {Array.isArray(p.tags) && p.tags.length > 0 && <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 6 }}>tags: {p.tags.join(", ")}</div>}
          {Array.isArray(p.signals) && p.signals.length > 0 && <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 2 }}>signals: {p.signals.join(", ")}</div>}
          {p.source_url && <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 2 }}>url: {p.source_url}</div>}

          {mode === "add" && (
            <div style={{ marginTop: 14, padding: 10, background: "var(--bg-secondary)", borderRadius: 4 }}>
              <label style={{ display: "block", fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>episodic_type *</label>
              <select value={episodicType} onChange={e => setEpisodicType(e.target.value as EpisodicType)} style={{ width: "100%", padding: 5, fontSize: 12, marginTop: 2 }}>
                <option value="">-- 选择 --</option>
                <option value="debug_case">debug_case</option>
                <option value="api_trap">api_trap</option>
                <option value="config_trap">config_trap</option>
                <option value="dev_note">dev_note</option>
              </select>
              <label style={{ display: "block", fontSize: 11, color: "var(--text-secondary)", marginTop: 8, marginBottom: 4 }}>标题</label>
              <input value={title} onChange={e => setTitle(e.target.value)} style={{ width: "100%", padding: 5, fontSize: 12, marginTop: 2 }} />
            </div>
          )}

          {error && <div style={{ color: "#c0392b", fontSize: 12, marginTop: 8 }}>{error}</div>}
        </div>

        {/* footer — 固定 */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "10px 18px 14px", borderTop: "1px solid var(--border, #d2d2d7)", flexShrink: 0 }}>
          {mode === "view" ? (
            <>
              <button type="button" onClick={handleDelete} disabled={busy} style={{ background: "transparent", color: "#c0392b", border: "1px solid #c0392b", borderRadius: 4, padding: "6px 14px", fontSize: 12, cursor: "pointer" }}>删除</button>
              <button type="button" onClick={() => setMode("add")} style={{ background: "#2f9e44", color: "#fff", border: "none", borderRadius: 4, padding: "6px 14px", fontSize: 12, cursor: "pointer" }}>+记忆</button>
              <button type="button" onClick={onClose} style={{ background: "transparent", border: "1px solid var(--border, #d2d2d7)", borderRadius: 4, padding: "6px 14px", fontSize: 12, cursor: "pointer" }}>关闭</button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setMode("view")} disabled={busy} style={{ background: "transparent", border: "1px solid var(--border, #d2d2d7)", borderRadius: 4, padding: "6px 14px", fontSize: 12, cursor: "pointer" }}>返回</button>
              <button type="button" onClick={handleAddMemory} disabled={busy} style={{ background: "#2f9e44", color: "#fff", border: "none", borderRadius: 4, padding: "6px 14px", fontSize: 12, cursor: "pointer" }}>{busy ? "提交中…" : "确认添加"}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}