import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Play, Square, RefreshCw, ChevronDown, ChevronUp,
  AlertCircle, CheckCircle2, Clock, Loader2,
  SkipForward, AlertTriangle, Timer, Zap,
} from 'lucide-react';
import { useScrapeRun } from '@/hooks/useScrapeRun';
import { useStores } from '@/hooks/useStores';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

const STATUS_COLORS: Record<string, string> = {
  queued:    'bg-muted-foreground/20 text-muted-foreground',
  fetching:  'bg-yellow-500/20 text-yellow-500',
  completed: 'bg-primary/20 text-primary',
  error:     'bg-destructive/20 text-destructive',
  cancelled: 'bg-muted-foreground/20 text-muted-foreground',
};
const STATUS_ICONS: Record<string, React.ReactNode> = {
  queued:    <Clock className="w-3 h-3" />,
  fetching:  <Loader2 className="w-3 h-3 animate-spin" />,
  completed: <CheckCircle2 className="w-3 h-3" />,
  error:     <AlertCircle className="w-3 h-3" />,
  cancelled: <Square className="w-3 h-3" />,
};
const LOG_COLORS: Record<string, string> = {
  info:         'text-muted-foreground',
  warn:         'text-yellow-500',
  error:        'text-destructive',
  price_change: 'text-primary font-medium',
};

// Stall banner
function StallBanner({ level, onSkip, onCancel }: { level: 'warn' | 'critical'; onSkip: () => void; onCancel: () => void }) {
  const isCrit = level === 'critical';
  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-2 rounded-lg text-[12px] font-medium border',
      isCrit
        ? 'bg-destructive/10 text-destructive border-destructive/30'
        : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
    )}>
      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="flex-1">
        {isCrit
          ? 'No activity for 90 seconds — scraper may be stalled. Consider skipping the current collection or cancelling the run.'
          : 'No activity for 45 seconds — scraper may be stuck.'}
      </span>
      <button onClick={onSkip} className="underline hover:no-underline whitespace-nowrap">Skip collection</button>
      {isCrit && <button onClick={onCancel} className="underline hover:no-underline whitespace-nowrap ml-2">Cancel run</button>}
    </div>
  );
}

