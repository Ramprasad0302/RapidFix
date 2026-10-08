import type { RazorpayOrderDto } from '@fixora/shared-types';
import { nativeCall, nativePlatform, onNativeEvent } from './nativeApp';

interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', cb: (r: { error?: { description?: string } }) => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

const SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let loading: Promise<void> | null = null;

function loadCheckout() {
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error('Could not load the payment window. Check your connection and try again.'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * How the payment sheet is laid out: UPI first (Razorpay shows the UPI apps it
 * finds on the phone, or a QR on a computer), then debit/ATM & credit cards,
 * then net banking, wallets and the rest.
 */
const ALL_METHODS = {
  display: {
    blocks: {
      upi: { name: 'UPI — PhonePe, Google Pay, Paytm', instruments: [{ method: 'upi' }] },
      cards: { name: 'Debit / ATM or credit card', instruments: [{ method: 'card' }] },
    },
    sequence: ['block.upi', 'block.cards'],
    preferences: { show_default_blocks: true },
  },
};

/** "PhonePe / Google Pay / UPI" button: the same on-site checkout, showing only UPI. */
const UPI_ONLY = {
  display: {
    blocks: { upi: { name: 'Pay with PhonePe, Google Pay, Paytm or any UPI app', instruments: [{ method: 'upi' }] } },
    sequence: ['block.upi'],
    preferences: { show_default_blocks: false },
  },
};

export type PayMethod = 'any' | 'upi';

function options(order: RazorpayOrderDto, method: PayMethod) {
  // The customer already signed in to RapidFix: pass their phone/email as fixed and hidden so Razorpay
  // skips its own "enter phone number / log in with OTP" screen and goes straight to the payment options.
  const { contact, email } = order.prefill;
  return {
    key: order.keyId,
    order_id: order.orderId,
    amount: order.amount,
    currency: order.currency,
    name: 'RapidFix',
    description: `Booking ${order.bookingCode}`,
    prefill: { ...order.prefill, ...(method === 'upi' && { method: 'upi' }) },
    readonly: { contact: !!contact, email: !!email, name: true },
    hidden: { contact: !!contact, email: !!email },
    remember_customer: false, // no Razorpay account / saved-card login
    theme: { color: '#1D4ED8' },
    config: method === 'upi' ? UPI_ONLY : ALL_METHODS,
  };
}

/** Thrown when the payment screen closed without a clear answer: the server checks with Razorpay instead. */
export const PAYMENT_CHECKING = 'Checking your payment…';

/** Android app: Razorpay's native checkout (detects and opens UPI apps installed on the phone). */
async function payInApp(order: RazorpayOrderDto, method: PayMethod): Promise<RazorpaySuccess> {
  // A UPI payment can take a few minutes (switch app, enter PIN, come back).
  const result = nativeCall<Partial<RazorpaySuccess> & { error?: string }>('razorpayPay', options(order, method), 20 * 60_000);
  // Back in RapidFix but no answer from the payment screen after a few seconds: don't keep the customer
  // waiting — the booking page asks Razorpay directly and confirms within seconds.
  let off = () => {};
  const noAnswer = new Promise<never>((_, reject) => {
    off = onNativeEvent((e) => {
      if (e.event === 'state') setTimeout(() => reject(new Error(PAYMENT_CHECKING)), 5000);
    });
  });
  const r = await Promise.race([result, noAnswer]).finally(off);
  if (!r) throw new Error('Payment cancelled');
  if (r.error) throw new Error(r.error);
  if (!r.razorpay_payment_id || !r.razorpay_order_id || !r.razorpay_signature) throw new Error('Payment could not be confirmed. If money was taken it will be matched automatically.');
  return r as RazorpaySuccess;
}

/**
 * Opens Razorpay Checkout for a server-created order, on top of the RapidFix page
 * (never a separate Razorpay website). Resolves with the signed response (which the
 * server then verifies) or rejects when the customer closes it or the payment fails.
 * `upi` shows only UPI: PhonePe / Google Pay / Paytm open straight from it on a phone,
 * and a UPI QR is shown on a computer.
 */
export async function payWithRazorpay(order: RazorpayOrderDto, method: PayMethod = 'any'): Promise<RazorpaySuccess> {
  if (nativePlatform() === 'android') return payInApp(order, method);
  // Browser and iPhone app: Razorpay's web checkout (the iPhone app opens PhonePe / Google Pay / Paytm from it).
  await loadCheckout();
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay!({
      ...options(order, method),
      handler: (r: RazorpaySuccess) => resolve(r),
      modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
    });
    rzp.on('payment.failed', (r) => reject(new Error(r.error?.description ?? 'Payment failed. Please try again.')));
    rzp.open();
  });
}

/** Load Razorpay's checkout script ahead of time so the payment sheet opens instantly. */
export function preloadCheckout() {
  if (nativePlatform() !== 'android') void loadCheckout().catch(() => undefined);
}

/** Remember that a payment was started for a booking (so its page keeps checking for ~15 min). */
const ATTEMPT_KEY = (id: string) => `rapidfix.payAttempt.${id}`;
export function markPaymentAttempt(bookingId: string) {
  try {
    localStorage.setItem(ATTEMPT_KEY(bookingId), String(Date.now()));
  } catch {
    /* storage unavailable */
  }
}
export function recentPaymentAttempt(bookingId: string, withinMs = 15 * 60_000) {
  try {
    return Date.now() - Number(localStorage.getItem(ATTEMPT_KEY(bookingId)) ?? 0) < withinMs;
  } catch {
    return false;
  }
}
export function clearPaymentAttempt(bookingId: string) {
  try {
    localStorage.removeItem(ATTEMPT_KEY(bookingId));
  } catch {
    /* storage unavailable */
  }
}
