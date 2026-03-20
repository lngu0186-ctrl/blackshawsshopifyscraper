import { useProductVariants } from '@/hooks/useProducts';
import { useVariantPriceHistory } from '@/hooks/usePriceHistory';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { formatPrice } from '@/lib/url';

interface Props { product: any }

function VariantChart({ variantId, variantTitle }: { variantId: string; variantTitle: string }) {
  const { data: history } = useVariantPriceHistory(variantId);
  if (!history || history.length < 2) return <p className="text-xs text-muted-foreground italic">No price changes detected yet</p>;
  const chartData = history.map((h: any) => ({
    date: new Date(h.recorded_at).toLocaleDateString(),
    price: h.price,
    compareAt: h.compare_at_price,
  }));
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1">{variantTitle}</p>
      <ResponsiveContainer width="100%" height={80}>
        <LineChart data={chartData}>
          <XAxis dataKey="date" tick={{ fontSize: 9 }} hide />
          <YAxis tick={{ fontSize: 9 }} width={40} tickFormatter={v => `$${v}`} />
          <Tooltip formatter={(v: any) => formatPrice(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 11 }} />
          <Line type="monotone" dataKey="price" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} />
          <Line type="monotone" dataKey="compareAt" stroke="hsl(var(--muted-foreground))" strokeWidth={1} strokeDasharray="3 3" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProductRowExpanded({ product }: Props) {
  const { data: variants } = useProductVariants(product.id);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Variants table */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Variants</p>
        <div className="rounded border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/30 border-b border-border">
                <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Title</th>
                <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">SKU</th>
                <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Price</th>
                <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Compare</th>
              </tr>
            </thead>
            <tbody>
              {variants?.map((v: any) => (
                <tr key={v.id} className="border-b border-border/40">
                  <td className="px-2 py-1.5 text-foreground">{v.variant_title}</td>
                  <td className="px-2 py-1.5 text-muted-foreground font-mono">{v.sku || '—'}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{formatPrice(v.price)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">{v.compare_at_price ? formatPrice(v.compare_at_price) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Images + Charts */}
      <div className="space-y-4">
        {product.images?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Images</p>
            <div className="flex gap-2 flex-wrap">
              {product.images.slice(0, 5).map((img: any, i: number) => (
                <img key={i} src={img.src} alt={img.alt || product.title} className="w-16 h-16 rounded object-cover border border-border" />
              ))}
            </div>
          </div>
        )}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Price History</p>
          <div className="space-y-3">
            {variants?.slice(0, 3).map((v: any) => (
              <VariantChart key={v.id} variantId={v.id} variantTitle={v.variant_title || 'Default'} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
