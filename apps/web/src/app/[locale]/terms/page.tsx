import { getTranslations, setRequestLocale } from 'next-intl/server';

type Props = {
  params: Promise<{ locale: string }>;
};

function Section({ title, body }: { title: string; body: string }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="font-semibold text-base">{title}</h2>
      <p className="text-foreground/70 text-sm leading-relaxed">{body}</p>
    </section>
  );
}

// Minimal terms + data page (pre-M5). Light, not legalese: it states this is a
// portfolio demo, content/copyright responsibility, how data is handled, and a
// contact. Public (see middleware) so it's reachable without signing in.
export default async function TermsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('terms');
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <h1 className="font-bold text-2xl tracking-tight">{t('title')}</h1>
      <p className="text-foreground/70 text-sm leading-relaxed">{t('intro')}</p>

      <Section title={t('contentTitle')} body={t('contentBody')} />
      <Section title={t('dataTitle')} body={t('dataBody')} />
      <Section title={t('warrantyTitle')} body={t('warrantyBody')} />

      <section className="flex flex-col gap-1">
        <h2 className="font-semibold text-base">{t('contactTitle')}</h2>
        <p className="text-foreground/70 text-sm leading-relaxed">
          {t('contactBody')}
          {contactEmail && (
            <>
              {' '}
              <a
                href={`mailto:${contactEmail}`}
                className="underline underline-offset-2 hover:text-foreground"
              >
                {contactEmail}
              </a>
            </>
          )}
        </p>
      </section>
    </main>
  );
}
