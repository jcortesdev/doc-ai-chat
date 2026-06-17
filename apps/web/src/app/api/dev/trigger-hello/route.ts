import { inngest } from '@/inngest/client';
import { NextResponse } from 'next/server';

// Temporary dev-only endpoint to fire the `test/hello` event. Removed after M1.
export async function GET() {
  try {
    const { ids } = await inngest.send({
      name: 'test/hello',
      data: { name: 'DocAI' },
    });

    return NextResponse.json({ ok: true, eventIds: ids });
  } catch (error) {
    // In dev, send() posts to the local Inngest dev server (localhost:8288).
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        hint: 'Is the Inngest dev server running? Start it with: npx inngest-cli@latest dev -u http://localhost:3000/api/inngest',
      },
      { status: 503 },
    );
  }
}
