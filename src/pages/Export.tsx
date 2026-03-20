import { useState } from 'react';
import { useExport } from '@/hooks/useExport';
import { useStores } from '@/hooks/useStores';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Download, FileText, FileSpreadsheet, History, Loader2 } from 'lucide-react';

export default function Export() {
  const [scope, setScope] = useState<'all' | 'selected'>('all');
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [changedOnly, setChangedOnly] = useState(false);
  const { data: stores } = useStores();
  const { exportShopifyCsv, exportJson, exportExcel, exportPriceHistoryCsv } = useExport();

  const storeIds = scope === 'selected' ? selectedStoreIds : undefined;

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Export</h1>
        <p className="text-sm text-muted-foreground mt-1">Generate Shopify-importable files from your product library</p>
      </div>

      <div className="rounded-lg border border-border bg-card p-5 space-y-4 shadow-card">
        <h2 className="text-sm font-semibold">Export Options</h2>

        <div className="space-y-1.5">
          <Label className="text-xs">Scope</Label>
          <Select value={scope} onValueChange={(v: any) => setScope(v)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stores</SelectItem>
              <SelectItem value="selected">Selected stores</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {scope === 'selected' && (
          <div className="space-y-1.5">
            <Label className="text-xs">Select stores</Label>
            <div className="space-y-1.5">
              {stores?.map(s => (
                <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="accent-primary" checked={selectedStoreIds.includes(s.id)}
                    onChange={e => setSelectedStoreIds(prev =>
                      e.target.checked ? [...prev, s.id] : prev.filter(id => id !== s.id)
                    )} />
                  <span className="text-sm">{s.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Switch id="changedOnly" checked={changedOnly} onCheckedChange={setChangedOnly} />
          <Label htmlFor="changedOnly" className="text-sm cursor-pointer">Changed only (since last export)</Label>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Button className="h-12 justify-start gap-3 bg-primary hover:bg-primary/90 text-primary-foreground"
          onClick={() => exportShopifyCsv.mutate({ storeIds, changedOnly })}
          disabled={exportShopifyCsv.isPending}>
          {exportShopifyCsv.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          <div className="text-left">
            <p className="text-sm font-medium">Export Shopify CSV</p>
            <p className="text-xs opacity-75">Importable product feed</p>
          </div>
        </Button>

        <Button variant="outline" className="h-12 justify-start gap-3"
          onClick={() => exportJson.mutate({ storeIds, changedOnly })}
          disabled={exportJson.isPending}>
          {exportJson.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          <div className="text-left">
            <p className="text-sm font-medium">Export JSON</p>
            <p className="text-xs text-muted-foreground">Raw product data</p>
          </div>
        </Button>

        <Button variant="outline" className="h-12 justify-start gap-3"
          onClick={() => exportExcel.mutate({ storeIds, changedOnly })}
          disabled={exportExcel.isPending}>
          {exportExcel.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
          <div className="text-left">
            <p className="text-sm font-medium">Export Excel (.xlsx)</p>
            <p className="text-xs text-muted-foreground">Shopify columns preserved</p>
          </div>
        </Button>

        <Button variant="outline" className="h-12 justify-start gap-3"
          onClick={() => exportPriceHistoryCsv.mutate({ storeIds })}
          disabled={exportPriceHistoryCsv.isPending}>
          {exportPriceHistoryCsv.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <History className="w-4 h-4" />}
          <div className="text-left">
            <p className="text-sm font-medium">Export Price History CSV</p>
            <p className="text-xs text-muted-foreground">All price change events</p>
          </div>
        </Button>
      </div>
    </div>
  );
}
