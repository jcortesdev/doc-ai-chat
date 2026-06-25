// Per-tier upload limits (ADR-009). In M1 only `privileged` (OWNER_EMAILS) and
// `logged_in` are reachable: BYOK detection lands in M4 and anonymous sessions
// are not built yet — both are defined here for forward use.
export type Tier = 'anonymous' | 'logged_in' | 'byok' | 'privileged';

export type TierLimits = {
  tier: Tier;
  maxBytes: number;
  maxPages: number;
  maxFiles: number;
  // PDF + chunk retention window (ADR-009). The cleanup cron (task 9) deletes
  // documents past this window from upload time.
  retentionDays: number;
};

const LIMITS: Record<Tier, Omit<TierLimits, 'tier'>> = {
  anonymous: { maxBytes: 5 * 1024 * 1024, maxPages: 25, maxFiles: 1, retentionDays: 1 },
  logged_in: { maxBytes: 10 * 1024 * 1024, maxPages: 50, maxFiles: 3, retentionDays: 7 },
  byok: { maxBytes: 10 * 1024 * 1024, maxPages: 50, maxFiles: 5, retentionDays: 30 },
  privileged: {
    maxBytes: Number.MAX_SAFE_INTEGER,
    maxPages: Number.MAX_SAFE_INTEGER,
    maxFiles: Number.MAX_SAFE_INTEGER,
    retentionDays: 30,
  },
};

function ownerEmails(): string[] {
  return (process.env.OWNER_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function resolveTier(email: string | null): Tier {
  if (email && ownerEmails().includes(email.toLowerCase())) {
    return 'privileged';
  }
  return 'logged_in';
}

export function getTierLimits(email: string | null): TierLimits {
  const tier = resolveTier(email);
  return { tier, ...LIMITS[tier] };
}

// Emails granted an open-ended trial (no weekly_lock) without becoming owners —
// for letting specific testers keep evaluating the demo past the 7 days. They
// stay on the logged_in tier (the daily quota + budget still apply); only the
// trial expiry is waived. Comma-separated env, managed in the deployment.
export function isTrialExempt(email: string | null): boolean {
  if (!email) {
    return false;
  }
  const exempt = (process.env.TRIAL_EXEMPT_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return exempt.includes(email.toLowerCase());
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Length of the logged-in free trial (ADR-009): free access (chat 10/day, search,
// uploads) is available for this many days from first use, then the tier locks
// (ADR-013 `weekly_lock`). Override via env to exercise the lock without waiting.
export function trialDays(): number {
  const raw = process.env.CHAT_TRIAL_DAYS;
  if (raw === undefined || raw === '') {
    return 7;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 7;
}

// True once the free trial has elapsed (first use + trialDays in the past). The
// anchor is the user's `created_at` (first authenticated activity). Owners never
// reach this check (resolveTier === 'privileged' bypasses it at the call site).
export function isTrialExpired(trialStartedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - trialStartedAt.getTime() > trialDays() * DAY_MS;
}
