'use client';
import { useState } from 'react';
import type { SubscriptionPaymentInfo } from '@/types';

/**
 * Paying by hand: where to send the money (with a QR code to scan) and what
 * to write, as set in the admin panel's Settings -> How shops pay. Nothing
 * set there: nothing rendered.
 */
export function PayDirectly({ payment }: { payment: SubscriptionPaymentInfo }) {
  const { methods, instructions } = payment;
  if (!methods.length && !instructions) return null;
  return (
    <div className="space-y-3">
      {methods.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">Send the money to:</p>
          <ul className="space-y-2">
            {methods.map((m, i) => (
              <Method key={i} {...m} />
            ))}
          </ul>
        </>
      )}
      {instructions && <p className="whitespace-pre-line text-xs text-muted-foreground">{instructions}</p>}
    </div>
  );
}

function Method({ label, details, qrUrl }: { label: string; details: string; qrUrl: string | null }) {
  // A small QR in the list; tap for one big enough to scan from the screen.
  const [big, setBig] = useState(false);
  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">{label}</p>
          {details && <p className="mt-0.5 break-words text-sm text-muted-foreground">{details}</p>}
        </div>
        {qrUrl && (
          <button
            type="button"
            onClick={() => setBig((b) => !b)}
            className="shrink-0 rounded-md border border-border bg-white p-1"
            aria-label={big ? `Shrink ${label} QR code` : `Enlarge ${label} QR code`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl} alt={`${label} QR code`} className="h-14 w-14 object-contain" />
          </button>
        )}
      </div>
      {qrUrl && big && (
        <div className="mt-3 flex justify-center rounded-md bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl} alt={`${label} QR code, large`} className="h-56 w-56 object-contain" />
        </div>
      )}
    </li>
  );
}
