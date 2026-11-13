import Button from './Button';

// Skeleton, empty state, pagination (Build Spec §4).

export function Skeleton({ height = 16, width = '100%', style }) {
  return <div className="skeleton" style={{ height, width, ...style }} aria-hidden="true" />;
}

export function TeamCardSkeleton() {
  return (
    <div className="team-card" aria-hidden="true">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <Skeleton height={22} width="55%" />
        <Skeleton height={22} width={76} style={{ borderRadius: 9999 }} />
      </div>
      <Skeleton height={14} width="92%" style={{ marginBottom: 8 }} />
      <Skeleton height={14} width="70%" style={{ marginBottom: 20 }} />
      <Skeleton height={8} width="100%" style={{ marginBottom: 20 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Skeleton height={28} width={96} style={{ borderRadius: 9999 }} />
        <Skeleton height={36} width={72} />
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, text, actionLabel, onAction }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
      {actionLabel && <Button onClick={onAction}>{actionLabel}</Button>}
    </div>
  );
}

export function Pagination({ page, totalPages, onPage }) {
  if (totalPages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Prev
      </Button>
      <span className="page-label">
        Page {page} of {totalPages}
      </span>
      <Button
        variant="secondary"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        Next
      </Button>
    </nav>
  );
}
