import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { getSettings, saveSettings } from '@/lib/scrapeClient';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2, Save, Sliders, Download, AlertTriangle, Info } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { Settings } from '@/types/schemas';

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; AUPharmacyScout/1.0)';

function SettingSection({ icon: Icon, title, subtitle, children }: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center">
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-[13.5px] font-bold text-foreground">{title}</h2>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="p-6 space-y-5">
        {children}
      </div>
    </div>
  );
}

function SliderRow({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-[12px] font-medium text-foreground">{label}</Label>
        <span className="text-[12px] font-bold tabular-nums text-primary bg-primary/8 px-2 py-0.5 rounded-lg">{value}</span>
      </div>
      <Slider min={min} max={max} step={step} value={[value]}
        onValueChange={([v]) => onChange(v)}
        className="w-full" />
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{min}</span><span>{max}</span>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings>(getSettings());
  const [clearing, setClearing] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSettings(getSettings());
  }, []);

  const save = () => {
    saveSettings(settings);
    toast.success('Settings saved');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const clearAll = async () => {
    if (!user) return;
    setClearing(true);
    try {
      await supabase.from('products').delete().eq('user_id', user.id);
      await supabase.from('stores').delete().eq('user_id', user.id);
      toast.success('All data cleared');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setClearing(false);
    }
  };

  const clearPriceHistory = async () => {
    if (!user) return;
    await supabase.from('variant_price_history').delete().eq('user_id', user.id);
    toast.success('Price history cleared');
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">

      {/* ── Top Bar ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 px-6 py-3.5 border-b border-border bg-white flex-shrink-0">
        <div>
          <h1 className="text-[17px] font-bold tracking-tight text-foreground leading-none">Settings</h1>
          <p className="text-[11.5px] text-muted-foreground mt-0.5">Scraping behaviour and export defaults</p>
        </div>
        <Button
          onClick={save}
          size="sm"
          className="h-8 gap-1.5 text-[12px] rounded-xl bg-foreground hover:bg-foreground/90 text-background font-semibold"
        >
          {saved ? '✓ Saved' : <><Save className="w-3 h-3" /> Save Settings</>}
        </Button>
      </div>

      {/* ── Content ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-4 max-w-2xl">

          {/* Scraping */}
          <SettingSection icon={Sliders} title="Scraping" subtitle="Control concurrency, delays, and request behaviour">
            <SliderRow
              label="Max concurrent stores"
              value={settings.maxConcurrentStores}
              min={1} max={5} step={1}
              onChange={v => setSettings(s => ({ ...s, maxConcurrentStores: v }))}
            />
            <SliderRow
              label={`Inter-page delay (ms)`}
              value={settings.interPageDelay}
              min={0} max={3000} step={100}
              onChange={v => setSettings(s => ({ ...s, interPageDelay: v }))}
            />
            <SliderRow
              label={`Tier timeout (seconds per request)`}
              value={settings.tierTimeout ?? 30}
              min={5} max={120} step={5}
              onChange={v => setSettings(s => ({ ...s, tierTimeout: v }))}
            />

            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-foreground">Max products per store</Label>
              <p className="text-[11px] text-muted-foreground">Set to 0 for unlimited.</p>
              <Input
                type="number" min={0}
                className="h-9 text-[12px] rounded-xl max-w-xs"
                value={settings.maxProductsPerStore}
                onChange={e => setSettings(s => ({ ...s, maxProductsPerStore: parseInt(e.target.value) || 0 }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-foreground">Custom User-Agent</Label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  className="h-9 text-[11.5px] font-mono rounded-xl"
                  value={settings.userAgent ?? DEFAULT_USER_AGENT}
                  onChange={e => setSettings(s => ({ ...s, userAgent: e.target.value }))}
                  placeholder={DEFAULT_USER_AGENT}
                />
                <Button type="button" variant="outline" size="sm" className="h-9 shrink-0 text-[12px] rounded-xl"
                  onClick={() => setSettings(s => ({ ...s, userAgent: DEFAULT_USER_AGENT }))}>
                  Reset
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <Switch
                id="reauth"
                checked={settings.reAuthBeforeEachScrape ?? false}
                onCheckedChange={v => setSettings(s => ({ ...s, reAuthBeforeEachScrape: v }))}
              />
              <div>
                <Label htmlFor="reauth" className="text-[12px] font-medium cursor-pointer">Re-authenticate before each scrape</Label>
                <p className="text-[11px] text-muted-foreground">Default: only re-auth if session expired.</p>
              </div>
            </div>
          </SettingSection>

          {/* Export */}
          <SettingSection icon={Download} title="Export" subtitle="Configure how exported files are formatted">
            <div className="flex items-center gap-3">
              <Switch
                id="gsc"
                checked={settings.googleShoppingCondition}
                onCheckedChange={v => setSettings(s => ({ ...s, googleShoppingCondition: v }))}
              />
              <div>
                <Label htmlFor="gsc" className="text-[12px] font-medium cursor-pointer">Set Google Shopping Condition = "New"</Label>
                <p className="text-[11px] text-muted-foreground">Adds condition column to Shopify CSV exports.</p>
              </div>
            </div>
          </SettingSection>

          {/* Info */}
          <div className="bg-primary/5 border border-primary/15 rounded-2xl px-5 py-4 flex items-start gap-3">
            <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-[11.5px] text-foreground leading-relaxed">
              Settings are stored locally in your browser. They apply to the next scrape run. Changes take effect immediately after saving.
            </p>
          </div>

          {/* Save button (inline) */}
          <Button onClick={save} className="w-full h-10 text-[13px] rounded-xl bg-foreground hover:bg-foreground/90 text-background font-semibold gap-2">
            <Save className="w-3.5 h-3.5" />
            {saved ? 'Saved ✓' : 'Save Settings'}
          </Button>

          {/* Danger Zone */}
          <div className="bg-white rounded-2xl border border-destructive/25 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-destructive/20 flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-destructive" />
              </div>
              <div>
                <h2 className="text-[13.5px] font-bold text-destructive">Danger Zone</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">Irreversible actions — proceed with caution</p>
              </div>
            </div>
            <div className="p-6 flex flex-col sm:flex-row gap-3">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm"
                    className="h-9 text-[12px] rounded-xl border-destructive/40 text-destructive hover:bg-destructive/5">
                    Clear Price History
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-2xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear all price history?</AlertDialogTitle>
                    <AlertDialogDescription>This permanently deletes all price change records. Products and variants are kept.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={clearPriceHistory} className="rounded-xl bg-destructive hover:bg-destructive/90">Clear</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="h-9 text-[12px] rounded-xl" disabled={clearing}>
                    {clearing && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                    Clear All Data
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-2xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear ALL data?</AlertDialogTitle>
                    <AlertDialogDescription>This permanently deletes ALL stores, products, variants, and price history. This cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={clearAll} className="rounded-xl bg-destructive hover:bg-destructive/90">Delete Everything</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
