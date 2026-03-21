import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type ImportStatus = 'uploaded' | 'parsing' | 'review' | 'importing' | 'completed' | 'failed';
type MatchStatus = 'matched' | 'new' | 'ambiguous' | 'invalid' | 'skipped';

interface CWStatusBadgeProps {
  status: ImportStatus | MatchStatus | string;
  className?: string;
}

const CONFIG: Record<string, { label: string; className: string }> = {
  // Import job statuses
  uploaded:   { label: 'Uploaded',   className: 'bg-muted text-muted-foreground' },
  parsing:    { label: 'Parsing…',   className: 'bg-warning/15 text-warning' },
  review:     { label: 'Review',     className: 'bg-primary/15 text-primary' },
  importing:  { label: 'Importing…', className: 'bg-warning/15 text-warning' },
  completed:  { label: 'Completed',  className: 'bg-success/15 text-success' },
  failed:     { label: 'Failed',     className: 'bg-destructive/15 text-destructive' },
  // Match statuses
  matched:    { label: 'Matched',    className: 'bg-success/15 text-success' },
  new:        { label: 'New',        className: 'bg-primary/15 text-primary' },
  ambiguous:  { label: 'Ambiguous',  className: 'bg-warning/15 text-warning' },
  invalid:    { label: 'Invalid',    className: 'bg-destructive/15 text-destructive' },
  skipped:    { label: 'Skipped',    className: 'bg-muted text-muted-foreground' },
};

export function CWStatusBadge({ status, className }: CWStatusBadgeProps) {
  const cfg = CONFIG[status] ?? { label: status, className: 'bg-muted text-muted-foreground' };
  return (
    <Badge variant="outline" className={cn('border-0 font-medium text-[11px] px-2 py-0.5', cfg.className, className)}>
      {cfg.label}
    </Badge>
  );
}
