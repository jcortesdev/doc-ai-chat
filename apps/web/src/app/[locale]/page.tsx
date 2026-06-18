import { PdfUploader } from '@/components/pdf-uploader';
import { Show } from '@clerk/nextjs';
import { getTranslations, setRequestLocale } from 'next-intl/server';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function LandingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('landing');

  return (
    <main className="flex flex-1 flex-col">
      <section className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <h1 className="max-w-2xl text-balance text-4xl font-bold tracking-tight sm:text-6xl">
          {t('title')}
        </h1>
        <p className="max-w-xl text-balance text-base text-foreground/70 sm:text-lg">
          {t('subtitle')}
        </p>

        <div className="mt-4 flex w-full justify-center">
          <Show
            when="signed-in"
            fallback={<p className="text-sm text-foreground/50">{t('signInToUpload')}</p>}
          >
            <PdfUploader />
          </Show>
        </div>
      </section>

      <footer className="px-6 py-6 text-center text-xs text-foreground/50 sm:px-10">
        {t('footer')}
      </footer>
    </main>
  );
}
