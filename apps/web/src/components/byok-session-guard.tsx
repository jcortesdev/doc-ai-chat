'use client';

import { BYOK_STORAGE_KEY } from '@/lib/byok';
import { useAuth } from '@clerk/nextjs';
import { useEffect, useRef } from 'react';

// The BYOK key lives in sessionStorage (per-tab, ephemeral). That leaves one gap:
// if a user signs out and another signs in WITHOUT closing the tab, the stored key
// would carry over and the new user's requests would be paid by the previous
// user's key. This guard clears the key whenever the signed-in user changes (incl.
// sign-out), closing that gap without scoping every read site by user id.
export function ByokSessionGuard() {
  const { userId } = useAuth();
  // `undefined` until Clerk loads; we only react to real transitions afterwards.
  const previous = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (previous.current !== undefined && previous.current !== userId) {
      window.sessionStorage.removeItem(BYOK_STORAGE_KEY);
    }
    previous.current = userId;
  }, [userId]);

  return null;
}
