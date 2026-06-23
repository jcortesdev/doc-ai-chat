import { db } from '@doc-ai-chat/db/client';
import { type SQL, sql } from 'drizzle-orm';

// Usage dashboard aggregation (M4 task 8). Reads usage_events. Non-owners see
// their own workspace; owners see the whole project, optionally excluding their
// own privileged activity (ADR-010 — owner rows are tagged is_privileged).
export type UsageScope =
  | { kind: 'workspace'; workspaceId: string }
  | { kind: 'project'; includePrivileged: boolean };

export type ModelUsage = {
  model: string;
  calls: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  p50Ms: number;
  p95Ms: number;
};

export type UsageSummary = {
  totalCalls: number;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  p50Ms: number;
  p95Ms: number;
  byModel: ModelUsage[];
};

function whereClause(scope: UsageScope): SQL {
  if (scope.kind === 'workspace') {
    return sql`workspace_id = ${scope.workspaceId}`;
  }
  if (!scope.includePrivileged) {
    return sql`is_privileged = false`;
  }
  return sql`true`;
}

type AggRow = {
  model: string;
  calls: number;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  p50: number;
  p95: number;
};

const METRICS = sql`
  count(*)::int as calls,
  coalesce(sum(cost_usd), 0)::float8 as cost_usd,
  coalesce(sum(input_tokens), 0)::int as input_tokens,
  coalesce(sum(output_tokens), 0)::int as output_tokens,
  coalesce(percentile_cont(0.5) within group (order by latency_ms), 0)::float8 as p50,
  coalesce(percentile_cont(0.95) within group (order by latency_ms), 0)::float8 as p95
`;

export async function getUsageSummary(scope: UsageScope): Promise<UsageSummary> {
  const where = whereClause(scope);

  const byModel = await db.execute<AggRow>(sql`
    select model, ${METRICS}
    from docai.usage_events
    where ${where}
    group by model
    order by cost_usd desc
  `);

  const overall = await db.execute<Omit<AggRow, 'model'>>(sql`
    select ${METRICS}
    from docai.usage_events
    where ${where}
  `);

  const total = overall.rows[0];
  return {
    totalCalls: total?.calls ?? 0,
    totalCostUsd: total?.cost_usd ?? 0,
    totalInputTokens: total?.input_tokens ?? 0,
    totalOutputTokens: total?.output_tokens ?? 0,
    p50Ms: total?.p50 ?? 0,
    p95Ms: total?.p95 ?? 0,
    byModel: byModel.rows.map((row) => ({
      model: row.model,
      calls: row.calls,
      costUsd: row.cost_usd,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      p50Ms: row.p50,
      p95Ms: row.p95,
    })),
  };
}
