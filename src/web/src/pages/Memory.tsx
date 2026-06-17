import { useState, useEffect, useRef } from 'react';
import { api, type EpisodicMemory, type SemanticMemory, type ProceduralMemory, type MemoryStatsResponse, type MemoryHotItem } from '../api';
import OverviewPanel from '../components/memory/OverviewPanel';
import VirtualList from '../components/memory/VirtualList';
import EpisodicListItem from '../components/memory/EpisodicListItem';
import EpisodicToolbar from '../components/memory/EpisodicToolbar';

type Tab = 'overview' | 'episodic' | 'semantic' | 'procedural';

const styles = {
  heading: { fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20 },
  tabs: { display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--border)' },
  tab: (active: boolean) => ({
    padding: '8px 20px',
    fontSize: 14,
    fontFamily: 'inherit',
    cursor: 'pointer',
    border: 'none',
    background: 'none',
    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
    borderBottom: active ? '2px solid var(--text-accent)' : '2px solid transparent',
  }),
  toolbar: { display: 'flex', gap: 8, marginBottom: 16 },
  input: {
    flex: 1,
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '8px 12px',
    color: 'var(--text-primary)',
    fontSize: 14,
    fontFamily: 'inherit',
    outline: 'none',
  },
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
  card: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    cursor: 'pointer',
  },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardId: { color: 'var(--text-accent)', fontSize: 12 },
  cardTitle: { color: 'var(--text-primary)', fontSize: 15, fontWeight: 600 },
  badge: (color: string, bg: string) => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 12,
    fontSize: 11,
    color,
    background: bg,
  }),
  expanded: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: '1px solid var(--border)',
    fontSize: 12,
    color: 'var(--text-secondary)',
    whiteSpace: 'pre-wrap' as const,
    maxHeight: 300,
    overflow: 'auto',
  },
  empty: { color: 'var(--text-secondary)', fontSize: 13, padding: 20 },
  form: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  formTitle: { color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, marginBottom: 12 },
  formRow: { marginBottom: 8 },
  formLabel: { color: 'var(--text-secondary)', fontSize: 12, marginBottom: 4, display: 'block' },
  textInput: {
    width: '100%',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '8px 12px',
    color: 'var(--text-primary)',
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
  },
  textArea: {
    width: '100%',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '8px 12px',
    color: 'var(--text-primary)',
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
    minHeight: 60,
    resize: 'vertical' as const,
  },
  error: { color: 'var(--danger)', fontSize: 13 },
};

