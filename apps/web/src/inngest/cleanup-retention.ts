import { deleteObject } from '@/lib/r2';
import { db } from '@doc-ai-chat/db/client';
import { documents } from '@doc-ai-chat/db/schema';
import { and, asc, eq, lt, sql } from 'drizzle-orm';
import { inngest } from './client';

// A document stuck in 'processing' longer than this lost its Inngest run (worker
// down / event dropped) — onFailure never fires in that case, so the cron reaps it.
const PROCESSING_TIMEOUT_MS = 10 * 60 * 1000;
// LRU starts evicting at 90% of the R2 quota and frees down to 80%.
const LRU_SOFT_FRACTION = 0.9;
const LRU_TARGET_FRACTION = 0.8;

// Daily retention + storage maintenance (M4 task 9, ADR-012). Runs at 03:00 UTC:
//   1. reap documents stuck in 'processing',
//   2. delete documents past their per-tier retention window (R2 + Postgres),
//   3. LRU-evict oldest documents if R2 usage exceeds the soft cap.
// A system job — operates across all workspaces, no tenant scoping.
export const cleanupRetention = inngest.createFunction(
  { id: 'cleanup-retention', triggers: [{ cron: '0 3 * * *' }] },
  async ({ step }) => {
    const reaped = await step.run('reap-stuck-processing', async () => {
      const cutoff = new Date(Date.now() - PROCESSING_TIMEOUT_MS);
      const rows = await db
        .update(documents)
        .set({ status: 'failed', errorVariant: 'processing_timeout', updatedAt: new Date() })
        .where(and(eq(documents.status, 'processing'), lt(documents.updatedAt, cutoff)))
        .returning({ id: documents.id });
      return rows.length;
    });

    const expired = await step.run('delete-expired', async () => {
      const rows = await db
        .select({ id: documents.id, r2Key: documents.r2Key })
        .from(documents)
        .where(lt(documents.expiresAt, new Date()));
      for (const row of rows) {
        // Delete the R2 object first; the row (and its chunks, via cascade) after.
        await deleteObject(row.r2Key).catch(() => {});
        await db.delete(documents).where(eq(documents.id, row.id));
      }
      return rows.length;
    });

    const evicted = await step.run('lru-evict', async () => {
      const quotaGb = Number(process.env.R2_PROJECT_QUOTA_GB);
      if (!Number.isFinite(quotaGb) || quotaGb <= 0) {
        return 0;
      }
      const quotaBytes = quotaGb * 1024 ** 3;

      const usedRow = await db
        .select({ total: sql<number>`coalesce(sum(byte_size), 0)::float8` })
        .from(documents)
        .where(eq(documents.status, 'ready'));
      let used = usedRow[0]?.total ?? 0;
      if (used <= quotaBytes * LRU_SOFT_FRACTION) {
        return 0;
      }

      // Approximate LRU by oldest-created (we don't track last access).
      const target = quotaBytes * LRU_TARGET_FRACTION;
      const candidates = await db
        .select({ id: documents.id, r2Key: documents.r2Key, byteSize: documents.byteSize })
        .from(documents)
        .where(eq(documents.status, 'ready'))
        .orderBy(asc(documents.createdAt));

      let count = 0;
      for (const doc of candidates) {
        if (used <= target) {
          break;
        }
        await deleteObject(doc.r2Key).catch(() => {});
        await db.delete(documents).where(eq(documents.id, doc.id));
        used -= doc.byteSize ?? 0;
        count += 1;
      }
      return count;
    });

    return { reaped, expired, evicted };
  },
);
