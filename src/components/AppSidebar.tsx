import { useState } from 'react';
import { NavLink as RouterNavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Database, Package, Download,
  Activity, Settings, Plus, Loader2, ToggleLeft, ToggleRight,
  Trash2, Pill, ChevronDown, ChevronUp, LogOut, Lock, ShieldAlert,
  Store, Stethoscope, CheckCheck, XCircle, AlertTriangle, Filter, SearchCode,
  ShoppingCart,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useStores, useUpdateStore, useDeleteStore, useSeedStores } from '@/hooks/useStores';
import { useAuth } from '@/hooks/useAuth';
import { AddStoreModal } from './AddStoreModal';
import { StoreCredentialsModal } from './StoreCredentialsModal';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import type { Store as StoreType } from '@/types/schemas';
import { toast } from 'sonner';

const NAV_SECTIONS = [
  {
    label: 'Overview',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
      { to: '/products', icon: Package, label: 'Products', end: false },
      { to: '/price-changes', icon: Activity, label: 'Price Changes', end: false },
    ],
  },
  {
    label: 'Data Ops',
    items: [
      { to: '/export', icon: Download, label: 'Exports', end: false },
      { to: '/diagnostics', icon: Stethoscope, label: 'Diagnostics', end: false },
      { to: '/scraping-audit', icon: SearchCode, label: 'Scraping Audit', end: false },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/settings', icon: Settings, label: 'Settings', end: false },
    ],
  },
];

function NavItem({ to, icon: Icon, label, end }: { to: string; icon: any; label: string; end: boolean }) {
  const location = useLocation();
  const active = end ? location.pathname === to : location.pathname.startsWith(to);

  return (
    <RouterNavLink to={to}>
      <div className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
      )}>
        <Icon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-sidebar-primary' : '')} />
        <span>{label}</span>
        {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-sidebar-primary" />}
      </div>
    </RouterNavLink>
  );
}

type StoreFilter = 'all' | 'enabled' | 'disabled' | 'healthy' | 'warning' | 'failed';

function storeHealthDot(store: StoreType) {
  if (!store.enabled) return 'bg-muted-foreground/30';
  const h = (store as any).health_status;
  if (h === 'healthy') return 'bg-success';
  if (h === 'warning') return 'bg-warning';
  if (h === 'failed') return 'bg-destructive';
  if (store.validation_status === 'valid' || store.validation_status === 'restricted') return 'bg-success';
  if (store.validation_status === 'invalid') return 'bg-destructive';
  return 'bg-muted-foreground/50';
}

