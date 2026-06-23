'use client';

import { useTranslations } from 'next-intl';

// Per-response usage the route emits as message metadata on finish (task 7).
export type ChatUsage = {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
};

// Nearest-rank percentile over the response latencies.
function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  const index = Math.min(sorted.length - 1, Math.max(0, rank));
  return sorted[index] ?? 0;
}

// Sticky bar with live conversation cost, last-response tokens/sec, and p50/p95
// latency across the conversation — the "production mindset" signal (M4 task 7).
export function CostLatencyBar({ usages }: { usages: ChatUsage[] }) {
  const t = useTranslations('chat');
  if (usages.length === 0) {
    return null;
  }

  const totalCost = usages.reduce((sum, usage) => sum + usage.costUsd, 0);
  const latencies = usages.map((usage) => usage.latencyMs);
  const p50 = percentile(latencies, 50) / 1000;
  const p95 = percentile(latencies, 95) / 1000;
  const last = usages.at(-1);
  const tokensPerSec =
    last && last.latencyMs > 0 ? Math.round(last.outputTokens / (last.latencyMs / 1000)) : 0;

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-1 border-foreground/10 border-b bg-background/80 px-1 py-2 text-foreground/70 text-xs backdrop-blur">
      <span>
        {t('barCost')}:{' '}
        <span className="font-mono text-foreground tabular-nums">${totalCost.toFixed(6)}</span>
      </span>
      <span>
        {t('barTokensPerSec')}:{' '}
        <span className="font-mono text-foreground tabular-nums">{tokensPerSec}</span>
      </span>
      <span>
        {t('barLatency')}:{' '}
        <span className="font-mono text-foreground tabular-nums">{p50.toFixed(1)}s</span> /{' '}
        <span className="font-mono text-foreground tabular-nums">{p95.toFixed(1)}s</span>
      </span>
    </div>
  );
}
