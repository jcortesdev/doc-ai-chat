import { IngestStatus } from '@/components/ingest-status';
import { getOwnedDocument } from '@/lib/documents';
import { auth } from '@clerk/nextjs/server';
import { setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

type Props = {
  params: Promise<{ locale: string; id: string }>;
};

export default async function IngestStatusPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const { userId } = await auth();
  if (!userId) {
    redirect(`/${locale}/sign-in`);
  }

  const doc = await getOwnedDocument(id, userId);
  if (!doc) {
    notFound();
  }

  return <IngestStatus initial={doc} />;
}
