import { clerkSetup } from '@clerk/testing/playwright';

// Fetches a Clerk Testing Token so the e2e run bypasses bot protection.
// Requires CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY in the environment.
export default async function globalSetup() {
  await clerkSetup();
}
