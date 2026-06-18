import { Inngest } from 'inngest';

// Force dev mode locally so the Inngest dev server (localhost:8288) is used even
// though INNGEST_SIGNING_KEY is set in .env.local. On Vercel NODE_ENV is
// 'production', so the SDK runs in cloud mode and verifies the signing key.
export const inngest = new Inngest({
  id: 'docai',
  isDev: process.env.NODE_ENV !== 'production',
});
