import React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Store } from '@/types/schemas';

const STRATEGY_CONFIG: Record<string, { label: string; color: string; description: string }> = {
  products_json: {
    label: '✅ Open API',
    color: 'bg-green-500/10 text-green-700 border-green-500/30 dark:text-green-400',
    description: 'Standard Shopify products.json endpoint is accessible.',
  },
  collections_json: {
    label: '✅ Collections API',
    color: 'bg-green-500/10 text-green-700 border-green-500/30 dark:text-green-400',
    description: 'Products are accessible via the collections endpoint.',
  },
  sitemap_handles: {
    label: '⚠️ Slow (sitemap)',
    color: 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400',
    description: 'Products are fetched one at a time via sitemap. This is slower but works when the standard Shopify API is blocked.',
  },
  password_protected: {
    label: '🔒 Auth required',
    color: 'bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-400',
    description: 'Store requires authentication before products can be accessed.',
  },
  restricted: {
    label: '🚫 Restricted',
    color: 'bg-destructive/10 text-destructive border-destructive/30',
    description: 'This store appears to be Shopify but has blocked all public product endpoints. It cannot be scraped.',
  },
  invalid: {
    label: '✗ Not Shopify',
    color: 'bg-destructive/10 text-destructive border-destructive/30',
    description: 'This URL does not appear to be a Shopify store.',
  },
};

const AUTH_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  authenticated: {
    label: '🔒 Authenticated',
    color: 'bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-400',
  },
  failed: {
    label: '🔒 Auth failed',
    color: 'bg-destructive/10 text-destructive border-destructive/30',
  },
  expired: {
    label: '🔒 Session expired',
    color: 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400',
  },
  none: {
    label: '🔒 Needs password',
    color: 'bg-orange-500/10 text-orange-700 border-orange-500/30 dark:text-orange-400',
  },
};

interface Props {
  store: Store;
  className?: string;
}

export function StoreStrategyBadge({ store, className = '' }: Props) {
  const strategy = store.scrape_strategy || 'products_json';
  const requiresAuth = store.requires_auth;
  const authStatus = store.auth_status || 'none';
  const cookieExpiry = store.auth_cookie_expires_at ? new Date(store.auth_cookie_expires_at) : null;
  const isExpired = cookieExpiry ? cookieExpiry < new Date() : false;
  const effectiveAuthStatus = isExpired ? 'expired' : authStatus;

  // Determine which badge to show
  let config: { label: string; color: string; description?: string };
  if (requiresAuth) {
    const authConf = AUTH_STATUS_CONFIG[effectiveAuthStatus] || AUTH_STATUS_CONFIG['none'];
    let description = '';
    if (effectiveAuthStatus === 'authenticated') {
      const isCustomer = store.auth_type === 'customer_account';
      description = isCustomer
        ? 'Store requires a customer account login. Credentials are saved and scraping is enabled.'
        : 'Store is password-protected. Credentials are saved and scraping is enabled.';
    } else if (effectiveAuthStatus === 'failed') {
      description = 'Authentication failed. Update credentials to enable scraping.';
    } else if (effectiveAuthStatus === 'expired') {
      description = 'Session has expired. Re-authenticate to re-enable scraping.';
    } else {
      description = 'Store requires credentials. Click to add password or login.';
    }
    config = { ...authConf, description };
  } else {
    const stratConf = STRATEGY_CONFIG[strategy] || STRATEGY_CONFIG['invalid'];
    config = stratConf;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap cursor-help ${config.color} ${className}`}>
          {config.label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-48 text-xs">
        {(config as any).description}
      </TooltipContent>
    </Tooltip>
  );
}
