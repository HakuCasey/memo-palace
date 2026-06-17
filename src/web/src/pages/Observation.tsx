import { useEffect, useState } from 'react';
import { api, type ClientGroup, type HookEvent } from '../api';
import { formatDateTime } from '../utils/date';

const styles = {
  heading: { fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 8 },
  box: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 20,
  },
  row: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' },
  label: { color: 'var(--text-secondary)', fontSize: 14 },
  value: { color: 'var(--text-primary)', fontSize: 14, fontWeight: 600 },
  ok: { color: 'var(--accent)' },
  err: { color: 'var(--danger)' },
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
  accordionItem: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    marginBottom: 8,
    overflow: 'hidden',
  },
  accordionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    cursor: 'pointer',
    background: 'var(--bg-secondary)',
    userSelect: 'none' as const,
  },
  accordionTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' },
  accordionCount: { fontSize: 12, color: 'var(--text-secondary)' },
  accordionBody: {
    padding: '0 14px 12px',
    fontSize: 13,
    color: 'var(--text-secondary)',
  },
  clientRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    borderBottom: '1px solid var(--border)',
  },
  clientName: { color: 'var(--text-primary)', fontSize: 13 },
  clientTime: { color: 'var(--text-secondary)', fontSize: 12 },
  hotRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    borderBottom: '1px solid var(--border)',
  },
  hotQuery: { color: 'var(--text-primary)', fontSize: 13, maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  hotCount: { color: 'var(--text-secondary)', fontSize: 12 },
  logRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    borderBottom: '1px solid var(--border)',
  },
  logMeta: { color: 'var(--text-secondary)', fontSize: 12, marginBottom: 2 },
  logQuery: { color: 'var(--text-primary)', fontSize: 13, maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  note: { color: 'var(--text-secondary)', fontSize: 12, fontStyle: 'italic', marginTop: 16 },
};

