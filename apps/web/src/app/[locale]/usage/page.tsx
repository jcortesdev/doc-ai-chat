import { redirect } from 'next/navigation';

type Props = {
  params: Promise<{ locale: string }>;
};

// Usage moved into the unified /account page (pre-M5). Kept as a redirect so old
// links don't 404.
export default async function UsagePage({ params }: Props) {
  const { locale } = await params;
  redirect(`/${locale}/account`);
}
