import { db } from '@doc-ai-chat/db/client';
import { users, workspaces } from '@doc-ai-chat/db/schema';
import { eq } from 'drizzle-orm';

export type EnsuredWorkspace = {
  id: string;
  // The user's first-use timestamp (users.created_at), used as the free-trial
  // anchor (ADR-009 weekly_lock). The upsert's RETURNING gives the original
  // created_at on the conflict-update path too, so no extra query is needed.
  userCreatedAt: Date;
};

// Upserts the Clerk user and returns their workspace id + trial anchor, creating
// a workspace on first use. The Clerk webhook (later) keeps `users` in sync; this
// self-heals if a request arrives before the webhook has run.
export async function ensureWorkspace(userId: string, email: string): Promise<EnsuredWorkspace> {
  const [user] = await db
    .insert(users)
    .values({ id: userId, email })
    .onConflictDoUpdate({ target: users.id, set: { email } })
    .returning({ createdAt: users.createdAt });
  if (!user) {
    throw new Error('failed to upsert user');
  }

  const existing = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerId, userId),
    columns: { id: true },
  });
  if (existing) {
    return { id: existing.id, userCreatedAt: user.createdAt };
  }

  const [created] = await db
    .insert(workspaces)
    .values({ ownerId: userId })
    .returning({ id: workspaces.id });
  if (!created) {
    throw new Error('failed to create workspace');
  }
  return { id: created.id, userCreatedAt: user.createdAt };
}
