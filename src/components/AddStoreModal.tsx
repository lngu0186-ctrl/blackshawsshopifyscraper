/**
 * AddStoreModal — Block 5: Enhanced qualification card with scrapeability score,
 * platform detection, recommended action badge, and confirm/cancel flow.
 * Block 9: Store type, anti-bot detection, AU pharmacy signals.
 */
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Loader2, CheckCircle, XCircle, Lock, ShieldAlert,
  CheckCircle2, AlertTriangle, Globe, Layers, ExternalLink,
  Zap, Store,
} from 'lucide-react';
import { AddStoreSchema, type AddStoreForm } from '@/types/schemas';
import { useAddStore, useValidateStore, useAuthStore } from '@/hooks/useStores';
import { normalizeUrl } from '@/lib/url';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type QualificationResult = {
  valid: boolean;
  scrape_strategy?: string;
  validation_status?: string;
  requires_auth?: boolean;
  auth_type?: string;
  normalized_url?: string;
  myshopify_domain?: string;
  message?: string;
  error?: string;
  // Qualification card fields
  platform?: string;
  platform_confidence?: string;
  scrapeability_score?: number;
  recommended_action?: string;
  reachability_status?: string;
  sitemap_found?: boolean;
  sitemap_url?: string;
  sample_collections?: string[];
  sample_product_url?: string;
  pagination_detected?: boolean;
  login_required?: boolean;
  antibot_suspected?: boolean;
  store_type?: string;
  qualification_notes?: string[];
  page_title?: string;
};

// ── Recommended action badge ───────────────────────────────────────────────────
function ActionBadge({ action }: { action: string | undefined }) {
  if (!action) return null;
  const map: Record<string, { label: string; cls: string }> = {
    supported:          { label: '✅ Supported',              cls: 'bg-success/15 text-success border-success/30' },
    supported_caution:  { label: '⚠️ Supported with Caution', cls: 'bg-warning/15 text-warning border-warning/30' },
    limited_support:    { label: '🔶 Limited Support',         cls: 'bg-orange-500/15 text-orange-600 border-orange-500/30' },
    not_recommended:    { label: '❌ Not Recommended',          cls: 'bg-destructive/15 text-destructive border-destructive/30' },
  };
  const s = map[action] ?? { label: action, cls: 'bg-muted text-muted-foreground' };
  return (
    <span className={cn('inline-flex items-center px-2 py-1 rounded-lg text-[12px] font-semibold border', s.cls)}>
      {s.label}
    </span>
  );
}

// ── Signal row ─────────────────────────────────────────────────────────────────
function Signal({ label, value, yes }: { label: string; value: string; yes?: boolean | null }) {
  return (
    <div className="flex items-center justify-between text-[11px] py-1 border-b border-border/50 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-medium', yes === true ? 'text-success' : yes === false ? 'text-destructive' : 'text-foreground')}>
        {value}
      </span>
    </div>
  );
}

// ── Store type badge ───────────────────────────────────────────────────────────
function StoreTypeBadge({ type }: { type: string | undefined }) {
  const labels: Record<string, string> = {
    pharmacy:             '💊 Pharmacy',
    chemist:              '🏥 Chemist',
    vitamins_supplements: '💊 Vitamins & Supplements',
    wellness_apothecary:  '🌿 Wellness / Apothecary',
    general_health:       '❤️ General Health',
    unknown:              'Unknown',
  };
  return (
    <Badge variant="outline" className="text-[10px]">
      {labels[type ?? 'unknown'] ?? type}
    </Badge>
  );
}

