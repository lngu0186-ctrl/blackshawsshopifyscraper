import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, XCircle, Lock, ShieldAlert } from 'lucide-react';
import { AddStoreSchema, type AddStoreForm } from '@/types/schemas';
import { useAddStore, useValidateStore, useAuthStore } from '@/hooks/useStores';
import { normalizeUrl } from '@/lib/url';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ValidationResult = {
  valid: boolean;
  scrape_strategy?: string;
  validation_status?: string;
  requires_auth?: boolean;
  auth_type?: string;
  normalized_url?: string;
  myshopify_domain?: string;
  message?: string;
  error?: string;
};

export function AddStoreModal({ open, onOpenChange }: Props) {
  const { register, handleSubmit, formState: { errors }, reset, watch } = useForm<AddStoreForm>({
    resolver: zodResolver(AddStoreSchema),
  });
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [addedStoreId, setAddedStoreId] = useState<string | null>(null);
  const [authPassword, setAuthPassword] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authResult, setAuthResult] = useState<{ success: boolean; message: string } | null>(null);

  const validateStore = useValidateStore();
  const addStore = useAddStore();
  const authStoreMutation = useAuthStore();

  const needsAuth = validationResult?.requires_auth;
  const authType = validationResult?.auth_type;

  const onSubmit = async (data: AddStoreForm) => {
    setValidationResult(null);
    setAuthResult(null);
    setAddedStoreId(null);

    const result = await validateStore.mutateAsync(data.url).catch(e => ({
      valid: false, error: e.message, scrape_strategy: 'invalid', validation_status: 'invalid',
      requires_auth: false, normalized_url: '', message: e.message,
    })) as ValidationResult;

    if (!result.valid && !result.requires_auth) {
      setValidationResult({ valid: false, message: result.message || result.error || 'Validation failed.' });
      return;
    }

    setValidationResult(result);

    // If no auth required, add directly
    if (!result.requires_auth) {
      const added = await addStore.mutateAsync({
        name: data.name,
        url: data.url,
        normalizedUrl: result.normalized_url || normalizeUrl(data.url),
        validationStatus: result.validation_status || 'valid',
        myshopifyDomain: result.myshopify_domain,
        scrapeStrategy: result.scrape_strategy,
        requiresAuth: false,
        authType: 'none',
      });
      reset();
      setValidationResult(null);
      onOpenChange(false);
    } else {
      // Store needs auth — add the store first so we have an ID, then authenticate
      const added = await addStore.mutateAsync({
        name: data.name,
        url: data.url,
        normalizedUrl: result.normalized_url || normalizeUrl(data.url),
        validationStatus: result.validation_status || 'password_protected',
        myshopifyDomain: result.myshopify_domain,
        scrapeStrategy: result.scrape_strategy,
        requiresAuth: true,
        authType: result.auth_type || 'storefront_password',
      });
      setAddedStoreId((added as any).id);
    }
  };

  const handleAuthSubmit = async () => {
    if (!addedStoreId || !validationResult?.normalized_url) return;
    setAuthResult(null);

    const params: any = {
      store_id: addedStoreId,
      url: validationResult.normalized_url,
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
      setTimeout(() => {
        reset();
        setValidationResult(null);
        setAddedStoreId(null);
        setAuthPassword('');
        setAuthEmail('');
        setAuthResult(null);
        onOpenChange(false);
      }, 1500);
    }
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      reset();
      setValidationResult(null);
      setAddedStoreId(null);
      setAuthPassword('');
      setAuthEmail('');
      setAuthResult(null);
    }
    onOpenChange(v);
  };

  const isPasswordProtected = validationResult?.requires_auth;
  const isCustomerAccount = authType === 'customer_account';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Pharmacy Store</DialogTitle>
          <DialogDescription>Enter the store's public Shopify URL to validate and add it to your library.</DialogDescription>
        </DialogHeader>

        {!addedStoreId ? (
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

            {validationResult && (
              <Alert
                variant={validationResult.valid || validationResult.requires_auth ? 'default' : 'destructive'}
                className={validationResult.valid || validationResult.requires_auth ? 'border-primary/50 bg-primary/5' : ''}
              >
                {validationResult.valid
                  ? <CheckCircle className="h-4 w-4 text-primary" />
                  : validationResult.requires_auth
                    ? <Lock className="h-4 w-4 text-amber-500" />
                    : <XCircle className="h-4 w-4" />}
                <AlertDescription>{validationResult.message || (validationResult.valid ? 'Valid Shopify store detected.' : 'Validation failed.')}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={validateStore.isPending || addStore.isPending}>
                {(validateStore.isPending || addStore.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add Store
              </Button>
            </div>
          </form>
        ) : (
          /* Auth step */
          <div className="space-y-4 mt-2">
            <Alert className="border-amber-500/30 bg-amber-500/5">
              <Lock className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-amber-700 dark:text-amber-400">
                {isCustomerAccount
                  ? 'This store requires a customer account login to access products.'
                  : 'This store requires a password to access products.'}
              </AlertDescription>
            </Alert>

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
                <Label htmlFor="auth-email">Account email</Label>
                <Input
                  id="auth-email"
                  type="email"
                  placeholder="you@example.com"
                  value={authEmail}
                  onChange={e => setAuthEmail(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="auth-password">
                {isCustomerAccount ? 'Account password' : 'Store password'}
              </Label>
              <Input
                id="auth-password"
                type="password"
                placeholder={isCustomerAccount ? 'Your account password' : 'Enter store password'}
                value={authPassword}
                onChange={e => setAuthPassword(e.target.value)}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              🔒 Your credentials are stored securely and are only used to authenticate scrape requests server-side. They are never exposed to the browser after saving.
            </p>

            {authResult && (
              <Alert variant={authResult.success ? 'default' : 'destructive'} className={authResult.success ? 'border-green-500/30 bg-green-500/5' : ''}>
                {authResult.success
                  ? <CheckCircle className="h-4 w-4 text-green-500" />
                  : <XCircle className="h-4 w-4" />}
                <AlertDescription>{authResult.message}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => handleClose(false)}>Cancel</Button>
              <Button
                onClick={handleAuthSubmit}
                disabled={authStoreMutation.isPending || !authPassword || (isCustomerAccount && !authEmail)}
              >
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
