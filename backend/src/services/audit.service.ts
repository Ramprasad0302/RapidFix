import type { Role } from '@fixora/shared-types';
import { prisma } from '../config/prisma';
import { logger } from '../config/logger';

export interface AuditEntry {
  actorId?: string | null;
  actorRole?: Role | null;
  action: string;
  entity: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ip?: string | null;
}

/** Append-only audit trail. Failures are logged, never thrown — auditing must not break the action. */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        actorRole: entry.actorRole ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        oldValue: entry.oldValue === undefined ? undefined : (entry.oldValue as object),
        newValue: entry.newValue === undefined ? undefined : (entry.newValue as object),
        ip: entry.ip?.slice(0, 64) ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, action: entry.action }, 'Failed to write audit log');
  }
}