export function ScrapeControl() {
  const { runData, status, storeStatuses, logs, stallLevel, startRun, cancelRun, skipCurrentCollection, resetRun, isRunning } = useScrapeRun();
  const { data: stores } = useStores();
  const [logsOpen, setLogsOpen] = useState(false);
  const queryClient = useQueryClient();
  const enabledStores = stores?.filter(s => s.enabled) ?? [];

  // Find currently-fetching store for status bar
  const activeStoreEntry = Object.entries(storeStatuses).find(([, s]) => s.status === 'fetching');
  const activeStoreId = activeStoreEntry?.[0];
  const activeStoreRecord = activeStoreEntry?.[1] as any;
  const activeStoreName = stores?.find(s => s.id === activeStoreId)?.name;

  const progress = runData
    ? Math.round((runData.completed_stores / Math.max(runData.total_stores, 1)) * 100)
    : 0;

  const handleStart = async () => {
    await startRun();
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['price_history'] });
  };

  return (
    <div className="rounded-lg border border-border bg-card shadow-card p-4 space-y-4">
      {/* Header + controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-foreground">Scrape Control</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{enabledStores.length} store{enabledStores.length !== 1 ? 's' : ''} enabled · sequential mode</p>
        </div>
        <div className="flex items-center gap-2">
          {(status === 'completed' || status === 'cancelled' || status === 'failed') && (
            <Button variant="ghost" size="sm" onClick={resetRun} className="text-muted-foreground">
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Reset
            </Button>
          )}
          {isRunning && (
            <>
              <Button variant="outline" size="sm" onClick={skipCurrentCollection} className="text-yellow-600 dark:text-yellow-400 border-yellow-500/40 hover:bg-yellow-500/10">
                <SkipForward className="w-3.5 h-3.5 mr-1.5" />Skip Collection
              </Button>
              <Button variant="destructive" size="sm" onClick={cancelRun}>
                <Square className="w-3.5 h-3.5 mr-1.5" />Cancel
              </Button>
            </>
          )}
          {!isRunning && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-glow font-medium"
                  onClick={handleStart}
                  disabled={status === 'running' || enabledStores.length === 0}
                >
                  <Play className="w-3.5 h-3.5 mr-1.5" />
                  Scrape All Enabled Stores
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                Runs stores one at a time with 4-strategy fallback per collection. Uses public Shopify JSON endpoints.
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Stall banner */}
      {isRunning && stallLevel !== 'none' && (
        <StallBanner level={stallLevel} onSkip={skipCurrentCollection} onCancel={cancelRun} />
      )}

      {/* Active run status bar */}
      {isRunning && activeStoreRecord && (
        <div className="bg-muted/40 rounded-lg border border-border px-3 py-2 text-[11px] space-y-1">
          <div className="flex items-center gap-2 text-foreground font-medium">
            <Zap className="w-3 h-3 text-primary" />
            <span>{activeStoreName ?? 'Unknown store'}</span>
            {activeStoreRecord.current_collection && (
              <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-mono">{activeStoreRecord.current_collection}</Badge>
            )}
            {activeStoreRecord.current_strategy && (
              <Badge variant="outline" className="text-[9px] h-4 px-1.5 text-muted-foreground">{activeStoreRecord.current_strategy}</Badge>
            )}
          </div>
          <div className="flex items-center gap-4 text-muted-foreground">
            {activeStoreRecord.collections_total > 0 && (
              <span>Collections: {activeStoreRecord.collections_completed ?? 0}/{activeStoreRecord.collections_total ?? 0}
                {activeStoreRecord.collections_skipped > 0 && <span className="text-yellow-500 ml-1">({activeStoreRecord.collections_skipped} skipped)</span>}
              </span>
            )}
            <span>Products saved: {(runData?.total_products ?? 0).toLocaleString()}</span>
          </div>
        </div>
      )}

      {runData && (
        <>
          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{runData.completed_stores}/{runData.total_stores} stores</span>
              <span>{runData.total_products.toLocaleString()} products · {runData.total_price_changes} changes · {runData.error_count} errors</span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>

          {/* Store status cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {Object.entries(storeStatuses).map(([storeId, s]) => {
              const store = stores?.find(st => st.id === storeId);
              const rs = s as any;
              return (
                <div key={storeId} className={cn('flex items-start gap-2 p-2.5 rounded-md border text-xs', STATUS_COLORS[s.status] || STATUS_COLORS.queued, 'border-current/20 bg-current/5')}>
                  <span className="mt-0.5 flex-shrink-0">{STATUS_ICONS[s.status]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{store?.name ?? storeId.slice(0, 8)}</p>
                    <p className="opacity-75 truncate">
                      {rs.terminal_status ? rs.terminal_status : (s.message || s.status)}
                    </p>
                    {s.status === 'fetching' && rs.current_collection && (
                      <p className="opacity-60 truncate text-[9px] font-mono mt-0.5">{rs.current_collection} · {rs.current_strategy}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Logs panel */}
          <div>
            <button
              onClick={() => setLogsOpen(v => !v)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {logsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {logsOpen ? 'Hide' : 'Show'} live log ({logs.length})
            </button>
            {logsOpen && (
              <ScrollArea className="h-40 mt-2 rounded border border-border bg-background/50 p-2">
                <div className="space-y-0.5 font-mono">
                  {logs.length === 0 && <p className="text-xs text-muted-foreground">No logs yet…</p>}
                  {logs.map(log => (
                    <div key={log.id} className={cn('text-[11px]', LOG_COLORS[log.level] || LOG_COLORS.info)}>
                      <span className="opacity-50 mr-1.5">{new Date(log.created_at).toLocaleTimeString()}</span>
                      {log.message}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </>
      )}
    </div>
  );
}
