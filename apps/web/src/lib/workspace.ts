import { db } from '@doc-ai-chat/db/client';
import { users, workspaces } from '@doc-ai-chat/db/schema';
import { eq } from 'drizzle-orm';

// Upserts the Clerk user and returns their workspace id, creating one on first
// use. The Clerk webhook (later) keeps `users` in sync; this self-heals if a
// request arrives before the webhook has run.
export async function ensureWorkspace(userId: string, email: string): Promise<string> {
  await db
    .insert(users)
    .values({ id: userId, email })
    .onConflictDoUpdate({ target: users.id, set: { email } });

  const existing = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerId, userId),
    columns: { id: true },
  });
  if (existing) {
    return existing.id;
  }

  const [created] = await db
    .insert(workspaces)
    .values({ ownerId: userId })
    .returning({ id: workspaces.id });
  if (!created) {
    throw new Error('failed to create workspace');
  }
  return created.id;
}
