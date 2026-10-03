import type { RazorpayOrderDto } from '@fixora/shared-types';
import { isNativeApp, nativeCall, onNativeEvent } from './nativeApp';

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
 * Opens Razorpay Checkout for a server-created order. Resolves with the
 * signed response (which the server then verifies) or rejects when the
 * customer closes the window or the payment fails.
 */
/**
 * How the payment sheet is laid out: UPI apps first (PhonePe, Google Pay, Paytm
 * open directly on the phone), then debit/ATM & credit cards, net banking, wallets.
 */
const DISPLAY = {
  display: {
    blocks: {
      upi_apps: {
        name: 'Pay with UPI app — PhonePe, Google Pay, Paytm',
        instruments: [{ method: 'upi', flows: ['intent', 'collect', 'qr'], apps: ['phonepe', 'google_pay', 'paytm', 'bhim'] }],
      },
      cards: { name: 'Debit / ATM or credit card', instruments: [{ method: 'card' }] },
    },
    sequence: ['block.upi_apps', 'block.cards'],
    preferences: { show_default_blocks: true }, // net banking, wallets, pay later still listed below
  },
};

function options(order: RazorpayOrderDto) {
  return {
    key: order.keyId,
    order_id: order.orderId,
    amount: order.amount,
    currency: order.currency,
    name: 'RapidFix',
    description: `Booking ${order.bookingCode}`,
    prefill: order.prefill,
    theme: { color: '#1D4ED8' },
    config: DISPLAY,
  };
}

/** Thrown when the payment screen closed without a clear answer: the server checks with Razorpay instead. */
export const PAYMENT_CHECKING = 'Checking your payment…';

/** Android app: Razorpay's native checkout (detects and opens UPI apps installed on the phone). */
async function payInApp(order: RazorpayOrderDto): Promise<RazorpaySuccess> {
  // A UPI payment can take a few minutes (switch app, enter PIN, come back).
  const result = nativeCall<Partial<RazorpaySuccess> & { error?: string }>('razorpayPay', options(order), 20 * 60_000);
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

export async function payWithRazorpay(order: RazorpayOrderDto): Promise<RazorpaySuccess> {
  if (isNativeApp()) return payInApp(order);
  await loadCheckout();
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay!({
      ...options(order),
      handler: (r: RazorpaySuccess) => resolve(r),
      modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
    });
    rzp.on('payment.failed', (r) => reject(new Error(r.error?.description ?? 'Payment failed. Please try again.')));
    rzp.open();
  });
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
