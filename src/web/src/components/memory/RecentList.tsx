import type { MemoryRecentItem } from '../../api';
import { formatDate } from '../../utils/date';

interface RecentListProps {
  items: MemoryRecentItem[];
}

export default function RecentList({ items }: RecentListProps) {
  if (items.length === 0) {
    return (
      <div style={{ color: 'var(--text-secondary)', fontSize: 13, padding: '20px 0' }}>
        当前无新增记忆记录，请进入 Collection 页面开始记忆进化...
      </div>
    );
  }

  return (
    <div>
      {items.map((item) => (
        <div
          key={`${item.layer}-${item.id}`}
          style={{
            padding: '10px 0',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
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
            <span style={{ color: 'var(--text-primary)', fontSize: 14 }}>{item.title}</span>
          </div>
          <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
            {formatDate(item.created_at)}
          </span>
        </div>
      ))}
    </div>
  );
}
