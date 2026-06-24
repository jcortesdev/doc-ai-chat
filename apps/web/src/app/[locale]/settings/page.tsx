import { ByokForm } from '@/components/byok-form';
import { DocumentsList } from '@/components/documents-list';
import { listWorkspaceDocuments } from '@/lib/documents';
import { ensureWorkspace } from '@/lib/workspace';
import { auth, currentUser } from '@clerk/nextjs/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function SettingsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('settings');

  const { userId } = await auth();
  if (!userId) {
    redirect(`/${locale}/sign-in`);
  }
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? '';
  const { id: workspaceId } = await ensureWorkspace(userId, email);
  const documents = await listWorkspaceDocuments(workspaceId);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="font-bold text-2xl tracking-tight">{t('title')}</h1>
        <p className="text-foreground/70 text-sm">{t('hint')}</p>
      </div>
      <ByokForm />
      <DocumentsList documents={documents} />
    </main>
  );
}
