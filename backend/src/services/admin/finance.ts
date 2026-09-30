import type { AdminPaymentsDto, AdminPayoutDto, AdminWalletRowDto } from '@fixora/shared-types';
import { formatINR } from '@fixora/shared-utils';
import { prisma } from '../../config/prisma';
import type { Prisma } from '../../generated/prisma/client';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../audit.service';
import { postWalletTxn } from '../wallet.service';

type Actor = { userId: string; role: string };

/** Payments dashboard: totals for the period + the transaction ledger. */
export async function payments(q: { from?: Date; to?: Date; method?: 'CASH' | 'UPI' | 'RAZORPAY'; status?: string; page: number; pageSize: number }): Promise<AdminPaymentsDto> {
  const range = q.from || q.to ? { ...(q.from && { gte: q.from }), ...(q.to && { lte: q.to }) } : undefined;
  const paidWhere: Prisma.PaymentWhereInput = { status: { in: ['SUCCESS', 'REFUNDED'] }, ...(range && { paidAt: range }), ...(q.method && { method: q.method }) };

  const [paid, byMethod, failed, pending, refunds, bookingsAgg] = await Promise.all([
    prisma.payment.aggregate({ where: paidWhere, _sum: { amount: true } }),
    prisma.payment.groupBy({ by: ['method'], where: paidWhere, _sum: { amount: true }, _count: { _all: true } }),
    prisma.payment.count({ where: { status: 'FAILED', ...(range && { createdAt: range }) } }),
    prisma.booking.count({ where: { status: 'PAYMENT_PENDING' } }),
    prisma.paymentTransaction.aggregate({ where: { type: 'REFUND', status: 'SUCCESS', ...(range && { createdAt: range }) }, _sum: { amount: true } }),
    prisma.booking.aggregate({ where: { payment: paidWhere }, _sum: { commissionAmount: true, technicianEarning: true, taxAmount: true } }),
  ]);

  const txWhere: Prisma.PaymentTransactionWhereInput = {
    ...(range && { createdAt: range }),
    ...(q.method && { payment: { method: q.method } }),
    ...(q.status && { status: q.status as never }),
  };
  const [txns, total] = await prisma.$transaction([
    prisma.paymentTransaction.findMany({
      where: txWhere,
      include: { payment: { include: { booking: { select: { id: true, code: true, customer: { select: { user: { select: { name: true } } } } } } } } },
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.paymentTransaction.count({ where: txWhere }),
  ]);

  return {
    summary: {
      revenue: paid._sum.amount ?? 0,
      commission: bookingsAgg._sum.commissionAmount ?? 0,
      technicianEarnings: bookingsAgg._sum.technicianEarning ?? 0,
      tax: bookingsAgg._sum.taxAmount ?? 0,
      refunds: refunds._sum.amount ?? 0,
      byMethod: byMethod.map((m) => ({ method: m.method, amount: m._sum.amount ?? 0, count: m._count._all })),
      failed,
      pending,
    },
    transactions: txns.map((t) => ({
      id: t.id,
      bookingId: t.payment.booking.id,
      bookingCode: t.payment.booking.code ?? '',
      customerName: t.payment.booking.customer.user.name ?? 'Customer',
      type: t.type,
      status: t.status,
      method: t.payment.method,
      amount: t.amount,
      providerRef: t.providerRef,
      createdAt: t.createdAt.toISOString(),
    })),
    total,
  };
}

export async function wallets(q: { q?: string }): Promise<AdminWalletRowDto[]> {
  const rows = await prisma.technicianWallet.findMany({
    where: q.q ? { technician: { user: { OR: [{ name: { contains: q.q } }, { phone: { contains: q.q } }] } } } : {},
    include: { technician: { include: { user: { select: { name: true, phone: true } } } } },
    orderBy: { balance: 'desc' },
  });
  return rows.map((w) => ({
    technicianId: w.technicianId,
    name: w.technician.user.name,
    phone: w.technician.user.phone,
    balance: w.balance,
    totalEarned: w.totalEarned,
    totalPaidOut: w.totalPaidOut,
    upiId: w.technician.payoutUpiId,
    bankAccountLast4: w.technician.bankAccountLast4,
    bankIfsc: w.technician.bankIfsc,
  }));
}

export async function listPayouts(): Promise<AdminPayoutDto[]> {
  const rows = await prisma.payout.findMany({ include: { technician: { include: { user: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' }, take: 200 });
  return rows.map((p) => ({
    id: p.id,
    technicianId: p.technicianId,
    technicianName: p.technician.user.name,
    amount: p.amount,
    status: p.status,
    method: p.method,
    reference: p.reference,
    processedAt: p.processedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  }));
}

/**
 * Record a payout that finance has transferred (bank/UPI). Debits the wallet;
 * you cannot pay out more than the technician's positive balance.
 */
export async function createPayout(actor: Actor, input: { technicianId: string; amount: number; method: 'UPI' | 'BANK_TRANSFER' | 'CASH'; reference: string }, ip?: string) {
  const wallet = await prisma.technicianWallet.findUnique({ where: { technicianId: input.technicianId }, include: { technician: { select: { userId: true } } } });
  if (!wallet) throw AppError.notFound('Wallet not found', 'WALLET_NOT_FOUND');
  if (input.amount <= 0 || input.amount > wallet.balance) throw AppError.badRequest(`You can pay out up to ${formatINR(Math.max(0, wallet.balance))}.`, 'INVALID_PAYOUT_AMOUNT');
  const payout = await prisma.$transaction(async (tx) => {
    const p = await tx.payout.create({
      data: { technicianId: input.technicianId, amount: input.amount, status: 'PAID', method: input.method, reference: input.reference, processedById: actor.userId, processedAt: new Date() },
    });
    await postWalletTxn(tx, input.technicianId, {
      type: 'PAYOUT_DEBIT',
      amount: -input.amount,
      paidOut: input.amount,
      payoutId: p.id,
      description: `Payout via ${input.method.replace('_', ' ')} · ${input.reference}`,
      idempotencyKey: `payout:${p.id}`,
    });
    await tx.notification.create({ data: { userId: wallet.technician.userId, type: 'PAYMENT', title: 'Payout sent', body: `${formatINR(input.amount)} sent via ${input.method.replace('_', ' ')} (ref ${input.reference}).` } });
    return p;
  });
  await recordAudit({ actorId: actor.userId, actorRole: actor.role as never, action: 'PAYOUT_CREATED', entity: 'Payout', entityId: payout.id, newValue: input, ip });
  return payout;
}