export default function Memory() {
  const [tab, setTab] = useState<Tab>('overview');
  const [search, setSearch] = useState('');
  const [episodicList, setEpisodicList] = useState<EpisodicMemory[]>([]);
  const [semanticList, setSemanticList] = useState<SemanticMemory[]>([]);
  const [proceduralList, setProceduralList] = useState<ProceduralMemory[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [err, setErr] = useState('');
  const [episodicTitles, setEpisodicTitles] = useState<Array<{ id: string; title: string }>>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [listLoading, setListLoading] = useState(false);

  // Overview data cached at page level to avoid re-fetching when switching tabs
  const [overviewStats, setOverviewStats] = useState<MemoryStatsResponse | null>(null);
  const [overviewHot, setOverviewHot] = useState<MemoryHotItem[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const overviewLoadedRef = useRef(false);

  useEffect(() => {
    // Only load overview data once when Memory page mounts
    if (overviewLoadedRef.current) return;
    overviewLoadedRef.current = true;

    async function loadOverview() {
      try {
        setOverviewLoading(true);
        const [statsRes, hotRes] = await Promise.all([
          api.getMemoryStats(),
          api.getMemoryHot(),
        ]);
        setOverviewStats(statsRes);
        setOverviewHot(hotRes.items);
      } catch (e: any) {
        console.error('Failed to load overview:', e);
      } finally {
        setOverviewLoading(false);
      }
    }
    loadOverview();
  }, []);

  const clearResults = () => {
    setHasSearched(false);
    setEpisodicList([]);
    setSemanticList([]);
    setProceduralList([]);
    setErr('');
  };

  const loadEpisodicTitles = async () => {
    setListLoading(true);
    try {
      const res = await api.listEpisodicTitles();
      setEpisodicTitles(res.items);
    } catch {
      setEpisodicTitles([]);
    } finally {
      setListLoading(false);
    }
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    setSearch('');
    setHasSearched(false);
    setErr('');
    setExpanded(null);
    if (t === 'episodic' && episodicTitles.length === 0) {
      loadEpisodicTitles();
    }
  };

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => {
    setSelectedIds(new Set(episodicTitles.map(t => t.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const deleteSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await api.batchDeleteEpisodic(ids);
      setSelectedIds(new Set());
      await loadEpisodicTitles();
    } catch (e: any) {
      setErr(e.message || 'Delete failed');
    }
  };

  const handleSearch = async () => {
    if (!search.trim()) return;
    try {
      setErr('');
      setLoading(true);
      const result = await api.search(search, { layer: tab });
      if (tab === 'episodic') setEpisodicList(result.episodic);
      else if (tab === 'semantic') setSemanticList(result.semantic);
      else setProceduralList(result.procedural);
      setHasSearched(true);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (!val.trim()) clearResults();
  };

  const currentList = tab === 'episodic' ? episodicList : tab === 'semantic' ? semanticList : proceduralList;

  const statusBadge = (s: string): React.CSSProperties => {
    if (s === 'open') return { display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, color: 'var(--danger)', background: '#f8514933' };
    if (s === 'resolved') return { display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, color: '#3fb950', background: '#23863633' };
    return { display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, color: 'var(--text-secondary)', background: '#8b949e33' };
  };

  const renderSemantic = () =>
    semanticList.length === 0 ? <div style={styles.empty}>No semantic memories</div> :
    semanticList.map((m) => (
      <div key={m.id} style={styles.card} onClick={() => setExpanded(expanded === m.id ? null : m.id)}>
        <div style={styles.cardHeader}>
          <span style={styles.cardId}>{m.id}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={styles.badge('#d2a8ff', '#8957e533')}>{m.semantic_type}</span>
            <span style={styles.badge('#d2a8ff', '#8957e533')}>{m.category}</span>
          </div>
        </div>
        <div style={styles.cardTitle}>{m.title}</div>
        {expanded === m.id && (
          <div style={styles.expanded}>{JSON.stringify(m, null, 2)}</div>
        )}
      </div>
    ));

  const renderProcedural = () =>
    proceduralList.length === 0 ? <div style={styles.empty}>No procedural memories</div> :
    proceduralList.map((m) => (
      <div key={m.id} style={styles.card} onClick={() => setExpanded(expanded === m.id ? null : m.id)}>
        <div style={styles.cardHeader}>
          <span style={styles.cardId}>{m.id}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={styles.badge('#79c0ff', '#1f6feb33')}>{m.id.startsWith('pm_skill_') ? 'skill' : 'workflow'}</span>
            <span style={styles.badge(m.enabled ? '#3fb950' : '#8b949e', m.enabled ? '#23863633' : '#8b949e33')}>
              {m.enabled ? 'enabled' : 'disabled'}
            </span>
          </div>
        </div>
        <div style={styles.cardTitle}>{m.name}</div>
        {expanded === m.id && (
          <div style={styles.expanded}>{JSON.stringify(m, null, 2)}</div>
        )}
      </div>
    ));

  return (
    <>
      <h1 style={styles.heading}>Memory</h1>

      <div style={styles.tabs}>
        {(['overview', 'episodic', 'semantic', 'procedural'] as Tab[]).map((t) => (
          <button key={t} style={styles.tab(tab === t)} onClick={() => switchTab(t)}>
            {t === 'overview' ? 'Overview' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab !== 'overview' && (
        <div style={styles.toolbar}>
          <input
            style={styles.input}
            placeholder={`Search ${tab} memories...`}
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button style={styles.button} onClick={handleSearch} disabled={loading}>{loading ? '搜索中…' : 'Search'}</button>
          {tab !== 'episodic' && (
            <button style={styles.buttonSecondary} onClick={() => setShowForm(!showForm)}>
              + Create
            </button>
          )}
        </div>
      )}

      {err && <div style={styles.error}>{err}</div>}

      {showForm && tab === 'semantic' && <SemanticForm onClose={() => setShowForm(false)} />}
      {showForm && tab === 'procedural' && <ProceduralForm onClose={() => setShowForm(false)} />}

      {tab === 'overview' ? (
        overviewLoading ? (
          <div style={{ color: 'var(--text-secondary)', padding: 20 }}>加载中...</div>
        ) : (
          <OverviewPanel
            stats={overviewStats}
            hot={overviewHot}
            onTabChange={(t) => switchTab(t)}
          />
        )
      ) : tab === 'episodic' ? (
        <>
          {err && <div style={styles.error}>{err}</div>}
          {hasSearched ? (
            <>
              {episodicList.length === 0 ? (
                <div style={styles.empty}>No results</div>
              ) : (
                <>
                  <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                    检索到 {episodicList.length} 条记忆
                  </div>
                  {episodicList.map((m) => (
                    <div key={m.id} style={styles.card} onClick={() => setExpanded(expanded === m.id ? null : m.id)}>
                      <div style={styles.cardHeader}>
                        <span style={styles.cardId}>{m.id}</span>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <span style={styles.badge('#79c0ff', '#1f6feb33')}>{m.episodic_type}</span>
                          <span style={statusBadge(m.status)}>{m.status}</span>
                        </div>
                      </div>
                      <div style={styles.cardTitle}>{m.title}</div>
                      {expanded === m.id && (
                        <div style={styles.expanded}>{JSON.stringify(m, null, 2)}</div>
                      )}
                    </div>
                  ))}
                </>
              )}
              <button style={{ ...styles.buttonSecondary, marginTop: 12 }} onClick={clearResults}>
                ← 返回列表
              </button>
            </>
          ) : (
            <>
              {listLoading ? (
                <div style={styles.empty}>加载中...</div>
              ) : episodicTitles.length === 0 ? (
                <div style={styles.empty}>No episodic memories</div>
              ) : (
                <>
                  <EpisodicToolbar
                    totalCount={episodicTitles.length}
                    selectedCount={selectedIds.size}
                    onSelectAll={selectAll}
                    onDeselectAll={deselectAll}
                    onDelete={deleteSelected}
                  />
                  <VirtualList
                    items={episodicTitles}
                    itemHeight={40}
                    renderItem={(item) => (
                      <EpisodicListItem
                        id={item.id}
                        title={item.title}
                        checked={selectedIds.has(item.id)}
                        onToggle={() => toggleSelection(item.id)}
                      />
                    )}
                  />
                </>
              )}
            </>
          )}
        </>
      ) : !hasSearched ? (
        <div style={styles.empty}>输入关键词后点击 Search 检索 {tab} 记忆</div>
      ) : currentList.length === 0 ? (
        <div style={styles.empty}>检索到 0 条记忆，请更换检索词或补充记忆</div>
      ) : (
        <>
          {tab === 'semantic' && renderSemantic()}
          {tab === 'procedural' && renderProcedural()}
          <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 12, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            已检索到 {currentList.length} 条记忆
          </div>
        </>
      )}
    </>
  );
}

function SemanticForm({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [knowledge, setKnowledge] = useState('');
  const [category, setCategory] = useState('');
  const [semanticType, setSemanticType] = useState<string>('pattern');
  const [err, setErr] = useState('');

  const submit = async () => {
    try {
      await api.createSemantic({
        title,
        knowledge,
        category,
        semantic_type: semanticType,
        source_type: 'manual',
        source_episodic_ids: [],
        conditions: { applicable_context: [] },
      });
      onClose();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <div style={styles.form}>
      <div style={styles.formTitle}>Create Semantic Memory</div>
      {err && <div style={styles.error}>{err}</div>}
      <div style={styles.formRow}>
        <label style={styles.formLabel}>Room</label>
        <select style={styles.textInput} value={semanticType} onChange={(e) => setSemanticType(e.target.value)}>
          <option value="pattern">Pattern</option>
          <option value="best_practice">Best Practice</option>
          <option value="dev_specification">Dev Specification</option>
        </select>
      </div>
      <div style={styles.formRow}>
        <label style={styles.formLabel}>Title</label>
        <input style={styles.textInput} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div style={styles.formRow}>
        <label style={styles.formLabel}>Knowledge</label>
        <textarea style={styles.textArea} value={knowledge} onChange={(e) => setKnowledge(e.target.value)} />
      </div>
      <div style={styles.formRow}>
        <label style={styles.formLabel}>Category</label>
        <input style={styles.textInput} value={category} onChange={(e) => setCategory(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button style={styles.button} onClick={submit}>Create</button>
        <button style={styles.buttonSecondary} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

function ProceduralForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pattern, setPattern] = useState('');
  const [procType, setProcType] = useState<string>('skill');
  const [err, setErr] = useState('');

  const submit = async () => {
    try {
      await api.createProcedural({
        procedural_type: procType,
        name,
        description,
        trigger: { type: 'keyword', pattern },
        actions: [{ type: 'suggest', target: pattern }],
        source_semantic_ids: [],
        enabled: true,
        priority: 0,
      });
      onClose();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <div style={styles.form}>
      <div style={styles.formTitle}>Create Procedural Memory</div>
      {err && <div style={styles.error}>{err}</div>}
      <div style={styles.formRow}>
        <label style={styles.formLabel}>Room</label>
        <select style={styles.textInput} value={procType} onChange={(e) => setProcType(e.target.value)}>
          <option value="skill">Skill</option>
          <option value="workflow">Workflow</option>
        </select>
      </div>
      <div style={styles.formRow}>
        <label style={styles.formLabel}>Name</label>
        <input style={styles.textInput} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div style={styles.formRow}>
        <label style={styles.formLabel}>Description</label>
        <textarea style={styles.textArea} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div style={styles.formRow}>
        <label style={styles.formLabel}>Trigger Pattern</label>
        <input style={styles.textInput} value={pattern} onChange={(e) => setPattern(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button style={styles.button} onClick={submit}>Create</button>
        <button style={styles.buttonSecondary} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
