import { useState } from 'react';
import { NavLink as RouterNavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Database, Package, Download,
  Activity, Settings, Plus, Loader2, ToggleLeft, ToggleRight,
  Trash2, Pill, ChevronDown, ChevronUp, LogOut, Lock, ShieldAlert,
  Store, Stethoscope, CheckCheck, XCircle, AlertTriangle, Filter, SearchCode,
  ShoppingCart, GitMerge, TrendingUp,
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
      { to: '/stores', icon: Store, label: 'Stores', end: false },
      { to: '/products', icon: Package, label: 'Products', end: false },
      { to: '/price-changes', icon: TrendingUp, label: 'Price Changes', end: false },
    ],
  },
  {
    label: 'Data Ops',
    items: [
      { to: '/export', icon: Download, label: 'Exports', end: false },
      { to: '/diagnostics', icon: Stethoscope, label: 'Diagnostics', end: false },
      { to: '/scraping-audit', icon: SearchCode, label: 'Scraping Audit', end: false },
      { to: '/canonical-review', icon: GitMerge, label: 'Canonical Review', end: false },
      { to: '/cw-import', icon: ShoppingCart, label: 'CW Import', end: false },
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
        'flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12.5px] font-medium transition-all duration-150',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
      )}>
        <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', active ? 'text-sidebar-primary' : 'opacity-70')} />
        <span>{label}</span>
        {active && <div className="ml-auto w-1 h-1 rounded-full bg-sidebar-primary opacity-80" />}
      </div>
    </RouterNavLink>
  );
}

type StoreFilter = 'all' | 'enabled' | 'disabled' | 'healthy' | 'warning' | 'failed';

