import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CWStatusBadge } from '@/components/cw-import/CWStatusBadge';
import { CWImportTable, type CWImportRow } from '@/components/cw-import/CWImportTable';
import { CWRowReviewDrawer } from '@/components/cw-import/CWRowReviewDrawer';
import { CWCommitPanel, CWCommitResult } from '@/components/cw-import/CWCommitPanel';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

type MatchFilter = 'all' | 'matched' | 'new' | 'ambiguous' | 'invalid' | 'skipped';

interface ImportJob {
  id: string;
  file_name: string;
  status: string;
  total_rows: number;
  matched_rows: number;
  new_rows: number;
  ambiguous_rows: number;
  invalid_rows: number;
  skipped_rows: number;
  created_at: string;
  completed_at: string | null;
  error_summary: string | null;
}

interface CommitResult {
  created: number;
  updated: number;
  skipped: number;
  failures: Array<{ row_number: number; error: string }>;
  status: string;
}

function StatCard({ label, value, colorClass }: { label: string; value: number; colorClass?: string }) {
  return (
    <Card className="shadow-card">
      <CardContent className="px-4 py-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold tabular-nums mt-0.5 ${colorClass ?? ''}`}>
          {value.toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}

export default function CWImportReviewPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeFilter, setActiveFilter] = useState<MatchFilter>('all');
  const [selectedRow, setSelectedRow] = useState<CWImportRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);

  const { data: job, isLoading } = useQuery<ImportJob>({
    queryKey: ['cw-import-job', jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cw_import_jobs')
        .select('*')
        .eq('id', jobId!)
        .single();
      if (error) throw error;
      return data as unknown as ImportJob;
    },
    enabled: !!jobId,
    staleTime: 10_000,
    refetchInterval: (query) => {
      const status = (query.state.data as ImportJob | undefined)?.status;
      return status === 'parsing' || status === 'importing' ? 3000 : false;
    },
  });

  const handleRowClick = (row: CWImportRow) => {
    setSelectedRow(row);
    setDrawerOpen(true);
  };

  const handleCommitSuccess = (result: CommitResult) => {
    setCommitResult(result);
    queryClient.invalidateQueries({ queryKey: ['cw-import-job', jobId] });
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading import job…</div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Import job not found.</div>
      </div>
    );
  }

  const isCompleted = job.status === 'completed';
  const isInProgress = job.status === 'parsing' || job.status === 'importing';

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Top bar */}
      <div className="px-6 py-4 border-b bg-background shrink-0">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 shrink-0" onClick={() => navigate('/cw-import/history')}>
              <ArrowLeft className="w-3.5 h-3.5" />
            </Button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold truncate">{job.file_name}</h1>
                <CWStatusBadge status={job.status} />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {new Date(job.created_at).toLocaleString()}
                {isInProgress && ' — processing…'}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['cw-import-job', jobId] })}
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-6 py-5 space-y-5">
          {/* Stat cards */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <StatCard label="Total" value={job.total_rows} />
            <StatCard label="Matched" value={job.matched_rows} colorClass="text-success" />
            <StatCard label="New" value={job.new_rows} colorClass="text-primary" />
            <StatCard label="Ambiguous" value={job.ambiguous_rows} colorClass="text-warning" />
            <StatCard label="Invalid" value={job.invalid_rows} colorClass="text-destructive" />
            <StatCard label="Skipped" value={job.skipped_rows} colorClass="text-muted-foreground" />
          </div>

          {job.error_summary && (
            <div className="bg-destructive/10 text-destructive text-sm px-4 py-2.5 rounded-lg">
              {job.error_summary}
            </div>
          )}

          {/* Table */}
          {jobId && (
            <CWImportTable
              jobId={jobId}
              activeFilter={activeFilter}
              onFilterChange={setActiveFilter}
              onRowClick={handleRowClick}
            />
          )}
        </div>
      </div>

      {/* Commit panel — sticky footer */}
      {jobId && !isCompleted && !commitResult && (
        <CWCommitPanel
          jobId={jobId}
          ambiguousRows={job.ambiguous_rows}
          matchedRows={job.matched_rows}
          newRows={job.new_rows}
          skippedRows={job.skipped_rows}
          invalidRows={job.invalid_rows}
          onCommitSuccess={handleCommitSuccess}
        />
      )}
      {commitResult && <CWCommitResult result={commitResult} jobId={jobId!} />}

      {/* Row review drawer */}
      {jobId && (
        <CWRowReviewDrawer
          row={selectedRow}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          jobId={jobId}
        />
      )}
    </div>
  );
}
