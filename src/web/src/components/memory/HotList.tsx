import { useState } from 'react';
import type { MemoryHotItem } from '../../api';

interface HotListProps {
  items: MemoryHotItem[];
}

export default function HotList({ items }: HotListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div style={{ color: 'var(--text-secondary)', fontSize: 13, padding: '12px 0' }}>
        暂无高频检索记录
      </div>
    );
  }

  return (
    <div>
      {items.map((item) => {
        const isExpanded = expandedId === item.memory.id;
        return (
          <div
            key={`${item.layer}-${item.memory.id}`}
            onClick={() => setExpandedId(isExpanded ? null : item.memory.id)}
            style={{
              padding: '8px 0',
              borderBottom: '1px solid var(--border)',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <span style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 12,
                  background: item.layer === 'episodic' ? '#1f6feb33' : '#8957e533',
                  color: item.layer === 'episodic' ? '#79c0ff' : '#d2a8ff',
                }}>
                  {item.layer}
                </span>
                <span style={{ color: 'var(--text-primary)', fontSize: 14 }}>{item.memory.title}</span>
              </div>
              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                {item.hit_count} 次
              </span>
            </div>
            {isExpanded && (
              <div style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: '1px solid var(--border)',
                fontSize: 12,
                color: 'var(--text-secondary)',
                whiteSpace: 'pre-wrap',
                maxHeight: 300,
                overflow: 'auto',
              }}>
                {JSON.stringify(item.memory, null, 2)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
