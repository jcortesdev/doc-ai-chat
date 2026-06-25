import { redirect } from 'next/navigation';

type Props = {
  params: Promise<{ locale: string }>;
};

// Settings (BYOK key) moved into the unified /account page (pre-M5). Kept as a
// redirect so old links and the in-app BYOK CTA don't 404.
export default async function SettingsPage({ params }: Props) {
  const { locale } = await params;
  redirect(`/${locale}/account`);
}
