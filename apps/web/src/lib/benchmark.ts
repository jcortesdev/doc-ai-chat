// A static import (not a runtime fs.readFile) on purpose: Vercel's serverless
// output tracing has to be able to see this file at build time to bundle it —
// M4's deploy-saga already found one case where "works in dev, breaks on
// Vercel" came from a path assumption the bundler's static analysis couldn't
// follow. A direct JSON import is the version webpack/Next is guaranteed to
// trace correctly, same as any other data import.
import benchmarkReportJson from '@doc-ai-chat/evals/benchmark-results/latest.json';
import { BenchmarkReport } from '@doc-ai-chat/evals/schema';

// Parsed once at module load, not per-request — the file only changes when
// someone re-runs `pnpm bench:run` and redeploys, never at runtime.
const parsed = BenchmarkReport.safeParse(benchmarkReportJson);

// `null` means the committed file is missing or doesn't match the schema
// (hand-edited, from an older format) — the page shows a "not run yet" state
// instead of crashing. In practice this never happens post-M7 (the file ships
// with the repo, same as golden-set.json), but a committed data file changing
// shape shouldn't be able to 500 a public page.
export function getBenchmarkReport(): BenchmarkReport | null {
  return parsed.success ? parsed.data : null;
}
