import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, XCircle, Lock, ShieldAlert, Trash2 } from 'lucide-react';
import { useAuthStore, useUpdateStore } from '@/hooks/useStores';
import type { Store } from '@/types/schemas';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  store: Store;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StoreCredentialsModal({ store, open, onOpenChange }: Props) {
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState(store.auth_email || '');
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const authStoreMutation = useAuthStore();
  const updateStore = useUpdateStore();

  const isCustomerAccount = store.auth_type === 'customer_account';
  const cookieExpiry = store.auth_cookie_expires_at ? new Date(store.auth_cookie_expires_at) : null;
  const isExpired = cookieExpiry ? cookieExpiry < new Date() : false;

  const authStatusLabel = () => {
    if (store.auth_status === 'authenticated' && !isExpired) return { label: 'Authenticated', color: 'text-green-500' };
    if (store.auth_status === 'authenticated' && isExpired) return { label: 'Session expired', color: 'text-amber-500' };
    if (store.auth_status === 'failed') return { label: 'Authentication failed', color: 'text-destructive' };
    return { label: 'Not authenticated', color: 'text-muted-foreground' };
  };

  const { label: statusLabel, color: statusColor } = authStatusLabel();

  const handleSubmit = async () => {
    setResult(null);
    const params: any = {
      store_id: store.id,
      url: store.normalized_url,
      auth_type: store.auth_type || 'storefront_password',
    };
    if (isCustomerAccount) {
      params.email = email;
      params.password = password;
    } else {
      params.password = password;
    }

    const res = await authStoreMutation.mutateAsync(params).catch(e => ({
      success: false, auth_status: 'failed', message: e.message,
    }));
    setResult({ success: res.success, message: res.message });
    if (res.success) setPassword('');
  };

  const handleClear = async () => {
    await updateStore.mutateAsync({
      id: store.id,
      auth_status: 'none',
      auth_cookie: null,
      auth_cookie_expires_at: null,
      storefront_password: null,
      auth_email: null,
      auth_password: null,
      requires_auth: true,
    } as any);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isCustomerAccount ? <ShieldAlert className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            Store Credentials
          </DialogTitle>
          <DialogDescription>
            Manage authentication for <strong>{store.name}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Status summary */}
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Auth status</span>
              <span className={`font-medium ${statusColor}`}>{statusLabel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Auth type</span>
              <span className="font-medium">{isCustomerAccount ? 'Customer account' : 'Storefront password'}</span>
            </div>
            {store.last_auth_attempt_at && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Last attempt</span>
                <span>{formatDistanceToNow(new Date(store.last_auth_attempt_at), { addSuffix: true })}</span>
              </div>
            )}
            {cookieExpiry && !isExpired && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Session expires</span>
                <span className="text-green-600">{formatDistanceToNow(cookieExpiry, { addSuffix: true })}</span>
              </div>
            )}
          </div>

          {isCustomerAccount && (
            <Alert className="border-muted">
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              <AlertDescription className="text-xs text-muted-foreground">
                ⚠️ This store requires a personal customer account. Your login credentials are used server-side only to fetch product data. Ensure you have authorisation from the store to access their catalogue this way. Scraping a store without permission may violate their terms of service.
              </AlertDescription>
            </Alert>
          )}

          {isCustomerAccount && (
            <div className="space-y-1.5">
              <Label htmlFor="cred-email">Account email</Label>
              <Input
                id="cred-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="cred-password">
              {isCustomerAccount ? 'Account password' : 'Store password'}
            </Label>
            <Input
              id="cred-password"
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            🔒 Your store password is stored securely and is only used to authenticate scrape requests server-side. It is never exposed to the browser after saving.
          </p>

          {result && (
            <Alert variant={result.success ? 'default' : 'destructive'} className={result.success ? 'border-green-500/30 bg-green-500/5' : ''}>
              {result.success
                ? <CheckCircle className="h-4 w-4 text-green-500" />
                : <XCircle className="h-4 w-4" />}
              <AlertDescription>{result.message}</AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
              onClick={handleClear}
              disabled={updateStore.isPending}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear credentials
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                onClick={handleSubmit}
                disabled={authStoreMutation.isPending || !password || (isCustomerAccount && !email)}
              >
                {authStoreMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Test & Save
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