export default function Observation() {
  const [clients, setClients] = useState<ClientGroup[]>([]);
  const [clientsSectionExpanded, setClientsSectionExpanded] = useState(true);
  const [expandedClientType, setExpandedClientType] = useState<string | null>(null);
  const [selfCheckResult, setSelfCheckResult] = useState<{ checks: Record<string, string>; checked_at: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [clientsRefreshing, setClientsRefreshing] = useState(false);
  const [hookEvents, setHookEvents] = useState<HookEvent[]>([]);
  const [hooksRefreshing, setHooksRefreshing] = useState(false);
  const [hookSectionExpanded, setHookSectionExpanded] = useState(true);
  const [hookExpanded, setHookExpanded] = useState<number | null>(null);

  const load = () => {
    api.getClients().then(setClients).catch(() => {});
    api.getHookEvents(50).then(r => setHookEvents(r.items)).catch(() => {});
  };

  const handleSelfCheck = () => {
    setChecking(true);
    api.runSelfCheck().then((r) => { setSelfCheckResult(r); setChecking(false); }).catch(() => setChecking(false));
  };

  useEffect(() => { load(); handleSelfCheck(); }, []);



  return (
    <>
      <h1 style={styles.heading}>Observation</h1>

      <div style={styles.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Server Status</span>
          <button style={styles.button} onClick={handleSelfCheck} disabled={checking}>
            {checking ? 'Checking...' : 'Run Self-Check'}
          </button>
        </div>
        <div style={styles.box}>
          <div style={styles.row}>
            <span style={styles.label}>Version</span>
            <span style={styles.value}>0.1.0</span>
          </div>
          {selfCheckResult && Object.entries(selfCheckResult.checks).map(([key, val]) => (
            <div key={key} style={styles.row}>
              <span style={styles.label}>{key}</span>
              <span style={val === 'OK' ? { ...styles.value, ...styles.ok } : { ...styles.value, ...styles.err }}>{val}</span>
            </div>
          ))}
          {selfCheckResult && (
            <div style={{ ...styles.row, borderBottom: 'none' }}>
              <span style={styles.label}>Checked At</span>
              <span style={styles.value}>{formatDateTime(selfCheckResult.checked_at)}</span>
            </div>
          )}
        </div>

        <div style={{ marginTop: 16 }}>
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: clientsSectionExpanded ? 10 : 0 }}
            onClick={() => setClientsSectionExpanded(!clientsSectionExpanded)}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              {clientsSectionExpanded ? '▼' : '▶'} Connected Clients
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                style={{ background: clientsRefreshing ? 'var(--bg-secondary)' : 'transparent', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 10px', color: clientsRefreshing ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: 12, fontFamily: 'inherit', cursor: clientsRefreshing ? 'wait' : 'pointer' }}
                disabled={clientsRefreshing}
                onClick={(e) => { e.stopPropagation(); setClientsRefreshing(true); api.getClients().then(setClients).catch(() => {}).finally(() => setClientsRefreshing(false)); }}
              >
                {clientsRefreshing ? 'Refreshing...' : 'Refresh'}
              </button>
              {clients.length > 0 && (
                <button
                  style={{ background: 'transparent', border: '1px solid var(--danger)', borderRadius: 4, padding: '4px 10px', color: 'var(--danger)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}
                  onClick={(e) => { e.stopPropagation(); if (window.confirm('Clear all client records and access logs?')) { api.clearClients().then(() => { setClients([]); }).catch(() => {}); } }}
                >
                  Clear All
                </button>
              )}
            </div>
          </div>
          {clientsSectionExpanded && clients.length === 0 && (
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No registered clients</div>
          )}
          {clientsSectionExpanded && clients.map((group) => (
            <div key={group.type} style={styles.accordionItem}>
              <div
                style={styles.accordionHeader}
                onClick={() => setExpandedClientType(expandedClientType === group.type ? null : group.type)}
              >
                <span style={styles.accordionTitle}>{group.type}</span>
                <span style={styles.accordionCount}>{group.clients.length} client{group.clients.length > 1 ? 's' : ''}</span>
              </div>
              {expandedClientType === group.type && (
                <div style={styles.accordionBody}>
                  {group.clients.map((c) => (
                    <div key={c.client_id} style={styles.clientRow}>
                      <div>
                        <div style={styles.clientName}>{c.display_name}</div>
                        <div style={styles.clientTime}>ID: {c.client_id}</div>
                      </div>
                      <div style={styles.clientTime}>Last seen: {formatDateTime(c.last_seen_at)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={styles.section}>
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 8, marginBottom: 12, cursor: 'pointer' }}
          onClick={() => setHookSectionExpanded(!hookSectionExpanded)}
        >
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
            {hookSectionExpanded ? '▼' : '▶'} Hook Monitor
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              style={{ background: hooksRefreshing ? 'var(--bg-secondary)' : 'transparent', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 10px', color: hooksRefreshing ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: 12, fontFamily: 'inherit', cursor: hooksRefreshing ? 'wait' : 'pointer' }}
              disabled={hooksRefreshing}
              onClick={(e) => { e.stopPropagation(); setHooksRefreshing(true); api.getHookEvents(50).then(r => setHookEvents(r.items)).catch(() => {}).finally(() => setHooksRefreshing(false)); }}
            >
              {hooksRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            {hookEvents.length > 0 && (
              <button
                style={{ background: 'transparent', border: '1px solid var(--danger)', borderRadius: 4, padding: '4px 10px', color: 'var(--danger)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); if (window.confirm('Clear all hook events?')) { api.clearClients().then(() => { setHookEvents([]); }).catch(() => {}); } }}
              >
                Clear All
              </button>
            )}
          </div>
        </div>
        {hookSectionExpanded && hookEvents.length === 0 && (
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No hook events recorded</div>
        )}
        {hookSectionExpanded && hookEvents.map(ev => (
          <div key={ev.id} style={styles.accordionItem}>
            <div
              style={styles.accordionHeader}
              onClick={() => setHookExpanded(hookExpanded === ev.id ? null : ev.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                <span style={{ padding: '1px 6px', borderRadius: 2, fontSize: 10, background: ev.action_type === 'hook_error' ? '#c0392b' : 'var(--border)', color: ev.action_type === 'hook_error' ? '#fff' : 'var(--text-primary)', flexShrink: 0 }}>
                  {ev.action_type === 'hook_error' ? 'Error' : 'Review'}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                  {ev.error_summary || ev.query || `session: ${(ev.session_id || '').slice(0, 12)}`}
                </span>
                {ev.tool_name && (
                  <span style={{ fontSize: 10, padding: '0 4px', borderRadius: 2, background: 'var(--border)', color: 'var(--text-secondary)', flexShrink: 0 }}>
                    {ev.tool_name}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: ev.injected ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  {ev.injected ? `Injected (${ev.result_count})` : ev.result_count > 0 ? `${ev.result_count} results` : 'No match'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{formatDateTime(ev.accessed_at).split(' ')[1] || formatDateTime(ev.accessed_at)}</span>
              </div>
            </div>
            {hookExpanded === ev.id && (
              <div style={styles.accordionBody}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Time</span>
                  <span style={{ color: 'var(--text-primary)' }}>{formatDateTime(ev.accessed_at)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Type</span>
                  <span style={{ color: 'var(--text-primary)' }}>{ev.action_type === 'hook_error' ? 'Error detected' : 'Session review'}</span>
                </div>
                {ev.tool_name && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Tool</span>
                    <span style={{ color: 'var(--text-primary)' }}>{ev.tool_name}</span>
                  </div>
                )}
                {ev.error_summary && (
                  <div style={{ padding: '4px 0' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Error summary</span>
                    <div style={{ color: 'var(--text-primary)', fontSize: 12, marginTop: 2, wordBreak: 'break-all' as const }}>{ev.error_summary}</div>
                  </div>
                )}
                {ev.query && (
                  <div style={{ padding: '4px 0' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Search query</span>
                    <div style={{ color: 'var(--accent)', fontSize: 12, marginTop: 2, userSelect: 'all', cursor: 'text' }}>{ev.query}</div>
                  </div>
                )}
                {ev.result_ids && ev.result_ids.length > 0 && (
                  <div style={{ padding: '4px 0' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Matched memories</span>
                    <div style={{ marginTop: 2 }}>
                      {ev.result_ids.map((rid, i) => (
                        <span key={rid} style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 3, fontSize: 10, background: 'var(--border)', color: 'var(--text-accent)', marginRight: 4, marginBottom: 2 }}>
                          {rid}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Results</span>
                  <span style={{ color: ev.result_count > 0 ? 'var(--accent)' : 'var(--text-primary)' }}>{ev.result_count} memories found</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Context injection</span>
                  <span style={{ color: ev.injected ? 'var(--accent)' : 'var(--text-secondary)' }}>{ev.injected ? 'Injected into next LLM call' : 'Not injected'}</span>
                </div>
                {ev.injected_context && (
                  <div style={{ padding: '4px 0' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Injected context</span>
                    <pre style={{ color: 'var(--text-primary)', fontSize: 11, marginTop: 4, padding: 8, background: 'var(--bg-primary)', borderRadius: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflow: 'auto', margin: 0 }}>{ev.injected_context}</pre>
                  </div>
                )}
                {ev.session_id && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Session</span>
                    <span style={{ color: 'var(--text-primary)', fontSize: 11 }}>{ev.session_id}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
