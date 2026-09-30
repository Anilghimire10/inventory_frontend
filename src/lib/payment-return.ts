/** Khalti return statuses that mean the owner won't be paying this time. */
const KHALTI_GAVE_UP = ['User canceled', 'Expired'];

/**
 * Our payment id from the return URL. eSewa: base64 JSON in `data`.
 * Khalti: `purchase_order_id`. connectIPS: `TXNID` (our reference for it).
 * A cancelled eSewa payment: the `id` we put there. eSewa and connectIPS
 * add their part with a "?" even to a URL that already has a query, so any
 * later "?" is read as "&".
 */
export function returnedPayment(query: string): { id: string | null; cancelled: boolean } {
  const params = new URLSearchParams(query.replace(/^\?/, '').replace(/\?/g, '&'));
  // Khalti's "Pending" isn't a cancel: it may still complete, so keep checking.
  const khaltiStatus = params.get('status');
  const cancelled = params.get('cancelled') === '1' || KHALTI_GAVE_UP.includes(khaltiStatus ?? '');
  // URLSearchParams reads a "+" as a space; in base64 it is a "+".
  const data = params.get('data')?.replace(/ /g, '+');
  if (data) {
    try {
      const json = JSON.parse(atob(data.replace(/-/g, '+').replace(/_/g, '/'))) as { transaction_uuid?: unknown };
      if (typeof json.transaction_uuid === 'string') return { id: json.transaction_uuid, cancelled };
    } catch {
      // Not eSewa's: fall through to the other shapes.
    }
  }
  return { id: params.get('purchase_order_id') ?? params.get('TXNID') ?? params.get('id'), cancelled };
}
