import { SignUp } from '@clerk/nextjs';
import { setRequestLocale } from 'next-intl/server';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function SignUpPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <SignUp fallbackRedirectUrl={`/${locale}`} signInUrl={`/${locale}/sign-in`} />
    </main>
  );
}