export function AddStoreModal({ open, onOpenChange }: Props) {
  const { register, handleSubmit, formState: { errors }, reset, watch } = useForm<AddStoreForm>({
    resolver: zodResolver(AddStoreSchema),
  });
  const [qualResult, setQualResult] = useState<QualificationResult | null>(null);
  const [pendingData, setPendingData] = useState<AddStoreForm | null>(null);
  const [addedStoreId, setAddedStoreId] = useState<string | null>(null);
  const [authPassword, setAuthPassword] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authResult, setAuthResult] = useState<{ success: boolean; message: string } | null>(null);

  const validateStore = useValidateStore();
  const addStore = useAddStore();
  const authStoreMutation = useAuthStore();

  const needsAuth = qualResult?.requires_auth;
  const authType = qualResult?.auth_type;
  const score = qualResult?.scrapeability_score ?? 0;

  // Step 1: Run qualification
  const onSubmit = async (data: AddStoreForm) => {
    setQualResult(null);
    setAuthResult(null);
    setAddedStoreId(null);
    setPendingData(data);

    const result = await validateStore.mutateAsync(data.url).catch(e => ({
      valid: false, error: e.message, scrape_strategy: 'invalid', validation_status: 'invalid',
      requires_auth: false, normalized_url: '', message: e.message,
    })) as QualificationResult;

    setQualResult(result);
  };

  // Step 2: Confirm and save after showing qualification card
  const handleConfirmSave = async () => {
    if (!qualResult || !pendingData) return;

    // Update the store record with qualification data
    const added = await addStore.mutateAsync({
      name: pendingData.name,
      url: pendingData.url,
      normalizedUrl: qualResult.normalized_url || normalizeUrl(pendingData.url),
      validationStatus: qualResult.validation_status || 'valid',
      myshopifyDomain: qualResult.myshopify_domain,
      scrapeStrategy: qualResult.scrape_strategy,
      requiresAuth: qualResult.requires_auth || false,
      authType: qualResult.auth_type || 'none',
      // Extended qualification fields
      platform: qualResult.platform,
      platformConfidence: qualResult.platform_confidence,
      scrapeabilityScore: qualResult.scrapeability_score,
      reachabilityStatus: qualResult.reachability_status,
      qualificationNotes: qualResult.qualification_notes?.join('; '),
      storeType: qualResult.store_type,
      antibotSuspected: qualResult.antibot_suspected,
      loginRequired: qualResult.login_required,
      sitemapFound: qualResult.sitemap_found,
      sitemapUrl: qualResult.sitemap_url,
    } as any);

    if (qualResult.requires_auth) {
      setAddedStoreId((added as any).id);
    } else {
      handleClose(false);
    }
  };

  const handleAuthSubmit = async () => {
    if (!addedStoreId || !qualResult?.normalized_url) return;
    setAuthResult(null);

    const params: any = {
      store_id: addedStoreId,
      url: qualResult.normalized_url,
      auth_type: authType || 'storefront_password',
    };
    if (authType === 'customer_account') {
      params.email = authEmail;
      params.password = authPassword;
    } else {
      params.password = authPassword;
    }

    const result = await authStoreMutation.mutateAsync(params).catch(e => ({
      success: false, auth_status: 'failed', message: e.message,
    }));

    setAuthResult({ success: result.success, message: result.message });

    if (result.success) {
      setTimeout(() => handleClose(false), 1500);
    }
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      reset();
      setQualResult(null);
      setPendingData(null);
      setAddedStoreId(null);
      setAuthPassword('');
      setAuthEmail('');
      setAuthResult(null);
    }
    onOpenChange(v);
  };

  // Determine which step we're on
  const showForm = !qualResult;
  const showQualCard = qualResult && !addedStoreId;
  const showAuthStep = !!addedStoreId;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Add Pharmacy Store</DialogTitle>
          <DialogDescription>
            Enter the store URL to run a qualification check before adding.
          </DialogDescription>
        </DialogHeader>

        {/* ── Step 1: Entry form ─────────────────────────────────────────────── */}
        {showForm && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Store name</Label>
              <Input id="name" placeholder="Alchemy Pharmacy" {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="url">Store URL</Label>
              <Input id="url" placeholder="https://alchemypharmacy.com.au" {...register('url')} />
              {errors.url && <p className="text-xs text-destructive">{errors.url.message}</p>}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={validateStore.isPending}>
                {validateStore.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {validateStore.isPending ? 'Qualifying…' : 'Qualify & Add'}
              </Button>
            </div>
          </form>
        )}

        {/* ── Step 2: Qualification card ──────────────────────────────────────── */}
        {showQualCard && qualResult && (
          <ScrollArea className="flex-1 mt-2 -mx-1 px-1">
            <div className="space-y-4 pb-2">
              {/* Header: store name + action badge */}
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-[13px] font-semibold text-foreground truncate">{pendingData?.name}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{qualResult.normalized_url}</p>
                </div>
                <ActionBadge action={qualResult.recommended_action} />
              </div>

              {/* Scrapeability score */}
              <div className="bg-muted/40 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] font-semibold text-foreground">Scrapeability Score</span>
                  <span className={cn('text-[16px] font-bold tabular-nums',
                    score >= 80 ? 'text-success' : score >= 60 ? 'text-warning' : 'text-destructive'
                  )}>
                    {score}/100
                  </span>
                </div>
                <Progress
                  value={score}
                  className={cn('h-2',
                    score >= 80 ? '[&>div]:bg-success' : score >= 60 ? '[&>div]:bg-warning' : '[&>div]:bg-destructive'
                  )}
                />
              </div>

              {/* Detection signals grid */}
              <div className="bg-card rounded-xl border border-border p-3 space-y-0">
                <Signal label="Reachability"       value={qualResult.reachability_status ?? '—'}      yes={qualResult.reachability_status === 'reachable'} />
                <Signal label="Platform"           value={qualResult.platform ? `${qualResult.platform} (${qualResult.platform_confidence ?? '?'} confidence)` : 'Unknown'} yes={qualResult.platform !== 'unknown'} />
                <Signal label="Store type"         value={qualResult.store_type ?? '—'} />
                <Signal label="Sitemap found"      value={qualResult.sitemap_found ? `Yes — ${qualResult.sitemap_url?.replace(/^https?:\/\/[^/]+/, '') ?? 'sitemap.xml'}` : 'No'} yes={!!qualResult.sitemap_found} />
                <Signal label="Collections found"  value={qualResult.sample_collections?.length ? `Yes (${qualResult.sample_collections.slice(0,2).join(', ')})` : 'No'} yes={!!(qualResult.sample_collections?.length)} />
                <Signal label="Product pages"      value={qualResult.sample_product_url ? 'Yes' : 'No'} yes={!!qualResult.sample_product_url} />
                <Signal label="Pagination"         value={qualResult.pagination_detected ? 'Detected' : 'Not detected'} />
                <Signal label="Login required"     value={qualResult.login_required ? 'Yes' : 'No'} yes={qualResult.login_required ? false : true} />
                <Signal label="Anti-bot suspected" value={qualResult.antibot_suspected ? 'Yes — proceed with caution' : 'No'} yes={qualResult.antibot_suspected ? false : true} />
              </div>

              {/* Qualification notes */}
              {qualResult.qualification_notes && qualResult.qualification_notes.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Notes</p>
                  {qualResult.qualification_notes.map((note, i) => (
                    <p key={i} className="text-[11px] text-foreground flex items-start gap-1.5">
                      <span className="text-muted-foreground mt-0.5">•</span>{note}
                    </p>
                  ))}
                </div>
              )}

              {/* Capability disclaimer for low-score stores */}
              {score < 60 && (
                <Alert className="border-warning/30 bg-warning/5">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <AlertDescription className="text-[11px] text-muted-foreground">
                    <strong className="text-warning">Limited support expected.</strong> This platform is optimised for public Shopify and WooCommerce stores. Support is limited for login-required catalogues, heavy JavaScript-only storefronts, anti-bot protected sites, and marketplaces.
                  </AlertDescription>
                </Alert>
              )}

              {/* Sample product link */}
              {qualResult.sample_product_url && (
                <a
                  href={qualResult.sample_product_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[11px] text-primary hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  View sample product
                </a>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" onClick={() => { setQualResult(null); setPendingData(null); }}>
                  Back
                </Button>
                <Button
                  onClick={handleConfirmSave}
                  disabled={addStore.isPending}
                  variant={qualResult.recommended_action === 'not_recommended' ? 'outline' : 'default'}
                  className={cn(qualResult.recommended_action === 'not_recommended' && 'border-destructive/40 text-destructive hover:bg-destructive/5')}
                >
                  {addStore.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {qualResult.recommended_action === 'not_recommended' ? 'Add Anyway' : 'Confirm & Add'}
                </Button>
              </div>
            </div>
          </ScrollArea>
        )}

        {/* ── Step 3: Auth credentials ────────────────────────────────────────── */}
        {showAuthStep && (
          <div className="space-y-4 mt-2">
            <Alert className="border-warning/30 bg-warning/5">
              <Lock className="h-4 w-4 text-warning" />
              <AlertDescription className="text-warning">
                {authType === 'customer_account'
                  ? 'This store requires a customer account login to access products.'
                  : 'This store requires a password to access products.'}
              </AlertDescription>
            </Alert>

            {authType === 'customer_account' && (
              <Alert className="border-muted">
                <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                <AlertDescription className="text-xs text-muted-foreground">
                  ⚠️ This store requires a personal customer account. Your login credentials are used server-side only to fetch product data. Ensure you have authorisation from the store.
                </AlertDescription>
              </Alert>
            )}

            {authType === 'customer_account' && (
              <div className="space-y-1.5">
                <Label htmlFor="auth-email">Account email</Label>
                <Input id="auth-email" type="email" placeholder="you@example.com" value={authEmail} onChange={e => setAuthEmail(e.target.value)} />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="auth-password">{authType === 'customer_account' ? 'Account password' : 'Store password'}</Label>
              <Input id="auth-password" type="password" placeholder={authType === 'customer_account' ? 'Your account password' : 'Enter store password'} value={authPassword} onChange={e => setAuthPassword(e.target.value)} />
            </div>

            <p className="text-xs text-muted-foreground">
              🔒 Your credentials are stored securely and only used for server-side scrape requests.
            </p>

            {authResult && (
              <Alert variant={authResult.success ? 'default' : 'destructive'} className={authResult.success ? 'border-success/30 bg-success/5' : ''}>
                {authResult.success ? <CheckCircle className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4" />}
                <AlertDescription>{authResult.message}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => handleClose(false)}>Cancel</Button>
              <Button onClick={handleAuthSubmit} disabled={authStoreMutation.isPending || !authPassword || (authType === 'customer_account' && !authEmail)}>
                {authStoreMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save credentials & verify
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
