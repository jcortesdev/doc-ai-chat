// Throwaway Clerk test identity. The `+clerk_test` local-part marks it as a
// Clerk test email on dev instances. Created by the e2e global setup.
export const TEST_EMAIL = 'e2e+clerk_test@example.com';
export const TEST_PASSWORD = process.env.E2E_CLERK_PASSWORD ?? 'Clerk-e2e-Test-9271!';
