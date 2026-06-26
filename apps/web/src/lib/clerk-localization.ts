import { enUS, esES } from '@clerk/localizations';

type Localization = typeof enUS;

// Appended to Clerk's email-verification step so users — recruiters especially —
// know to check spam. On the free plan Clerk sends from accounts.dev, so we name
// the sender to make the email easy to find. Clerk's prebuilt components can only
// be localized through its own `localization` prop (next-intl can't reach inside
// them), which is why this hint lives here and not in the message catalog.
const spamHintEs =
  'Si no ves el correo en unos segundos, revisa tu carpeta de spam o correo no deseado (el remitente es accounts.dev).';
const spamHintEn =
  "If you don't see the email within a few seconds, check your spam or junk folder (the sender is accounts.dev).";

const overridesEs = {
  signUp: {
    emailCode: { subtitle: `Ingresa el código que enviamos a tu correo. ${spamHintEs}` },
    emailLink: { subtitle: `Te enviamos un enlace a tu correo. ${spamHintEs}` },
  },
  signIn: {
    emailCode: { subtitle: `Ingresa el código que enviamos a tu correo. ${spamHintEs}` },
    emailLink: { subtitle: `Te enviamos un enlace a tu correo. ${spamHintEs}` },
  },
};

const overridesEn = {
  signUp: {
    emailCode: { subtitle: `Enter the code we sent to your email. ${spamHintEn}` },
    emailLink: { subtitle: `We sent a link to your email. ${spamHintEn}` },
  },
  signIn: {
    emailCode: { subtitle: `Enter the code we sent to your email. ${spamHintEn}` },
    emailLink: { subtitle: `We sent a link to your email. ${spamHintEn}` },
  },
};

function deepMerge<T extends Record<string, unknown>>(base: T, extra: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    const current = out[key];
    out[key] =
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      current &&
      typeof current === 'object' &&
      !Array.isArray(current)
        ? deepMerge(current as Record<string, unknown>, value as Record<string, unknown>)
        : value;
  }
  return out as T;
}

export function getClerkLocalization(locale: string): Localization {
  return locale === 'es'
    ? (deepMerge(esES as Record<string, unknown>, overridesEs) as Localization)
    : (deepMerge(enUS as Record<string, unknown>, overridesEn) as Localization);
}
