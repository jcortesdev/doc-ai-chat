import { db } from '@doc-ai-chat/db/client';
import { projectBudgetUsage } from '@doc-ai-chat/db/schema';
import { gte, sql } from 'drizzle-orm';

// Project budget kill switch (ADR-015). A Postgres counter tracks all paid,
// non-BYOK provider spend per UTC day. The gate blocks free-tier features once
// the daily or monthly cap is hit; BYOK + privileged accounts continue. The exact
// caps live in private operational docs, never the public repo — an unset cap env
// disables that cap rather than baking a number in here.

function envFloat(name: string): number | null {
  const raw = process.env[name];
  if (!raw) {
    return null;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

// The `project_budget_usage.day` key is a calendar date, so the daily window
// resets at 00:00 UTC.
function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function utcMonthStart(now: Date): string {
  return `${now.toISOString().slice(0, 7)}-01`;
}

export type BudgetStatus = {
  over: boolean;
  overDaily: boolean;
  overMonthly: boolean;
};

// Reads today + month-to-date project spend and compares to the configured caps.
// Fail-open on a DB error — the provider-side hard caps and the rate limiter are
// the backstop, and we never take chat offline on a counter hiccup.
export async function checkProjectBudget(now: Date = new Date()): Promise<BudgetStatus> {
  const dailyCap = envFloat('PROJECT_DAILY_BUDGET_USD');
  const monthlyCap = envFloat('PROJECT_MONTHLY_BUDGET_USD');
  if (dailyCap === null && monthlyCap === null) {
    return { over: false, overDaily: false, overMonthly: false };
  }
  try {
    const today = utcDay(now);
    const rows = await db
      .select({ day: projectBudgetUsage.day, costUsd: projectBudgetUsage.costUsd })
      .from(projectBudgetUsage)
      .where(gte(projectBudgetUsage.day, utcMonthStart(now)));

    let monthSum = 0;
    let todayCost = 0;
    for (const row of rows) {
      const cost = Number(row.costUsd);
      monthSum += cost;
      if (row.day === today) {
        todayCost = cost;
      }
    }
    const overDaily = dailyCap !== null && todayCost >= dailyCap;
    const overMonthly = monthlyCap !== null && monthSum >= monthlyCap;
    return { over: overDaily || overMonthly, overDaily, overMonthly };
  } catch (error) {
    console.warn('[budget] check failed, failing open:', error);
    return { over: false, overDaily: false, overMonthly: false };
  }
}

// Adds a paid call's cost to today's counter. BYOK calls must NOT call this (the
// user's own key pays). Best-effort: a logging failure never breaks the request.
export async function recordProjectSpend(costUsd: number, now: Date = new Date()): Promise<void> {
  if (!(costUsd > 0)) {
    return;
  }
  try {
    const amount = costUsd.toFixed(6);
    await db
      .insert(projectBudgetUsage)
      .values({ day: utcDay(now), costUsd: amount })
      .onConflictDoUpdate({
        target: projectBudgetUsage.day,
        set: {
          costUsd: sql`${projectBudgetUsage.costUsd} + ${amount}::numeric`,
          updatedAt: sql`now()`,
        },
      });
  } catch (error) {
    console.warn('[budget] recordProjectSpend failed:', error);
  }
}
