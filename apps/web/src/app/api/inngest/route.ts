import { cleanupRetention } from '@/inngest/cleanup-retention';
import { inngest } from '@/inngest/client';
import { ingestPdf } from '@/inngest/ingest-pdf';
import { serve } from 'inngest/next';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [ingestPdf, cleanupRetention],
});
