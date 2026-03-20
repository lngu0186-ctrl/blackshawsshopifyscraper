import { useState } from 'react';
import { NavLink as RouterNavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Store, TrendingDown, Download, Settings, Plus,
  Loader2, ToggleLeft, ToggleRight, Trash2, Pill,
  ChevronDown, ChevronUp, LogOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useStores, useUpdateStore, useDeleteStore, useSeedStores } from '@/hooks/useStores';
import { useAuth } from '@/hooks/useAuth';
import { AddStoreModal } from './AddStoreModal';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/products', icon: Store, label: 'All Products', end: false },
  { to: '/price-changes', icon: TrendingDown, label: 'Price Changes', end: false },
  { to: '/export', icon: Download, label: 'Export', end: false },
  { to: '/settings', icon: Settings, label: 'Settings', end: false },
];

export function AppSidebar() {
  const location = useLocation();
  const { data: stores, isLoading } = useStores();
  const updateStore = useUpdateStore();
  const deleteStore = useDeleteStore();
  const seedStores = useSeedStores();
  const { user, signOut } = useAuth();
  const [addOpen, setAddOpen] = useState(false);
  const [storesExpanded, setStoresExpanded] = useState(true);

  return (
    <div className="flex flex-col h-full w-60 bg-sidebar border-r border-sidebar-border shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-sidebar-border">
        <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center shadow-glow shrink-0">
          <Pill className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-foreground leading-none tracking-wide">AU Pharmacy Scout</p>
          <p className="text-[10px] text-muted-foreground leading-none mt-0.5 truncate">{user?.email}</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="px-2 py-2.5 space-y-px">
        {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => {
          const active = end ? location.pathname === to : location.pathname.startsWith(to);
          return (
            <RouterNavLink key={to} to={to}>
              <div className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-xs transition-all ${
                active
                  ? 'bg-primary/15 text-primary font-semibold shadow-glow'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              }`}>
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                {label}
              </div>
            </RouterNavLink>
          );
        })}
      </nav>

      {/* Stores section */}
      <div className="px-3 pt-2 pb-1 border-t border-sidebar-border mt-1">
        <button
          onClick={() => setStoresExpanded(v => !v)}
          className="flex items-center justify-between w-full text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors py-1"
        >
          <span>Stores{stores?.length ? ` (${stores.length})` : ''}</span>
          {storesExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {storesExpanded && (
        <ScrollArea className="flex-1 px-2">
          {isLoading && (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && (!stores || stores.length === 0) && (
            <p className="text-[11px] text-muted-foreground px-3 py-2">No stores yet — seed or add one.</p>
          )}
          {stores?.map(store => (
            <div key={store.id} className="group flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-sidebar-accent transition-colors">
              <RouterNavLink to={`/stores/${store.id}`} className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    store.enabled
                      ? store.validation_status === 'valid' ? 'bg-primary' : 'bg-destructive'
                      : 'bg-muted-foreground/40'
                  }`} />
                  <span className="text-[11px] text-sidebar-foreground truncate hover:text-sidebar-accent-foreground transition-colors">
                    {store.name}
                  </span>
                </div>
                {store.total_products > 0 && (
                  <p className="text-[10px] text-muted-foreground ml-3">{store.total_products.toLocaleString()}</p>
                )}
              </RouterNavLink>

              {/* Actions (show on hover) */}
              <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => updateStore.mutate({ id: store.id, enabled: !store.enabled })}
                      className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {store.enabled
                        ? <ToggleRight className="w-3.5 h-3.5 text-primary" />
                        : <ToggleLeft className="w-3.5 h-3.5" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">{store.enabled ? 'Disable' : 'Enable'}</TooltipContent>
                </Tooltip>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="p-0.5 text-muted-foreground hover:text-destructive transition-colors">
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
                      <AlertDialogAction
                        onClick={() => deleteStore.mutate(store.id)}
                        className="bg-destructive hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
          <div className="h-2" />
        </ScrollArea>
      )}

      {/* Footer */}
      <div className="px-2 pb-3 pt-2 border-t border-sidebar-border space-y-1">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 text-xs border-dashed border-sidebar-border hover:border-primary/50 hover:text-primary hover:bg-primary/5 h-7"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="w-3 h-3" /> Add Store
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-xs text-muted-foreground hover:text-foreground h-7"
          onClick={() => seedStores.mutate()}
          disabled={seedStores.isPending}
        >
          {seedStores.isPending
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <Store className="w-3 h-3" />}
          Seed starter library
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-xs text-muted-foreground hover:text-foreground h-7"
          onClick={signOut}
        >
          <LogOut className="w-3 h-3" /> Sign Out
        </Button>
      </div>

      <AddStoreModal open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
