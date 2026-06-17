import { useState } from "react";
import { api, type CandidateDTO } from "../api";
import { SourcesPanel } from "../components/pipeline/SourcesPanel";
import { PipelineAccordion } from "../components/pipeline/PipelineAccordion";
import { HighValueZone } from "../components/pipeline/HighValueZone";
import { AddMemoryModal } from "../components/pipeline/AddMemoryModal";
import { ScheduleDrawer } from "../components/pipeline/ScheduleDrawer";

export default function Collection() {
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modalItems, setModalItems] = useState<CandidateDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const evolve = async (ids: string[]) => {
    setBusy(true);
    setError(null);
    try {
      await api.batchRun(ids);
      setRefreshKey(k => k + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async () => {
    try {
      await api.clearAll();
      setRefreshKey(k => k + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleMemorySubmitted = async (ids: string[]) => {
    try {
      await api.removeArtifacts("evolved", ids);
    } catch { /* non-critical */ }
    setRefreshKey(k => k + 1);
  };

  const handleRevert = async (ids: string[]) => {
    setBusy(true);
    setError(null);
    try {
      await api.revertSources(ids);
      setRefreshKey(k => k + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16, gap: 12, flexShrink: 0 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Collection</h1>
        <div style={{ marginLeft: "auto" }}>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            style={{ background: "transparent", border: "1px solid var(--border, #d2d2d7)", borderRadius: 4, padding: "6px 14px", fontSize: 13, fontFamily: "inherit", color: "var(--text-primary)", cursor: "pointer" }}
          >
            Schedules
          </button>
        </div>
      </div>

      {error && <div style={{ color: "#c0392b", fontSize: 12, marginBottom: 12 }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 42fr) minmax(360px, 58fr)", gap: 16, height: "calc(100vh - 140px)", overflow: "hidden" }}>
        <div style={{ borderRight: "1px solid var(--border, #d2d2d7)", paddingRight: 14, overflow: "hidden" }}>
          <SourcesPanel onEvolve={evolve} onRevert={handleRevert} busy={busy} refreshKey={refreshKey} />
        </div>
        <div style={{ paddingLeft: 4, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <PipelineAccordion refreshKey={refreshKey} onClearRuns={handleClear} />
          <HighValueZone
            refreshKey={refreshKey}
            onAddMany={(list) => setModalItems(list)}
            onDeleted={() => setRefreshKey(k => k + 1)}
          />
        </div>
      </div>

      <ScheduleDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {modalItems && (
        <AddMemoryModal
          candidates={modalItems}
          onClose={() => setModalItems(null)}
          onSubmitted={() => handleMemorySubmitted(modalItems.map(c => c.id))}
        />
      )}
    </>
  );
}
