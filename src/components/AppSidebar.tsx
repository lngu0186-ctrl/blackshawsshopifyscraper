import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Store, TrendingDown, Download, Settings, Plus,
  Loader2, ChevronRight, ToggleLeft, ToggleRight, Trash2, Pill,
  ExternalLink, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useStores, useUpdateStore, useDeleteStore, useSeedStores } from '@/hooks/useStores';
import { formatPrice } from '@/lib/url';
import { AddStoreModal } from './AddStoreModal';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/products', icon: Store, label: 'All Products' },
  { to: '/price-changes', icon: TrendingDown, label: 'Price Changes' },
  { to: '/export', icon: Download, label: 'Export' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function AppSidebar() {
  const location = useLocation();
  const { data: stores, isLoading } = useStores();
  const updateStore = useUpdateStore();
  const deleteStore = useDeleteStore();
  const seedStores = useSeedStores();
  const [addOpen, setAddOpen] = useState(false);
  const [storesExpanded, setStoresExpanded] = useState(true);

  return (
    <div className="flex flex-col h-full w-64 bg-sidebar border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shadow-glow">
          <Pill className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold text-sidebar-accent-foreground leading-none">AU Pharmacy</p>
          <p className="text-xs text-sidebar-foreground leading-none mt-0.5">Scout</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="px-2 py-3 space-y-0.5">
        {navItems.map(({ to, icon: Icon, label, end }) => {
          const active = end ? location.pathname === to : location.pathname.startsWith(to);
          return (
            <NavLink key={to} to={to}>
              <div className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-all ${
                active
                  ? 'bg-primary/15 text-primary font-medium shadow-glow'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              }`}>
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </div>
            </NavLink>
          );
        })}
      </nav>

      <div className="px-2 py-2 border-t border-sidebar-border">
        <button
          onClick={() => setStoresExpanded(v => !v)}
          className="flex items-center justify-between w-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground hover:text-sidebar-accent-foreground transition-colors"
        >
          <span>Stores {stores?.length ? `(${stores.length})` : ''}</span>
          {storesExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {storesExpanded && (
        <ScrollArea className="flex-1 px-2">
          {isLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && (!stores || stores.length === 0) && (
            <p className="text-xs text-muted-foreground px-3 py-2">No stores yet</p>
          )}
          {stores?.map(store => (
            <div key={store.id} className="group flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-sidebar-accent transition-colors">
              <NavLink to={`/stores/${store.id}`} className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    store.validation_status === 'valid' ? 'bg-primary' : 'bg-destructive'
                  }`} />
                  <span className="text-xs text-sidebar-foreground truncate hover:text-sidebar-accent-foreground">
                    {store.name}
                  </span>
                </div>
                {store.total_products > 0 && (
                  <p className="text-[10px] text-muted-foreground ml-3">{store.total_products.toLocaleString()} products</p>
                )}
              </NavLink>
              <div className="hidden group-hover:flex items-center gap-0.5">
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
                  <TooltipContent>{store.enabled ? 'Disable' : 'Enable'}</TooltipContent>
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
                        This will permanently delete this store and all its products, variants, and price history.
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
        </ScrollArea>
      )}

      {/* Footer actions */}
      <div className="px-2 pb-3 pt-2 border-t border-sidebar-border space-y-1.5">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 text-xs border-dashed border-sidebar-border hover:border-primary/50 hover:text-primary hover:bg-primary/5"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="w-3.5 h-3.5" />
          Add Store
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => seedStores.mutate()}
          disabled={seedStores.isPending}
        >
          {seedStores.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Store className="w-3.5 h-3.5" />}
          Seed starter library
        </Button>
      </div>

      <AddStoreModal open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
