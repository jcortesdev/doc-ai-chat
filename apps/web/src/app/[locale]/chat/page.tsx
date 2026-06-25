import { ChatBox } from '@/components/chat-box';
import { PageHelp } from '@/components/page-help';
import { listReadyDocumentsForUser } from '@/lib/documents';
import { auth } from '@clerk/nextjs/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function ChatPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('chat');

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
      <ChatBox documents={documents} userId={userId ?? ''} />
    </main>
  );
}