function storeHealthDot(store: StoreType) {
  if (!store.enabled) return 'bg-sidebar-muted/40';
  const h = (store as any).health_status;
  if (h === 'healthy') return 'bg-success';
  if (h === 'warning') return 'bg-warning';
  if (h === 'failed') return 'bg-destructive';
  if (store.validation_status === 'valid' || store.validation_status === 'restricted') return 'bg-success';
  if (store.validation_status === 'invalid') return 'bg-destructive';
  return 'bg-sidebar-muted/50';
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
  const enabledCount = (stores ?? []).filter(s => s.enabled).length;

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
      className="flex flex-col h-full w-[216px] shrink-0"
      style={{ background: 'hsl(var(--sidebar-background))' }}
    >
      {/* ── Logo ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b" style={{ borderColor: 'hsl(var(--sidebar-border))' }}>
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'hsl(220 80% 66% / 0.15)' }}
        >
          <Pill className="w-3.5 h-3.5" style={{ color: 'hsl(220 80% 70%)' }} />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-bold leading-none" style={{ color: 'hsl(var(--sidebar-accent-foreground))' }}>
            Pharmacy Scout
          </p>
          <p className="text-[10px] mt-0.5 truncate" style={{ color: 'hsl(var(--sidebar-muted))' }}>
            AU Data Platform
          </p>
        </div>
      </div>

      {/* ── Navigation ───────────────────────────────────────────── */}
      <nav className="px-2.5 py-3 space-y-4 flex-shrink-0">
        {NAV_SECTIONS.map(section => (
          <div key={section.label}>
            <p className="text-[9.5px] font-semibold uppercase tracking-widest px-3 mb-1.5" style={{ color: 'hsl(var(--sidebar-muted))' }}>
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
      <div className="flex-shrink-0 px-2.5 pt-1 border-t" style={{ borderColor: 'hsl(var(--sidebar-border))' }}>
        <div className="flex items-center justify-between px-3 py-2">
          <button
            onClick={() => setStoresExpanded(v => !v)}
            className="flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-widest transition-colors hover:text-sidebar-accent-foreground"
            style={{ color: 'hsl(var(--sidebar-muted))' }}
          >
            <Store className="w-3 h-3" />
            <span>Stores {stores?.length ? `(${enabledCount}/${stores.length})` : ''}</span>
            {storesExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-1 rounded-lg transition-colors"
                style={{ color: 'hsl(var(--sidebar-muted))' }}
              >
                <Filter className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-[12px]">
              <DropdownMenuItem onClick={() => setStoreFilter('all')} className={storeFilter === 'all' ? 'bg-accent/50' : ''}>All stores</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStoreFilter('enabled')} className={storeFilter === 'enabled' ? 'bg-accent/50' : ''}>
                <div className="w-1.5 h-1.5 rounded-full bg-success mr-2" /> Enabled only
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStoreFilter('disabled')} className={storeFilter === 'disabled' ? 'bg-accent/50' : ''}>
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 mr-2" /> Disabled only
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStoreFilter('failed')} className={storeFilter === 'failed' ? 'bg-accent/50' : ''}>
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
        <ScrollArea className="flex-1 px-2.5 pb-1">
          {isLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'hsl(var(--sidebar-muted))' }} />
            </div>
          )}
          {!isLoading && (!stores || stores.length === 0) && (
            <p className="text-[11px] px-3 py-2" style={{ color: 'hsl(var(--sidebar-muted))' }}>No stores yet.</p>
          )}
          <div className="space-y-0.5 py-1">
            {filteredStores.map(store => (
              <div key={store.id} className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-colors" style={{ ':hover': { background: 'hsl(var(--sidebar-accent))' } }}
                onMouseEnter={e => (e.currentTarget.style.background = 'hsl(var(--sidebar-accent)/50%)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                <div className={cn('w-1.5 h-1.5 rounded-full shrink-0 mt-0.5', storeHealthDot(store))} />
                <RouterNavLink to={`/stores/${store.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 min-w-0">
                    <span
                      className={cn('text-[11.5px] truncate leading-none', !store.enabled && 'opacity-40')}
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
                    <p className="text-[10px] mt-0.5" style={{ color: 'hsl(var(--sidebar-muted))' }}>
                      {store.total_products.toLocaleString()} products
                    </p>
                  )}
                </RouterNavLink>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="shrink-0">
                      <Switch
                        checked={store.enabled}
                        onCheckedChange={(checked) => updateStore.mutate({ id: store.id, enabled: checked })}
                        className="scale-[0.7] data-[state=checked]:bg-sidebar-primary"
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    {store.enabled ? 'Enabled' : 'Disabled'}
                  </TooltipContent>
                </Tooltip>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" style={{ color: 'hsl(var(--sidebar-muted))' }}>
                      <Trash2 className="w-3 h-3" />
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
              <p className="text-[11px] px-3 py-2" style={{ color: 'hsl(var(--sidebar-muted))' }}>No stores match filter.</p>
            )}
          </div>
          <div className="h-2" />
        </ScrollArea>
      )}

      {/* ── Footer ───────────────────────────────────────────────── */}
      <div className="px-2.5 py-3 border-t flex-shrink-0 space-y-1" style={{ borderColor: 'hsl(var(--sidebar-border))' }}>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-[12px] font-medium h-8 hover:bg-sidebar-accent"
          style={{ color: 'hsl(var(--sidebar-foreground))' }}
          onClick={() => setAddOpen(true)}
        >
          <Plus className="w-3.5 h-3.5" /> Add Store
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-[12px] h-8 hover:bg-sidebar-accent/60"
          style={{ color: 'hsl(var(--sidebar-muted))' }}
          onClick={() => seedStores.mutate()}
          disabled={seedStores.isPending}
        >
          {seedStores.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
          Seed starter library
        </Button>

        <div className="flex items-center gap-2 px-1 pt-2 border-t mt-1" style={{ borderColor: 'hsl(var(--sidebar-border))' }}>
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
            style={{ background: 'hsl(220 80% 66% / 0.18)', color: 'hsl(220 80% 72%)' }}
          >
            {userInitials}
          </div>
          <p className="text-[11px] truncate flex-1" style={{ color: 'hsl(var(--sidebar-muted))' }}>{user?.email}</p>
          <button
            onClick={signOut}
            className="p-1 rounded-lg transition-colors hover:text-destructive"
            style={{ color: 'hsl(var(--sidebar-muted))' }}
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
