import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { AddStoreSchema, type AddStoreForm } from '@/types/schemas';
import { useAddStore, useValidateStore } from '@/hooks/useStores';
import { normalizeUrl } from '@/lib/url';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddStoreModal({ open, onOpenChange }: Props) {
  const { register, handleSubmit, formState: { errors }, reset } = useForm<AddStoreForm>({
    resolver: zodResolver(AddStoreSchema),
  });
  const [validationResult, setValidationResult] = useState<{ valid: boolean; message?: string } | null>(null);
  const validateStore = useValidateStore();
  const addStore = useAddStore();

  const onSubmit = async (data: AddStoreForm) => {
    setValidationResult(null);
    const result = await validateStore.mutateAsync(data.url).catch(e => ({ valid: false, error: e.message }));

    if (!result.valid) {
      const msg = (result as any).error || 'This URL does not appear to expose a public Shopify products.json endpoint.';
      setValidationResult({ valid: false, message: msg });
      return;
    }

    setValidationResult({ valid: true });
    const validResult = result as { valid: boolean; normalized_url: string; myshopify_domain?: string };

    await addStore.mutateAsync({
      name: data.name,
      url: data.url,
      normalizedUrl: validResult.normalized_url || normalizeUrl(data.url),
      validationStatus: 'valid',
      myshopifyDomain: validResult.myshopify_domain,
    });

    reset();
    setValidationResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); setValidationResult(null); } onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Pharmacy Store</DialogTitle>
          <DialogDescription>Enter the store's public Shopify URL to validate and add it to your library.</DialogDescription>
        </DialogHeader>
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
            <Alert variant={validationResult.valid ? 'default' : 'destructive'} className={validationResult.valid ? 'border-primary/50 bg-primary/5' : ''}>
              {validationResult.valid
                ? <CheckCircle className="h-4 w-4 text-primary" />
                : <XCircle className="h-4 w-4" />}
              <AlertDescription>{validationResult.valid ? 'Valid Shopify products.json endpoint detected' : validationResult.message}</AlertDescription>
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
      </DialogContent>
    </Dialog>
  );
}
