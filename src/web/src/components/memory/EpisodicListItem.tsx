import { useState } from 'react';
import { api, type EpisodicMemory } from '../../api';

interface Props {
  id: string;
  title: string;
  checked: boolean;
  onToggle: () => void;
}

export default function EpisodicListItem({ id, title, checked, onToggle }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<EpisodicMemory | null>(null);
  const [loading, setLoading] = useState(false);

  const handleExpand = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (!detail) {
      setLoading(true);
      try {
        const data = await api.getEpisodic(id);
        setDetail(data);
      } catch {
        setDetail(null);
      } finally {
        setLoading(false);
      }
    }
    setExpanded(true);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px', height: '100%' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        style={{ marginRight: 10, cursor: 'pointer' }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            color: 'var(--text-primary)',
            cursor: 'pointer',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          onClick={handleExpand}
          title={title}
        >
          {expanded ? '▼' : '▶'} {title}
        </div>
        {expanded && (
          <div style={{ marginTop: 8, padding: 10, background: 'var(--bg-secondary)', borderRadius: 4, fontSize: 12 }}>
            {loading && <div style={{ color: 'var(--text-secondary)' }}>Loading...</div>}
            {detail && (
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--text-secondary)' }}>
                {JSON.stringify(detail, null, 2)}
              </pre>
            )}
            {!loading && !detail && <div style={{ color: 'var(--danger)' }}>Record not found</div>}
          </div>
        )}
      </div>
    </div>
  );
}
