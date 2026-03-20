import { useState } from 'react';
import { NavLink as RouterNavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Database, Briefcase, Package, Download,
  Activity, Settings, Plus, Loader2, ToggleLeft, ToggleRight,
  Trash2, Pill, ChevronDown, ChevronUp, LogOut, Lock, ShieldAlert,
  Store,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useStores, useUpdateStore, useDeleteStore, useSeedStores } from '@/hooks/useStores';
import { useAuth } from '@/hooks/useAuth';
import { AddStoreModal } from './AddStoreModal';
import { StoreCredentialsModal } from './StoreCredentialsModal';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { Store as StoreType } from '@/types/schemas';

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
      <div className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
      }`}>
        <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-sidebar-primary' : ''}`} />
        <span>{label}</span>
        {active && (
          <div className="ml-auto w-1.5 h-1.5 rounded-full bg-sidebar-primary" />
        )}
      </div>
    </RouterNavLink>
  );
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

  const getAuthBadgeColor = (store: StoreType) => {
    if (!store.requires_auth) return '';
    const cookieExpiry = store.auth_cookie_expires_at ? new Date(store.auth_cookie_expires_at) : null;
    const isExpired = cookieExpiry ? cookieExpiry < new Date() : false;
    if (store.auth_status === 'authenticated' && !isExpired) return 'text-success';
    if (isExpired || store.auth_status === 'failed') return 'text-destructive';
    return 'text-sidebar-muted';
  };

  const userInitials = user?.email?.slice(0, 2).toUpperCase() ?? 'AU';

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

      {/* ── Store Library ─────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-3 pt-2 border-t border-sidebar-border">
        <button
          onClick={() => setStoresExpanded(v => !v)}
          className="flex items-center justify-between w-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-colors rounded-md hover:bg-sidebar-accent/40"
          style={{ color: 'hsl(var(--sidebar-muted))' }}
        >
          <div className="flex items-center gap-1.5">
            <Store className="w-3 h-3" />
            <span>Stores {stores?.length ? `(${stores.length})` : ''}</span>
          </div>
          {storesExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
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
            {stores?.map(store => (
              <div key={store.id} className="group flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-sidebar-accent/60 transition-colors">
                <RouterNavLink to={`/stores/${store.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      store.enabled
                        ? (store.validation_status === 'valid' || store.validation_status === 'restricted')
                          ? 'bg-success'
                          : 'bg-destructive'
                        : 'bg-sidebar-muted opacity-40'
                    }`} />
                    <span
                      className="text-[12px] truncate leading-none"
                      style={{ color: 'hsl(var(--sidebar-foreground))' }}
                    >
                      {store.name}
                    </span>
                    {store.requires_auth && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={e => { e.preventDefault(); e.stopPropagation(); setCredStore(store); }}
                            className={`shrink-0 ${getAuthBadgeColor(store)}`}
                          >
                            {store.auth_type === 'customer_account'
                              ? <ShieldAlert className="w-3 h-3" />
                              : <Lock className="w-3 h-3" />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="text-xs">
                          {store.auth_status === 'authenticated' ? 'Authenticated — click to update' : 'Needs credentials — click to add'}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  {store.total_products > 0 && (
                    <p className="text-[10px] ml-3.5 mt-0.5 text-sidebar-muted">
                      {store.total_products.toLocaleString()} products
                    </p>
                  )}
                </RouterNavLink>

                {/* Hover actions */}
                <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => updateStore.mutate({ id: store.id, enabled: !store.enabled })}
                        className="p-0.5 transition-colors text-sidebar-muted hover:text-sidebar-accent-foreground"
                      >
                        {store.enabled
                          ? <ToggleRight className="w-3.5 h-3.5" style={{ color: 'hsl(252 82% 65%)' }} />
                          : <ToggleLeft className="w-3.5 h-3.5" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">{store.enabled ? 'Disable' : 'Enable'}</TooltipContent>
                  </Tooltip>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button className="p-0.5 text-sidebar-muted hover:text-destructive transition-colors">
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
              </div>
            ))}
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
