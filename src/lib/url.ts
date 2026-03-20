export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeUrl(url: string): string {
  let u = url.trim().toLowerCase();
  if (!u.startsWith('http://') && !u.startsWith('https://')) {
    u = 'https://' + u;
  }
  return u.replace(/\/+$/, '');
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function formatPrice(price: number | null | undefined): string {
  if (price == null) return '';
  return `$${Number(price).toFixed(2)}`;
}

export function formatPriceRange(min: number | null, max: number | null): string {
  if (min == null && max == null) return '';
  if (min === max || max == null) return formatPrice(min);
  return `${formatPrice(min)} – ${formatPrice(max)}`;
}
