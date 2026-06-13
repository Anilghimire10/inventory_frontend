'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Minus, Trash2, ShoppingCart, X } from 'lucide-react';
import { CustomersApi, ProductsApi, SalesApi } from '@/api';
import type { Product } from '@/types';
import { PageHeader } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

interface CartLine {
  product: Product;
  quantity: number;
}

export default function PosPage() {
  const qc = useQueryClient();
  const { show } = useToast();
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [discount, setDiscount] = useState(0);
  const [prescriptionRef, setPrescriptionRef] = useState('');

  const { data: products } = useQuery({
    queryKey: ['pos-products', search],
    queryFn: () => ProductsApi.list({ search: search || undefined, limit: 50 }),
  });
  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: () => CustomersApi.list({ limit: 100 }),
  });

  const needsRx = cart.some((l) => l.product.isRxRequired);

  const { subtotal, tax, total } = useMemo(() => {
    let sub = 0, t = 0;
    for (const l of cart) {
      const net = Number(l.product.sellingPrice) * l.quantity;
      sub += net;
      t += (net * Number(l.product.taxRate)) / 100;
    }
    sub = Math.round(sub * 100) / 100;
    t = Math.round(t * 100) / 100;
    return { subtotal: sub, tax: t, total: Math.max(0, Math.round((sub + t - discount) * 100) / 100) };
  }, [cart, discount]);

  const checkout = useMutation({
    mutationFn: () =>
      SalesApi.create({
        customerId: customerId || undefined,
        paymentMethod,
        discount: discount || undefined,
        prescriptionRef: prescriptionRef || undefined,
        items: cart.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
      }),
    onSuccess: (sale) => {
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      show(`Sale ${sale.receiptNo} completed`);
      setCart([]);
      setDiscount(0);
      setCustomerId('');
      setPrescriptionRef('');
      setPaymentMethod('CASH');
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const add = (product: Product) =>
    setCart((c) => {
      const found = c.find((l) => l.product.id === product.id);
      if (found) return c.map((l) => (l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...c, { product, quantity: 1 }];
    });
  const setQty = (id: string, qty: number) =>
    setCart((c) =>
      qty <= 0 ? c.filter((l) => l.product.id !== id) : c.map((l) => (l.product.id === id ? { ...l, quantity: qty } : l)),
    );

  return (
    <div>
      <PageHeader title="Point of Sale" description="Ring up a sale." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Product picker */}
        <div className="lg:col-span-3">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search or scan barcode…" value={search}
              onChange={(e) => setSearch(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {products?.data.map((p) => (
              <button key={p.id} onClick={() => add(p)}
                className="rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent">
                <div className="flex items-start justify-between gap-1">
                  <span className="line-clamp-2 text-sm font-medium">{p.name}</span>
                  {p.isRxRequired && <Badge tone="destructive">Rx</Badge>}
                </div>
                <div className="mt-2 font-semibold text-primary">{formatMoney(p.sellingPrice)}</div>
                <div className="text-xs text-muted-foreground">{p.sku || p.unit}</div>
              </button>
            ))}
            {products && products.data.length === 0 && (
              <p className="col-span-full py-8 text-center text-sm text-muted-foreground">No products found.</p>
            )}
          </div>
        </div>

        {/* Cart */}
        <div className="lg:col-span-2">
          <Card className="sticky top-20 flex max-h-[calc(100vh-7rem)] flex-col">
            <div className="flex items-center gap-2 border-b border-border p-4">
              <ShoppingCart className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Cart</h2>
              <span className="ml-auto text-sm text-muted-foreground">{cart.length} items</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {cart.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Tap a product to add it to the cart.
                </p>
              ) : (
                <ul className="space-y-3">
                  {cart.map((l) => (
                    <li key={l.product.id} className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{l.product.name}</div>
                        <div className="text-xs text-muted-foreground">{formatMoney(l.product.sellingPrice)}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="outline" className="h-7 w-7"
                          onClick={() => setQty(l.product.id, l.quantity - 1)}><Minus className="h-3 w-3" /></Button>
                        <input className="h-7 w-10 rounded border border-input bg-background text-center text-sm"
                          value={l.quantity}
                          onChange={(e) => setQty(l.product.id, parseInt(e.target.value) || 0)} />
                        <Button size="icon" variant="outline" className="h-7 w-7"
                          onClick={() => setQty(l.product.id, l.quantity + 1)}><Plus className="h-3 w-3" /></Button>
                      </div>
                      <div className="w-20 text-right text-sm font-medium">
                        {formatMoney(Number(l.product.sellingPrice) * l.quantity)}
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setQty(l.product.id, 0)}>
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {cart.length > 0 && (
              <div className="space-y-3 border-t border-border p-4">
                {needsRx && (
                  <Field label="Prescription reference (required)">
                    <Input value={prescriptionRef} onChange={(e) => setPrescriptionRef(e.target.value)}
                      placeholder="Rx number" />
                  </Field>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Customer">
                    <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                      <option value="">Walk-in</option>
                      {customers?.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Payment">
                    <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                      <option value="CASH">Cash</option>
                      <option value="CARD">Card</option>
                      <option value="MOBILE">Mobile</option>
                      <option value="CREDIT">Credit (on account)</option>
                    </Select>
                  </Field>
                </div>
                <Field label="Discount">
                  <Input type="number" step="0.01" min="0" value={discount}
                    onChange={(e) => setDiscount(Number(e.target.value) || 0)} />
                </Field>

                <div className="space-y-1 text-sm">
                  <Row label="Subtotal" value={formatMoney(subtotal)} />
                  <Row label="Tax" value={formatMoney(tax)} />
                  {discount > 0 && <Row label="Discount" value={`- ${formatMoney(discount)}`} />}
                  <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                    <span>Total</span><span className="text-primary">{formatMoney(total)}</span>
                  </div>
                </div>

                <Button className="w-full" size="lg" loading={checkout.isPending}
                  disabled={paymentMethod === 'CREDIT' && !customerId}
                  onClick={() => checkout.mutate()}>
                  Complete sale · {formatMoney(total)}
                </Button>
                {paymentMethod === 'CREDIT' && !customerId && (
                  <p className="text-center text-xs text-destructive">Select a customer for credit sales.</p>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn('flex justify-between text-muted-foreground')}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}