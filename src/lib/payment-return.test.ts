import { describe, expect, it } from 'vitest';
import { returnedPayment } from './payment-return';

const esewa = (o: object) => btoa(JSON.stringify(o));

describe('returnedPayment', () => {
  it("reads eSewa's success data", () => {
    const data = esewa({ transaction_code: '000AE01', status: 'COMPLETE', transaction_uuid: 'cm1abc', total_amount: '1500.0' });
    expect(returnedPayment(`?data=${encodeURIComponent(data)}`)).toEqual({ id: 'cm1abc', cancelled: false });
  });

  it('reads eSewa data appended with a second "?"', () => {
    const data = esewa({ transaction_uuid: 'cm1abc' });
    expect(returnedPayment(`?id=cm1abc&cancelled=1?data=${data}`)).toEqual({ id: 'cm1abc', cancelled: true });
  });

  it('reads a cancelled eSewa payment', () => {
    expect(returnedPayment('?id=cm1abc&cancelled=1')).toEqual({ id: 'cm1abc', cancelled: true });
  });

  it("reads Khalti's return", () => {
    expect(returnedPayment('?pidx=P1&status=Completed&purchase_order_id=cm1abc&transaction_id=T1')).toEqual({
      id: 'cm1abc',
      cancelled: false,
    });
    expect(returnedPayment('?pidx=P1&status=User%20canceled&purchase_order_id=cm1abc').cancelled).toBe(true);
    expect(returnedPayment('?pidx=P1&status=Expired&purchase_order_id=cm1abc').cancelled).toBe(true);
  });

  it('keeps checking a Khalti payment that is still pending', () => {
    expect(returnedPayment('?pidx=P1&status=Pending&purchase_order_id=cm1abc')).toEqual({ id: 'cm1abc', cancelled: false });
  });

  it('keeps a "+" in eSewa\'s base64', () => {
    // This payload's base64 has a "+" in it, which a query string reads as a space.
    const json = JSON.stringify({ transaction_uuid: 'cm1~~~' });
    const data = btoa(json);
    expect(data).toContain('+');
    expect(returnedPayment(`?data=${data}`).id).toBe('cm1~~~');
  });

  it("reads connectIPS's TXNID, on success and on failure", () => {
    expect(returnedPayment('?TXNID=SUBABC123')).toEqual({ id: 'SUBABC123', cancelled: false });
    expect(returnedPayment('?cancelled=1?TXNID=SUBABC123')).toEqual({ id: 'SUBABC123', cancelled: true });
    expect(returnedPayment('?cancelled=1&TXNID=SUBABC123')).toEqual({ id: 'SUBABC123', cancelled: true });
  });

  it('finds nothing in an empty link', () => {
    expect(returnedPayment('')).toEqual({ id: null, cancelled: false });
    expect(returnedPayment('?data=not-base64!!').id).toBeNull();
  });
});
