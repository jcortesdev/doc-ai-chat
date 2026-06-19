import { streamChat } from '@/lib/chat';

// Temporary M3 dev route — removed in the M3 cleanup chore. Verifies streamChat
// end-to-end (token streaming + one usage_events row with cost). No auth/tenant
// here; the real POST /api/chat (M3 task 4) adds Clerk + tenant isolation + zod.
export const dynamic = 'force-dynamic';

export function GET() {
  const result = streamChat({
    system: 'You are a concise assistant. Answer in one short sentence.',
    messages: [{ role: 'user', content: 'Say hello and name one benefit of RAG.' }],
  });
  return result.toTextStreamResponse();
}
