import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CheckCircle2, PlusCircle, SkipForward, AlertTriangle, Loader2, Download } from 'lucide-react';
import { toast } from 'sonner';

interface CommitResult {
  created: number;
  updated: number;
  skipped: number;
  failures: Array<{ row_number: number; error: string }>;
  status: string;
}

interface CWCommitPanelProps {
  jobId: string;
  ambiguousRows: number;
  matchedRows: number;
  newRows: number;
  skippedRows: number;
  invalidRows: number;
  onCommitSuccess: (result: CommitResult) => void;
}

export function CWCommitPanel({
  jobId,
  ambiguousRows,
  matchedRows,
  newRows,
  skippedRows,
  invalidRows,
  onCommitSuccess,
}: CWCommitPanelProps) {
  const unresolvedAmbiguous = ambiguousRows;
  const canCommit = unresolvedAmbiguous === 0;

  const commit = useMutation({
    mutationFn: async (): Promise<CommitResult> => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/commit-cw-import`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ jobId }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Commit failed');
      return data as CommitResult;
    },
    onSuccess: (result) => {
      toast.success(`Import committed — ${result.created} created, ${result.updated} updated`);
      onCommitSuccess(result);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="sticky bottom-0 bg-background border-t shadow-card-md px-6 py-4">
      <div className="flex items-center justify-between gap-4 max-w-5xl mx-auto">
        {/* Counts */}
        <div className="flex items-center gap-5 text-sm">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-success" />
            <span className="font-medium">{matchedRows}</span>
            <span className="text-muted-foreground">to update</span>
          </div>
          <div className="flex items-center gap-1.5">
            <PlusCircle className="w-4 h-4 text-primary" />
            <span className="font-medium">{newRows}</span>
            <span className="text-muted-foreground">to create</span>
          </div>
          <div className="flex items-center gap-1.5">
            <SkipForward className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">{skippedRows + invalidRows}</span>
            <span className="text-muted-foreground">to skip</span>
          </div>
          {unresolvedAmbiguous > 0 && (
            <div className="flex items-center gap-1.5 text-warning">
              <AlertTriangle className="w-4 h-4" />
              <span className="font-medium">{unresolvedAmbiguous}</span>
              <span>unresolved</span>
            </div>
          )}
        </div>

        {/* Apply button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Button
                onClick={() => commit.mutate()}
                disabled={!canCommit || commit.isPending}
                className="min-w-36 gap-2"
              >
                {commit.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</>
                ) : (
                  'Apply Import'
                )}
              </Button>
            </div>
          </TooltipTrigger>
          {!canCommit && (
            <TooltipContent>
              Resolve all {unresolvedAmbiguous} ambiguous rows before importing
            </TooltipContent>
          )}
        </Tooltip>
      </div>
    </div>
  );
}

// ─── Post-commit result panel ─────────────────────────────────────────────────

interface CWCommitResultProps {
  result: CommitResult;
  jobId: string;
}

export function CWCommitResult({ result, jobId }: CWCommitResultProps) {
  const [showErrors, setShowErrors] = useState(false);

  const downloadErrorReport = () => {
    if (result.failures.length === 0) return;
    const rows = ['row_number,error', ...result.failures.map(f => `${f.row_number},"${f.error.replace(/"/g, '""')}"`)];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cw-import-errors-${jobId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="sticky bottom-0 bg-background border-t shadow-card-md px-6 py-4">
      <div className="flex items-center justify-between gap-4 max-w-5xl mx-auto">
        <div className="flex items-center gap-5 text-sm">
          <div className="flex items-center gap-1.5 text-success">
            <CheckCircle2 className="w-4 h-4" />
            <span className="font-medium">Created {result.created}</span>
          </div>
          <div className="flex items-center gap-1.5 text-success">
            <CheckCircle2 className="w-4 h-4" />
            <span className="font-medium">Updated {result.updated}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <SkipForward className="w-4 h-4" />
            <span>Skipped {result.skipped}</span>
          </div>
          {result.failures.length > 0 && (
            <div className="flex items-center gap-1.5 text-destructive">
              <AlertTriangle className="w-4 h-4" />
              <button
                className="font-medium underline underline-offset-2"
                onClick={() => setShowErrors(v => !v)}
              >
                {result.failures.length} failed
              </button>
            </div>
          )}
        </div>

        {result.failures.length > 0 && (
          <Button variant="outline" size="sm" className="gap-2" onClick={downloadErrorReport}>
            <Download className="w-3.5 h-3.5" /> Download Error Report
          </Button>
        )}
      </div>

      {showErrors && result.failures.length > 0 && (
        <div className="mt-3 max-h-40 overflow-y-auto bg-destructive/5 rounded-md px-3 py-2 space-y-1">
          {result.failures.map(f => (
            <p key={f.row_number} className="text-xs text-destructive">
              <span className="font-medium">Row {f.row_number}:</span> {f.error}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
