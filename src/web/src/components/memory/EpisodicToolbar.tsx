interface Props {
  totalCount: number;
  selectedCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onDelete: () => void;
}

export default function EpisodicToolbar({ totalCount, selectedCount, onSelectAll, onDeselectAll, onDelete }: Props) {
  const allSelected = totalCount > 0 && selectedCount === totalCount;

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '4px 12px',
            fontSize: 12,
            color: 'var(--text-primary)',
            cursor: 'pointer',
          }}
          onClick={allSelected ? onDeselectAll : onSelectAll}
        >
          {allSelected ? '取消全选' : '全选'} ({selectedCount}/{totalCount})
        </button>
      </div>
      <button
        style={{
          background: selectedCount > 0 ? 'var(--danger)' : 'var(--border)',
          border: 'none',
          borderRadius: 4,
          padding: '4px 12px',
          fontSize: 12,
          color: selectedCount > 0 ? '#fff' : 'var(--text-secondary)',
          cursor: selectedCount > 0 ? 'pointer' : 'not-allowed',
        }}
        disabled={selectedCount === 0}
        onClick={() => {
          if (window.confirm(`确认删除 ${selectedCount} 条情景记忆？\\n此操作不可撤销。`)) {
            onDelete();
          }
        }}
      >
        删除选中 ({selectedCount})
      </button>
    </div>
  );
}
