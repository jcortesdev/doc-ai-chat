import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Workspace packages ship raw TypeScript; let Next transpile them.
  transpilePackages: ['@doc-ai-chat/db'],
};

export default withNextIntl(nextConfig);
