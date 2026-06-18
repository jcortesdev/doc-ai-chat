import { createClerkClient } from '@clerk/backend';
import { clerkSetup } from '@clerk/testing/playwright';
import { TEST_EMAIL, TEST_PASSWORD } from './test-user';

// Fetches a Clerk Testing Token (bypasses bot protection) and find-or-creates
// the test user so the run is self-contained. Requires CLERK_PUBLISHABLE_KEY +
// CLERK_SECRET_KEY in the environment.
export default async function globalSetup() {
  await clerkSetup();

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new Error('CLERK_SECRET_KEY is not set');
  }

  const clerk = createClerkClient({ secretKey });
  const { data } = await clerk.users.getUserList({ emailAddress: [TEST_EMAIL] });
  if (data.length === 0) {
    await clerk.users.createUser({
      emailAddress: [TEST_EMAIL],
      password: TEST_PASSWORD,
    });
  }
}
