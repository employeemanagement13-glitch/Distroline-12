interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

/**
 * PageHeader — consistent section heading for every content page.
 * Shows title + optional subtitle on the left, optional action button on the right.
 */
export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
      <div>
        <h1 className="text-[13px] font-semibold text-[var(--text-primary)] leading-snug">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-snug">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

