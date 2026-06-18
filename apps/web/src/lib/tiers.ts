// Per-tier upload limits (ADR-009). In M1 only `privileged` (OWNER_EMAILS) and
// `logged_in` are reachable: BYOK detection lands in M4 and anonymous sessions
// are not built yet — both are defined here for forward use.
export type Tier = 'anonymous' | 'logged_in' | 'byok' | 'privileged';

export type TierLimits = {
  tier: Tier;
  maxBytes: number;
  maxPages: number;
  maxFiles: number;
};

const LIMITS: Record<Tier, Omit<TierLimits, 'tier'>> = {
  anonymous: { maxBytes: 5 * 1024 * 1024, maxPages: 25, maxFiles: 1 },
  logged_in: { maxBytes: 10 * 1024 * 1024, maxPages: 50, maxFiles: 3 },
  byok: { maxBytes: 10 * 1024 * 1024, maxPages: 50, maxFiles: 5 },
  privileged: {
    maxBytes: Number.MAX_SAFE_INTEGER,
    maxPages: Number.MAX_SAFE_INTEGER,
    maxFiles: Number.MAX_SAFE_INTEGER,
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
