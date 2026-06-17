import StatCard from './StatCard';
import HotList from './HotList';
import type { MemoryStatsResponse, MemoryHotItem } from '../../api';

interface OverviewPanelProps {
  stats: MemoryStatsResponse | null;
  hot: MemoryHotItem[];
  onTabChange: (tab: 'episodic' | 'semantic' | 'procedural') => void;
}

export default function OverviewPanel({ stats, hot, onTabChange }: OverviewPanelProps) {
  const total = (stats?.episodic?.total || 0) + (stats?.semantic?.total || 0);
  const totalToday = (stats?.episodic?.today || 0) + (stats?.semantic?.today || 0);

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <StatCard
          label="Episodic"
          total={stats?.episodic?.total || 0}
          today={stats?.episodic?.today || 0}
          color="#79c0ff"
          onClick={() => onTabChange('episodic')}
        />
        <StatCard
          label="Semantic"
          total={stats?.semantic?.total || 0}
          today={stats?.semantic?.today || 0}
          color="#d2a8ff"
          onClick={() => onTabChange('semantic')}
        />
        <StatCard
          label="Procedural"
          total={0}
          today={0}
          color="#3fb950"
        />
        <StatCard
          label="Total"
          total={total}
          today={totalToday}
          color="var(--text-primary)"
        />
      </div>

      <div>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
          高频检索记忆
        </h3>
        <HotList items={hot} />
      </div>
    </div>
  );
}
