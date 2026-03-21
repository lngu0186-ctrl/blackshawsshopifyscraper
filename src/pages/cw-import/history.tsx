import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { CWStatusBadge } from '@/components/cw-import/CWStatusBadge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, FolderOpen } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

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
}

export default function CWImportListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: jobs = [], isLoading } = useQuery<ImportJob[]>({
    queryKey: ['cw-import-jobs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cw_import_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as ImportJob[];
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  return (
    <div className="flex-1 overflow-auto p-6 bg-background">
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">CW Import History</h1>
            <p className="text-sm text-muted-foreground mt-0.5">All past Chemist Warehouse price import jobs.</p>
          </div>
          <Button size="sm" className="gap-2" onClick={() => navigate('/cw-import')}>
            <Plus className="w-3.5 h-3.5" /> New Import
          </Button>
        </div>

        <Card className="shadow-card">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-xs">File Name</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs text-right">Total</TableHead>
                  <TableHead className="text-xs text-right">Matched</TableHead>
                  <TableHead className="text-xs text-right">New</TableHead>
                  <TableHead className="text-xs text-right">Ambiguous</TableHead>
                  <TableHead className="text-xs text-right">Invalid</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground text-sm py-10">Loading…</TableCell>
                  </TableRow>
                )}
                {!isLoading && jobs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <FolderOpen className="w-8 h-8" />
                        <div>
                          <p className="text-sm font-medium">No imports yet</p>
                          <p className="text-xs mt-0.5">Upload a CW scraper CSV to get started.</p>
                        </div>
                        <Button size="sm" onClick={() => navigate('/cw-import')}>New Import</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {jobs.map(job => (
                  <TableRow key={job.id} className="hover:bg-muted/20">
                    <TableCell className="text-sm font-medium max-w-[200px] truncate">{job.file_name}</TableCell>
                    <TableCell><CWStatusBadge status={job.status} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-sm text-right tabular-nums">{job.total_rows.toLocaleString()}</TableCell>
                    <TableCell className="text-sm text-right tabular-nums text-success">{job.matched_rows}</TableCell>
                    <TableCell className="text-sm text-right tabular-nums text-primary">{job.new_rows}</TableCell>
                    <TableCell className="text-sm text-right tabular-nums text-warning">{job.ambiguous_rows}</TableCell>
                    <TableCell className="text-sm text-right tabular-nums text-destructive">{job.invalid_rows}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => navigate(`/cw-import/${job.id}`)}
                      >
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
