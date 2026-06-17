import { useEffect, useState } from "react";
import { api, type SourceChannelDTO, type SourceFileDTO } from "../../api";

interface Props {
  onEvolve: (sourceFileIds: string[]) => void | Promise<void>;
  onRevert?: (sourceFileIds: string[]) => void | Promise<void>;
  busy?: boolean;
  refreshKey?: number;
}

const btnStyle = (color: string) => ({
  background: color,
  color: "#fff",
  border: "none",
  borderRadius: 4,
  padding: "6px 12px",
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

const sectionTitle: React.CSSProperties = {
  fontWeight: 600, fontSize: 12, color: "var(--text-primary)", marginBottom: 4,
};

function channelFiles(channels: SourceChannelDTO[], evolved: boolean): SourceFileDTO[] {
  return channels.flatMap(ch =>
    ch.files.filter(f => !!f.evolved === evolved)
  );
}

export function SourcesPanel({ onEvolve, onRevert, busy, refreshKey }: Props) {
  const [channels, setChannels] = useState<SourceChannelDTO[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [evolvedSelected, setEvolvedSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.listSources().then(setChannels).catch(() => setChannels([]));
  }, [refreshKey]);

  const toggle = (id: string) => {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  };

  const toggleChannel = (channel: string, files: SourceFileDTO[]) => {
    const ids = files.map(f => f.id);
    const allSelected = ids.every(id => selected.has(id));
    const n = new Set(selected);
    if (allSelected) ids.forEach(id => n.delete(id));
    else ids.forEach(id => n.add(id));
    setSelected(n);
  };

  const evolve = () => {
    if (selected.size === 0) return;
    onEvolve(Array.from(selected));
    setSelected(new Set());
  };

  const revert = () => {
    if (evolvedSelected.size === 0 || !onRevert) return;
    onRevert(Array.from(evolvedSelected));
    setEvolvedSelected(new Set());
  };

  const pendingFiles = channelFiles(channels, false);
  const evolvedFiles = channelFiles(channels, true);

  const renderFiles = (files: SourceFileDTO[]) =>
    channels.map(ch => {
      const chFiles = files.filter(f => ch.files.includes(f));
      if (chFiles.length === 0) return null;
      const ids = chFiles.map(f => f.id);
      const checked = ids.length > 0 && ids.every(id => selected.has(id));
      return (
        <div key={ch.channel} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 11, color: "var(--text-primary)" }}>
            <input type="checkbox" checked={checked} onChange={() => toggleChannel(ch.channel, chFiles)} />
            <span>{ch.channel}</span>
            <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}>{chFiles.length} files</span>
          </label>
          <div style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 1 }}>
            {chFiles.map(f => (
              <label key={f.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-secondary)" }}>
                <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)} />
                <span>{f.name}</span>
                <span style={{ color: "var(--text-secondary)" }}>{f.count}条</span>
              </label>
            ))}
          </div>
        </div>
      );
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>Sources</div>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>

        {/* 待进化 */}
        <div>
          <div style={sectionTitle}>待进化</div>
          {pendingFiles.length === 0 && <div style={{ color: "var(--text-secondary)", fontSize: 11 }}>无</div>}
          {renderFiles(pendingFiles)}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={evolve}
            style={selected.size === 0 ? btnDisabled("var(--accent, #2f9e44)") : btnStyle("var(--accent, #2f9e44)")}
          >
            {busy ? "进化中…" : `进化 (${selected.size})`}
          </button>
        </div>

        {/* 已进化 */}
        <div style={{ borderTop: "1px solid var(--border, #d2d2d7)", paddingTop: 8 }}>
          <div style={{ ...sectionTitle, color: "var(--text-secondary)" }}>已进化</div>
          {evolvedFiles.length === 0 && <div style={{ color: "var(--text-secondary)", fontSize: 11 }}>无</div>}
          {channels.map(ch => {
            const chFiles = evolvedFiles.filter(f => ch.files.includes(f));
            if (chFiles.length === 0) return null;
            const ids = chFiles.map(f => f.id);
            const checked = ids.length > 0 && ids.every(id => evolvedSelected.has(id));
            return (
              <div key={ch.channel} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 11, color: "var(--text-primary)" }}>
                  <input type="checkbox" checked={checked} onChange={() => {
                    const n = new Set(evolvedSelected);
                    if (checked) ids.forEach(id => n.delete(id));
                    else ids.forEach(id => n.add(id));
                    setEvolvedSelected(n);
                  }} />
                  <span>{ch.channel}</span>
                  <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}>{chFiles.length} files</span>
                </label>
                <div style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 1 }}>
                  {chFiles.map(f => (
                    <label key={f.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-secondary)" }}>
                      <input type="checkbox" checked={evolvedSelected.has(f.id)} onChange={() => {
                        const n = new Set(evolvedSelected);
                        n.has(f.id) ? n.delete(f.id) : n.add(f.id);
                        setEvolvedSelected(n);
                      }} />
                      <span>{f.name.replace(/\.[^.]+$/, "")}_evolved.jsonl</span>
                      <span style={{ color: "var(--text-secondary)" }}>{f.evolvedCount ?? f.count}条</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
          {evolvedFiles.length > 0 && onRevert && (
            <div style={{ marginTop: 6 }}>
              <button
                type="button"
                disabled={busy || evolvedSelected.size === 0}
                onClick={revert}
                style={evolvedSelected.size === 0 ? btnDisabled("var(--danger, #e03131)") : btnStyle("var(--danger, #e03131)")}
              >
                {busy ? "回退中…" : `回退 (${evolvedSelected.size})`}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
