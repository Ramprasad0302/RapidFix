import type { Prisma, WalletTransactionType } from '../generated/prisma/client';

type Tx = Prisma.TransactionClient;

/**
 * The only way a technician wallet changes. Every movement is a ledger row with
 * the running balance; the idempotency key makes retries (webhooks, double
 * taps) harmless — a repeated key is a no-op.
 */
export async function postWalletTxn(
  tx: Tx,
  technicianId: string,
  entry: {
    type: WalletTransactionType;
    /** Signed paise: credits positive, debits negative. */
    amount: number;
    description: string;
    idempotencyKey: string;
    bookingId?: string | null;
    payoutId?: string | null;
    /** Adds to lifetime earnings (technician's net share). */
    earned?: number;
    paidOut?: number;
  },
) {
  const existing = await tx.walletTransaction.findUnique({ where: { idempotencyKey: entry.idempotencyKey } });
  if (existing) return existing;
  const wallet = await tx.technicianWallet.upsert({ where: { technicianId }, update: {}, create: { technicianId } });
  const updated = await tx.technicianWallet.update({
    where: { id: wallet.id },
    data: {
      balance: { increment: entry.amount },
      ...(entry.earned && { totalEarned: { increment: entry.earned } }),
      ...(entry.paidOut && { totalPaidOut: { increment: entry.paidOut } }),
    },
  });
  return tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      bookingId: entry.bookingId ?? null,
      payoutId: entry.payoutId ?? null,
      type: entry.type,
      amount: entry.amount,
      balanceAfter: updated.balance,
      description: entry.description.slice(0, 255),
      idempotencyKey: entry.idempotencyKey,
    },
  });
}
