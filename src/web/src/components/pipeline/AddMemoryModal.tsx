import { useState } from "react";
import { api, type CandidateDTO } from "../../api";

interface Props {
  candidates: CandidateDTO[];
  onClose: () => void;
  onSubmitted: () => void;
}

type EpisodicType = "debug_case" | "api_trap" | "config_trap" | "dev_note";

interface FormState {
  episodic_type: EpisodicType | "";
  title: string;
}

function defaultMessage(c: CandidateDTO): string {
  const p = c.payload;
  if (p.source_channel === "huawei_forum") return [p.question, p.answer].filter(Boolean).join("\n\n");
  if (p.source_channel === "opencode_sessions" || p.source_channel === "dev_trouble_shot") return [p.problem, p.solution].filter(Boolean).join("\n\n");
  return p.content ?? "";
}

export function AddMemoryModal({ candidates, onClose, onSubmitted }: Props) {
  const [forms, setForms] = useState<Record<string, FormState>>(() => {
    const m: Record<string, FormState> = {};
    for (const c of candidates) m[c.id] = { episodic_type: "", title: c.payload.title ?? "" };
    return m;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (id: string, patch: Partial<FormState>) =>
    setForms({ ...forms, [id]: { ...forms[id], ...patch } });

  const submit = async () => {
    for (const c of candidates) {
      if (!forms[c.id].episodic_type) { setError(`请为 ${c.id} 选择 episodic_type`); return; }
    }
    setBusy(true);
    setError(null);
    try {
      for (const c of candidates) {
        const f = forms[c.id];
        await api.createEpisodic({
          episodic_type: f.episodic_type,
          title: f.title,
          source: c.payload.source_channel === "huawei_forum" ? "crawler" : c.payload.source_channel === "opencode_sessions" ? "opencode_hook" : c.payload.source_channel === "dev_trouble_shot" ? "opencode_hook" : "manual",
          trigger: { error_signals: c.payload.signals ?? [], error_message: "", scenario: defaultMessage(c).slice(0, 200) },
          context: { timestamp: new Date().toISOString() },
          tags: { keywords: c.payload.tags, severity: "minor", bug_type: [] },
          consolidation: { promoted_to_semantic: false, related_semantic_ids: [] },
        });
      }
      onSubmitted();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "var(--bg-primary)", border: "1px solid var(--border, #d2d2d7)", borderRadius: 6, padding: 18, width: 480, maxHeight: "80vh", overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)", marginBottom: 12 }}>加入情景记忆 ({candidates.length} 条)</div>

        {candidates.map(c => (
          <div key={c.id} style={{ marginBottom: 14, padding: 10, background: "var(--bg-secondary)", borderRadius: 4 }}>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>{c.id} · {c.payload.source_channel}</div>
            <label style={{ display: "block", fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>episodic_type *</label>
            <select value={forms[c.id].episodic_type} onChange={e => update(c.id, { episodic_type: e.target.value as EpisodicType })} style={{ width: "100%", padding: 5, fontSize: 12, marginTop: 2 }}>
              <option value="">-- 选择 --</option>
              <option value="debug_case">debug_case</option>
              <option value="api_trap">api_trap</option>
              <option value="config_trap">config_trap</option>
              <option value="dev_note">dev_note</option>
            </select>
            <label style={{ display: "block", fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>标题</label>
            <input value={forms[c.id].title} onChange={e => update(c.id, { title: e.target.value })} style={{ width: "100%", padding: 5, fontSize: 12, marginTop: 2 }} />
          </div>
        ))}

        {error && <div style={{ color: "#c0392b", fontSize: 12, marginBottom: 8 }}>{error}</div>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} disabled={busy} style={{ background: "transparent", border: "1px solid var(--border, #d2d2d7)", borderRadius: 4, padding: "6px 14px", fontSize: 12, cursor: "pointer" }}>取消</button>
          <button type="button" onClick={submit} disabled={busy} style={{ background: "#2f9e44", color: "#fff", border: "none", borderRadius: 4, padding: "6px 14px", fontSize: 12, cursor: "pointer" }}>{busy ? "提交中…" : "确认添加"}</button>
        </div>
      </div>
    </div>
  );
}
