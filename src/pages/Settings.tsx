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
import { Loader2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { Settings } from '@/types/schemas';

export default function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings>(getSettings());
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    setSettings(getSettings());
  }, []);

  const save = () => {
    saveSettings(settings);
    toast.success('Settings saved');
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
    <div className="p-6 max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure scraping behavior and defaults</p>
      </div>

      <div className="rounded-lg border border-border bg-card p-5 space-y-5 shadow-card">
        <h2 className="text-sm font-semibold">Scraping</h2>

        <div className="space-y-1.5">
          <Label className="text-xs">Max concurrent stores: {settings.maxConcurrentStores}</Label>
          <Slider min={1} max={5} step={1} value={[settings.maxConcurrentStores]}
            onValueChange={([v]) => setSettings(s => ({ ...s, maxConcurrentStores: v }))} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Inter-page delay (ms): {settings.interPageDelay}</Label>
          <Slider min={0} max={3000} step={100} value={[settings.interPageDelay]}
            onValueChange={([v]) => setSettings(s => ({ ...s, interPageDelay: v }))} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Max products per store (0 = unlimited)</Label>
          <Input type="number" min={0} className="h-9 text-sm"
            value={settings.maxProductsPerStore}
            onChange={e => setSettings(s => ({ ...s, maxProductsPerStore: parseInt(e.target.value) || 0 }))} />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5 space-y-4 shadow-card">
        <h2 className="text-sm font-semibold">Export</h2>
        <div className="flex items-center gap-3">
          <Switch id="gsc" checked={settings.googleShoppingCondition} onCheckedChange={v => setSettings(s => ({ ...s, googleShoppingCondition: v }))} />
          <Label htmlFor="gsc" className="text-sm cursor-pointer">Set Google Shopping / Condition = "New" on exports</Label>
        </div>
      </div>

      <Button onClick={save} className="w-full">Save Settings</Button>

      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-destructive">Danger Zone</h2>
        <div className="flex gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground">
                Clear Price History
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear all price history?</AlertDialogTitle>
                <AlertDialogDescription>This permanently deletes all price change records. Products and variants are kept.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={clearPriceHistory} className="bg-destructive hover:bg-destructive/90">Clear</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={clearing}>
                {clearing && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Clear All Data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear ALL data?</AlertDialogTitle>
                <AlertDialogDescription>This permanently deletes ALL stores, products, variants, and price history. This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={clearAll} className="bg-destructive hover:bg-destructive/90">Delete Everything</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
