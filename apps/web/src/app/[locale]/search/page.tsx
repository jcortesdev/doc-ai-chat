import { AvailableDocuments } from '@/components/available-documents';
import { PageHelp } from '@/components/page-help';
import { SearchBox } from '@/components/search-box';
import { listReadyDocumentsForUser } from '@/lib/documents';
import { auth } from '@clerk/nextjs/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function SearchPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('search');

  const { userId } = await auth();
  const documents = userId ? await listReadyDocumentsForUser(userId) : [];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10 xl:max-w-5xl">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="font-bold text-2xl tracking-tight">{t('title')}</h1>
          <PageHelp body={t('help')} />
        </div>
        <p className="text-foreground/70 text-sm">{t('hint')}</p>
      </div>
      {/* Two-column on xl: documents rail + the search box/results in the main
          column; stacked below xl. */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[260px_minmax(0,1fr)] xl:gap-8">
        <aside className="xl:sticky xl:top-6 xl:self-start">
          <AvailableDocuments documents={documents} />
        </aside>
        <div className="min-w-0">
          <SearchBox />
        </div>
      </div>
    </main>
  );
}