export function AppSidebar() {
  const { data: stores, isLoading } = useStores();
  const updateStore = useUpdateStore();
  const deleteStore = useDeleteStore();
  const seedStores = useSeedStores();
  const { user, signOut } = useAuth();
  const [addOpen, setAddOpen] = useState(false);
  const [storesExpanded, setStoresExpanded] = useState(true);
  const [credStore, setCredStore] = useState<StoreType | null>(null);
  const [storeFilter, setStoreFilter] = useState<StoreFilter>('all');

  const getAuthBadgeColor = (store: StoreType) => {
    if (!store.requires_auth) return '';
    const cookieExpiry = store.auth_cookie_expires_at ? new Date(store.auth_cookie_expires_at) : null;
    const isExpired = cookieExpiry ? cookieExpiry < new Date() : false;
    if (store.auth_status === 'authenticated' && !isExpired) return 'text-success';
    if (isExpired || store.auth_status === 'failed') return 'text-destructive';
    return 'text-sidebar-muted';
  };

  const userInitials = user?.email?.slice(0, 2).toUpperCase() ?? 'AU';

  const filteredStores = (stores ?? []).filter(s => {
    if (storeFilter === 'all') return true;
    if (storeFilter === 'enabled') return s.enabled;
    if (storeFilter === 'disabled') return !s.enabled;
    const h = (s as any).health_status;
    if (storeFilter === 'healthy') return h === 'healthy' || (!h && s.validation_status === 'valid');
    if (storeFilter === 'warning') return h === 'warning';
    if (storeFilter === 'failed') return h === 'failed' || s.validation_status === 'invalid';
    return true;
  });

  const enabledCount = (stores ?? []).filter(s => s.enabled).length;

  async function enableAll() {
    if (!stores) return;
    await Promise.all(stores.map(s => updateStore.mutateAsync({ id: s.id, enabled: true })));
    toast.success(`Enabled ${stores.length} stores`);
  }

  async function disableAll() {
    if (!stores) return;
    await Promise.all(stores.map(s => updateStore.mutateAsync({ id: s.id, enabled: false })));
    toast.success(`Disabled ${stores.length} stores`);
  }

  return (
    <div
      className="flex flex-col h-full w-[220px] shrink-0"
      style={{ background: 'hsl(var(--sidebar-background))' }}
    >
      {/* ── Logo ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-sidebar-border">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'hsl(252 82% 65% / 0.18)' }}
        >
          <Pill className="w-4 h-4" style={{ color: 'hsl(252 82% 70%)' }} />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-bold leading-none" style={{ color: 'hsl(var(--sidebar-accent-foreground))' }}>
            Pharmacy Scout
          </p>
          <p className="text-[10px] mt-0.5 truncate text-sidebar-muted">AU Data Platform</p>
        </div>
      </div>

      {/* ── Navigation ───────────────────────────────────────────── */}
      <nav className="px-3 py-3 space-y-4 flex-shrink-0">
        {NAV_SECTIONS.map(section => (
          <div key={section.label}>
            <p className="text-[10px] font-semibold uppercase tracking-widest px-3 mb-1 text-sidebar-muted">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map(item => (
                <NavItem key={item.to} {...item} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Store Library header ──────────────────────────────────── */}
      <div className="flex-shrink-0 px-3 pt-2 border-t border-sidebar-border">
        <div className="flex items-center justify-between px-3 py-1.5">
          <button
            onClick={() => setStoresExpanded(v => !v)}
            className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest transition-colors hover:text-sidebar-accent-foreground"
            style={{ color: 'hsl(var(--sidebar-muted))' }}
          >
            <Store className="w-3 h-3" />
            <span>Stores {stores?.length ? `(${enabledCount}/${stores.length})` : ''}</span>
            {storesExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {/* Bulk actions dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-0.5 rounded hover:bg-sidebar-accent/40 transition-colors"
                style={{ color: 'hsl(var(--sidebar-muted))' }}
              >
                <Filter className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-[12px]">
              <DropdownMenuItem onClick={() => setStoreFilter('all')} className={storeFilter === 'all' ? 'bg-accent' : ''}>
                All stores
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStoreFilter('enabled')} className={storeFilter === 'enabled' ? 'bg-accent' : ''}>
                <div className="w-1.5 h-1.5 rounded-full bg-success mr-2" /> Enabled only
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStoreFilter('disabled')} className={storeFilter === 'disabled' ? 'bg-accent' : ''}>
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 mr-2" /> Disabled only
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStoreFilter('failed')} className={storeFilter === 'failed' ? 'bg-accent' : ''}>
                <div className="w-1.5 h-1.5 rounded-full bg-destructive mr-2" /> Failed
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={enableAll} className="text-success">
                <CheckCheck className="w-3.5 h-3.5 mr-2" /> Enable All
              </DropdownMenuItem>
              <DropdownMenuItem onClick={disableAll} className="text-muted-foreground">
                <XCircle className="w-3.5 h-3.5 mr-2" /> Disable All
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {storesExpanded && (
        <ScrollArea className="flex-1 px-3 pb-1">
          {isLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'hsl(var(--sidebar-muted))' }} />
            </div>
          )}
          {!isLoading && (!stores || stores.length === 0) && (
            <p className="text-[11px] px-3 py-2 text-sidebar-muted">No stores yet.</p>
          )}
          <div className="space-y-0.5 py-1">
            {filteredStores.map(store => (
              <div key={store.id} className="group flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-sidebar-accent/60 transition-colors">
                {/* Health dot */}
                <div className={cn('w-1.5 h-1.5 rounded-full shrink-0 mt-0.5', storeHealthDot(store))} />

                {/* Store info link */}
                <RouterNavLink to={`/stores/${store.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={cn('text-[12px] truncate leading-none', !store.enabled && 'opacity-50')}
                      style={{ color: 'hsl(var(--sidebar-foreground))' }}
                    >
                      {store.name}
                    </span>
                    {store.requires_auth && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={e => { e.preventDefault(); e.stopPropagation(); setCredStore(store); }}
                            className={cn('shrink-0', getAuthBadgeColor(store))}
                          >
                            {store.auth_type === 'customer_account'
                              ? <ShieldAlert className="w-3 h-3" />
                              : <Lock className="w-3 h-3" />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="text-xs">
                          {store.auth_status === 'authenticated' ? 'Authenticated' : 'Needs credentials'}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  {store.total_products > 0 && (
                    <p className="text-[10px] ml-0 mt-0.5 text-sidebar-muted">
                      {store.total_products.toLocaleString()} products
                    </p>
                  )}
                </RouterNavLink>

                {/* Enable/disable toggle — always visible */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="shrink-0">
                      <Switch
                        checked={store.enabled}
                        onCheckedChange={(checked) => updateStore.mutate({ id: store.id, enabled: checked })}
                        className="scale-75 data-[state=checked]:bg-sidebar-primary"
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    {store.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
                  </TooltipContent>
                </Tooltip>

                {/* Delete — hover only */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="p-0.5 text-sidebar-muted hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {store.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently deletes this store and all its products, variants, and price history.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteStore.mutate(store.id)} className="bg-destructive hover:bg-destructive/90">
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
            {filteredStores.length === 0 && !isLoading && (
              <p className="text-[11px] px-3 py-2 text-sidebar-muted">No stores match filter.</p>
            )}
          </div>
          <div className="h-2" />
        </ScrollArea>
      )}

      {/* ── Footer actions ────────────────────────────────────────── */}
      <div className="px-3 py-3 border-t border-sidebar-border space-y-1 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-[12px] font-medium h-8 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="w-3.5 h-3.5" /> Add Store
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-[12px] h-8 text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
          onClick={() => seedStores.mutate()}
          disabled={seedStores.isPending}
        >
          {seedStores.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
          Seed starter library
        </Button>

        {/* User row */}
        <div className="flex items-center gap-2 px-1 pt-2 border-t border-sidebar-border mt-1">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
            style={{ background: 'hsl(252 82% 65% / 0.2)', color: 'hsl(252 82% 70%)' }}
          >
            {userInitials}
          </div>
          <p className="text-[11px] text-sidebar-muted truncate flex-1">{user?.email}</p>
          <button
            onClick={signOut}
            className="p-1 rounded text-sidebar-muted hover:text-destructive transition-colors"
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <AddStoreModal open={addOpen} onOpenChange={setAddOpen} />
      {credStore && (
        <StoreCredentialsModal
          store={credStore}
          open={!!credStore}
          onOpenChange={v => { if (!v) setCredStore(null); }}
        />
      )}
    </div>
  );
}
