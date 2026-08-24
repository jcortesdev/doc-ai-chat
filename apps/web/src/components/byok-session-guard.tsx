'use client';

import { BYOK_PREFERENCE_KEY, type ByokProvider, byokStorageKey } from '@/lib/byok';
import { useAuth } from '@clerk/nextjs';
import { useEffect, useRef } from 'react';

const ALL_BYOK_PROVIDERS: readonly ByokProvider[] = ['anthropic', 'openai', 'deepseek'];

// Every BYOK key lives in sessionStorage (per-tab, ephemeral). That leaves one gap:
// if a user signs out and another signs in WITHOUT closing the tab, the stored keys
// would carry over and the new user's requests would be paid by the previous
// user's key. This guard clears all provider keys (+ the M7 provider/tier
// preference) whenever the signed-in user changes (incl. sign-out), closing that
// gap without scoping every read site by user id. Generalized in M7 from the
// M4 single-Anthropic-key version — a stale preference pointing at a provider
// whose key just got wiped would otherwise silently fall through to a 401.
export function ByokSessionGuard() {
  const { userId } = useAuth();
  // `undefined` until Clerk loads; we only react to real transitions afterwards.
  const previous = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (previous.current !== undefined && previous.current !== userId) {
      for (const provider of ALL_BYOK_PROVIDERS) {
        window.sessionStorage.removeItem(byokStorageKey(provider));
      }
      window.sessionStorage.removeItem(BYOK_PREFERENCE_KEY);
    }
    previous.current = userId;
  }, [userId]);

  return null;
}
