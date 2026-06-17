import { useEffect, useState, useCallback, useRef } from "react";
import { api, type CandidateDTO } from "../../api";
import { CandidateDetailModal } from "./CandidateDetailModal";

interface Props {
  refreshKey: number;
  onAddMany: (items: CandidateDTO[]) => void;
  onDeleted: () => void;
}

const btnStyle = (color: string) => ({
  background: color,
  color: "#fff",
  border: "none",
  borderRadius: 4,
  padding: "6px 14px",
  fontSize: 12,
  fontFamily: "inherit" as const,
  cursor: "pointer",
  opacity: 1,
});

const btnDisabled = (color: string) => ({
  ...btnStyle(color),
  cursor: "not-allowed" as const,
  opacity: 0.5,
});

export function HighValueZone({ refreshKey, onAddMany, onDeleted }: Props) {
  const [items, setItems] = useState<CandidateDTO[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [detailItem, setDetailItem] = useState<CandidateDTO | null>(null);
  const [progressText, setProgressText] = useState<string | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout>>();

  const showProgress = (text: string, autoFade = false) => {
    setProgressText(text);
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    if (autoFade) {
      fadeTimer.current = setTimeout(() => setProgressText(null), 2000);
    }
  };

  const refresh = useCallback(() => {
    api.listArtifacts("evolved", 200).then(r => setItems(r.items)).catch(() => setItems([]));
  }, []);

  useEffect(() => { refresh(); }, [refresh, refreshKey]);

  const toggle = (id: string) => {
    const n = new Set(checked);
    n.has(id) ? n.delete(id) : n.add(id);
    setChecked(n);
  };

  const addSelected = async () => {
    const list = items.filter(i => checked.has(i.id));
    if (list.length === 0) return;

    setBusy(true);

    // Step 1: deduplicate among selected items (exact title match)
    const seen = new Set<string>();
    const unique: CandidateDTO[] = [];
    let selfDupCount = 0;
    for (const c of list) {
      const title = c.payload.title ?? c.id;
      if (seen.has(title)) {
        selfDupCount++;
      } else {
        seen.add(title);
        unique.push(c);
      }
    }

    // Step 2: check duplicates against existing episodic memories
    const nonDup: CandidateDTO[] = [];
    let dbDupCount = 0;
    for (let i = 0; i < unique.length; i++) {
      showProgress(`检查重复 ${i + 1}/${unique.length}...`);
      const title = unique[i].payload.title ?? unique[i].id;
      try {
        const res = await api.checkDupEpisodic(title);
        if (res.duplicate) {
          dbDupCount++;
        } else {
          nonDup.push(unique[i]);
        }
      } catch {
        nonDup.push(unique[i]);
      }
    }

    const totalSkipped = selfDupCount + dbDupCount;

    if (nonDup.length === 0) {
      showProgress(`全部重复，跳过 ${totalSkipped} 条`, true);
      setChecked(new Set());
      setBusy(false);
      return;
    }

    showProgress(`添加中 0/${nonDup.length}...`);
    onAddMany(nonDup);
    setChecked(new Set());

    const skippedMsg = totalSkipped > 0 ? `，跳过 ${totalSkipped} 条重复` : '';
    showProgress(`添加完成${skippedMsg}`, true);
    setBusy(false);
  };

  const deleteSelected = async () => {
    const ids = Array.from(checked).filter(id => items.some(i => i.id === id));
    if (ids.length === 0) return;
    if (!window.confirm(`确认删除这 ${ids.length} 条高价值条目？`)) return;
    setBusy(true);
    try {
      const result = await api.removeArtifacts("evolved", ids);
      console.log('[deleteSelected] success:', result);
      setChecked(new Set());
      onDeleted();
    } catch (e: any) {
      console.error('[deleteSelected] error:', e);
      alert(`删除失败: ${e.message || e}`);
    } finally { setBusy(false); }
  };

  const handleDetailDeleted = (_id: string) => {
    onDeleted();
  };

  const handleDetailMemoryCreated = (_id: string) => {
    onDeleted();
  };

  const allSelected = checked.size === items.length && items.length > 0;

  return (
    <div style={{ borderTop: "2px solid #2f9e44", paddingTop: 10, marginTop: 14, display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#2f9e44", fontWeight: 700, fontSize: 13 }}>★ High Value 高价值条目</span>
        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>共 {items.length} 条</span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {items.length === 0 && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>暂无</div>}
        {items.map(it => (
          <div key={it.id} style={{ background: "var(--bg-secondary)", border: "1px solid #2f9e44", borderRadius: 4, padding: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, cursor: "pointer" }}>
                <input type="checkbox" checked={checked.has(it.id)} onChange={() => toggle(it.id)} />
                <span style={{ fontSize: 12, color: "var(--accent, #2f9e44)", cursor: "pointer", textDecoration: "underline" }} onClick={() => setDetailItem(it)}>{it.payload.title || it.id}</span>
              </label>
              <span style={{ fontSize: 10, background: "var(--border, #d2d2d7)", color: "var(--text-primary)", padding: "1px 6px", borderRadius: 2 }}>{it.payload.source_channel}</span>
            </div>
            <div style={{ paddingLeft: 22, fontSize: 10, color: "var(--text-secondary)", marginTop: 2 }}>
              {Array.isArray(it.payload.tags) && it.payload.tags.length > 0 && <span>tags: {it.payload.tags.join(", ")}</span>}
              {Array.isArray(it.payload.signals) && it.payload.signals.length > 0 && <span style={{ marginLeft: 8 }}>signals: {it.payload.signals.join(", ")}</span>}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
        <button
          type="button"
          disabled={items.length === 0}
          onClick={() => setChecked(prev => {
            if (prev.size === items.length && items.length > 0) return new Set();
            return new Set(items.map(i => i.id));
          })}
          style={items.length === 0 ? btnDisabled("#555") : btnStyle("#555")}
        >
          {allSelected ? "取消全选" : `全选 (${items.length})`}
        </button>
        <button
          type="button"
          disabled={busy || checked.size === 0}
          onClick={addSelected}
          style={checked.size === 0 ? btnDisabled("#2f9e44") : btnStyle("#2f9e44")}
        >
          {busy ? "检查中…" : `加入情景记忆 (${checked.size})`}
        </button>
        <button
          type="button"
          disabled={busy || checked.size === 0}
          onClick={deleteSelected}
          style={checked.size === 0 ? btnDisabled("#c0392b") : btnStyle("#c0392b")}
        >
          {busy ? "删除中…" : `删除 (${checked.size})`}
        </button>
        {progressText && (
          <span style={{ fontSize: 11, color: "var(--text-secondary)", marginLeft: "auto" }}>{progressText}</span>
        )}
      </div>

      {detailItem && (
        <CandidateDetailModal
          candidate={detailItem}
          onClose={() => setDetailItem(null)}
          onDeleted={handleDetailDeleted}
          onMemoryCreated={handleDetailMemoryCreated}
        />
      )}
    </div>
  );
}
