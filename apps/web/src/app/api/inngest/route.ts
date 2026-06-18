import { inngest } from '@/inngest/client';
import { helloWorld } from '@/inngest/hello-world';
import { ingestPdf } from '@/inngest/ingest-pdf';
import { serve } from 'inngest/next';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [helloWorld, ingestPdf],
});
