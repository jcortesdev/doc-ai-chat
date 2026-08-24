import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Workspace packages ship raw TypeScript; let Next transpile them.
  // @doc-ai-chat/evals joins this list in M7: the /benchmark page reads the
  // committed report through its schema (BenchmarkReport.safeParse), the
  // first time apps/web's own Next build (not just the standalone eval/bench
  // scripts, which run via tsx outside webpack) has imported from evals.
  transpilePackages: [
    '@doc-ai-chat/db',
    '@doc-ai-chat/providers',
    '@doc-ai-chat/prompts',
    '@doc-ai-chat/evals',
  ],
};

export default withNextIntl(nextConfig);
