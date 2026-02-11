/**
 * Audit-trail helper. Writes to the event_logs table on every
 * state transition or significant action.
 */

import type { PrismaClient } from "@prisma/client";

export type LogEventParams = {
  actorUserId: string;
  entityType: string;
  entityId: string;
  action: string;
  metadata?: Record<string, unknown>;
};

/**
 * Insert an EventLog row. Accepts a PrismaClient (or transaction client)
 * so callers can include the log inside the same transaction as the
 * state change it records.
 */
export async function logEvent(
  prisma: PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  params: LogEventParams,
) {
  const tx = prisma as { eventLog: { create: (args: unknown) => Promise<unknown> } };
  return tx.eventLog.create({
    data: {
      actorUserId: params.actorUserId,
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      metadata: params.metadata ?? {},
    },
  });
}
