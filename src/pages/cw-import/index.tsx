import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { parseCWPriceCSV } from '@/lib/cw-import/parser';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Upload, FileText, ChevronDown, Loader2, AlertCircle, History } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const EXPECTED_HEADERS = [
  'url', 'product_id', 'sku', 'slug', 'name', 'brand',
  'current_price', 'current_rrp', 'currency_code', 'in_stock',
  'category_path', 'image_url', 'review_rating', 'review_count',
  'source', 'updated_at',
];

export default function CWImportUploadPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [rowEstimate, setRowEstimate] = useState<number | null>(null);
  const [formatOpen, setFormatOpen] = useState(false);

  const stage = useMutation({
    mutationFn: async (f: File) => {
      const text = await f.text();
      const lines = text.split('\n').filter(l => l.trim());
      const estimatedRows = Math.max(0, lines.length - 1);

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stage-cw-import`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ csvText: text, fileName: f.name }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Stage failed');
      return data as { jobId: string; counts: Record<string, number> };
    },
    onSuccess: ({ jobId }) => {
      toast.success('CSV staged successfully — opening review');
      navigate(`/cw-import/${jobId}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleFile = useCallback((f: File) => {
    if (!f.name.endsWith('.csv')) {
      toast.error('Please select a .csv file');
      return;
    }
    setFile(f);
    // Estimate rows
    f.text().then(text => {
      const count = text.split('\n').filter(l => l.trim()).length - 1;
      setRowEstimate(count);
    });
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  return (
    <div className="flex-1 overflow-auto p-6 bg-background">
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Import Chemist Warehouse Prices</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Upload a CW scraper CSV to stage and review pricing data before committing.
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate('/cw-import/history')}>
            <History className="w-3.5 h-3.5" /> View History
          </Button>
        </div>

        {/* Upload card */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Upload CSV File</CardTitle>
            <CardDescription>Drag and drop a CW scraper export CSV, or click to browse.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label
              htmlFor="csv-upload"
              onDrop={onDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              className={cn(
                'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 cursor-pointer transition-colors',
                dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30',
                file && 'border-success/60 bg-success/5',
              )}
            >
              <input
                id="csv-upload"
                type="file"
                accept=".csv"
                className="sr-only"
                onChange={onInputChange}
              />
              {file ? (
                <>
                  <FileText className="w-10 h-10 text-success" />
                  <div className="text-center">
                    <p className="text-sm font-medium">{file.name}</p>
                    {rowEstimate != null && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        ~{rowEstimate.toLocaleString()} data rows
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <Upload className="w-10 h-10 text-muted-foreground" />
                  <div className="text-center">
                    <p className="text-sm font-medium">Drop CSV here or click to browse</p>
                    <p className="text-xs text-muted-foreground mt-0.5">.csv files only</p>
                  </div>
                </>
              )}
            </label>

            <Button
              className="w-full gap-2"
              disabled={!file || stage.isPending}
              onClick={() => file && stage.mutate(file)}
            >
              {stage.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Analysing CSV…</>
              ) : (
                <><Upload className="w-4 h-4" /> Upload &amp; Analyse</>
              )}
            </Button>

            {stage.isError && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{stage.error?.message}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Format reference */}
        <Collapsible open={formatOpen} onOpenChange={setFormatOpen}>
          <Card className="shadow-card">
            <CollapsibleTrigger asChild>
              <button className="w-full text-left px-5 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Expected CSV Format</span>
                </div>
                <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', formatOpen && 'rotate-180')} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-5 pb-5 space-y-3">
                <p className="text-xs text-muted-foreground">
                  The importer expects these exact column headers (order does not matter):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {EXPECTED_HEADERS.map(h => (
                    <code key={h} className="text-[11px] bg-muted px-1.5 py-0.5 rounded font-mono">{h}</code>
                  ))}
                </div>
                <div className="bg-warning/10 rounded-md p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                  <p className="text-xs">
                    <strong>Price note:</strong> <code className="font-mono">current_price</code> and{' '}
                    <code className="font-mono">current_rrp</code> are stored in <strong>cents</strong>.
                    e.g. <code className="font-mono">549.00</code> = <strong>$5.49 AUD</strong>.
                    The importer divides by 100 for all display and export.
                  </p>
                </div>
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>
    </div>
  );
}
