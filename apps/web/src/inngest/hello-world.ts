import { inngest } from './client';

// Smoke-test function: listens for `test/hello` and returns a greeting. Each
// `step.run` is independently retried by Inngest (the real ingest pipeline in
// task 8 leans on this).
export const helloWorld = inngest.createFunction(
  { id: 'hello-world', triggers: [{ event: 'test/hello' }] },
  async ({ event, step }) => {
    const name = (event.data as { name?: string }).name ?? 'world';
    const greeting = await step.run('build-greeting', () => `Hello, ${name}!`);

    return { greeting };
  },
);
