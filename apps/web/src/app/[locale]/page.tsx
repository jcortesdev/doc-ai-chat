import { DocumentsList } from '@/components/documents-list';
import { PageHelp } from '@/components/page-help';
import { PdfUploader } from '@/components/pdf-uploader';
import { Link } from '@/i18n/navigation';
import type { DocumentListItem } from '@/lib/documents';
import { listWorkspaceDocuments } from '@/lib/documents';
import { ensureWorkspace } from '@/lib/workspace';
import { Show } from '@clerk/nextjs';
import { auth, currentUser } from '@clerk/nextjs/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function LandingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('landing');

  // Signed-in users manage their uploads right here, under the dropzone. Resolve
  // the workspace server-side; signed-out visitors skip the DB entirely.
  const { userId } = await auth();
  let documents: DocumentListItem[] = [];
  if (userId) {
    const user = await currentUser();
    const email = user?.primaryEmailAddress?.emailAddress ?? '';
    const { id: workspaceId } = await ensureWorkspace(userId, email || `${userId}@users.noreply`);
    documents = await listWorkspaceDocuments(workspaceId);
  }

  return (
    <main className="flex flex-1 flex-col">
      <section className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-10 text-center">
        <h1 className="max-w-2xl text-balance text-4xl font-bold tracking-tight sm:text-6xl">
          {t('title')}
          <span className="ml-2 inline-flex align-super">
            <PageHelp body={t('help')} align="end" />
          </span>
        </h1>
        <p className="max-w-xl text-balance text-base text-foreground/70 sm:text-lg">
          {t('subtitle')}
        </p>

        <div className="mt-4 flex w-full justify-center">
          <Show
            when="signed-in"
            fallback={<p className="text-sm text-foreground/70">{t('signInToUpload')}</p>}
          >
            <div className="flex flex-col items-center gap-2">
              <PdfUploader />
              <p className="max-w-md text-balance text-foreground/70 text-xs">{t('disclaimer')}</p>
            </div>
          </Show>
        </div>

        {userId && documents.length > 0 && (
          <div className="mt-6 w-full max-w-2xl text-left">
            <DocumentsList documents={documents} />
          </div>
        )}
      </section>

      <footer className="px-6 py-6 text-center text-xs text-foreground/70 sm:px-10">
        {t('footer')}
        {' · '}
        <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
          {t('termsLink')}
        </Link>
      </footer>
    </main>
  );
}
