'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';

type SearchResult = {
  chunkId: string;
  documentId: string;
  page: number | null;
  content: string;
  scores: {
    cosine: number | null;
    bm25: number | null;
    rrf: number;
    rerank: number;
  };
};

type SearchResponse = {
  query: string;
  costUsd: number;
  results: SearchResult[];
};

const SNIPPET_MAX = 320;

function formatScore(value: number | null): string {
  return value === null ? '—' : value.toFixed(4);
}

function Score({
  label,
  value,
  primary = false,
}: { label: string; value: string; primary?: boolean }) {
  return (
    <div
      className={`rounded-lg border p-2 ${primary ? 'border-foreground/30' : 'border-foreground/10'}`}
    >
      <dt className="text-[10px] uppercase tracking-wide text-foreground/70">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm tabular-nums">{value}</dd>
    </div>
  );
}

export function SearchBox() {
  const t = useTranslations('search');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<SearchResponse | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length === 0 || busy) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed }),
      });
      if (!res.ok) {
        throw new Error('search');
      }
      setResponse((await res.json()) as SearchResponse);
    } catch {
      setError(t('errorGeneric'));
      setResponse(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('placeholder')}
          aria-label={t('title')}
          className="flex-1 rounded-lg border border-foreground/20 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-foreground/50"
        />
        <button
          type="submit"
          disabled={busy || query.trim().length === 0}
          className="rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? t('searching') : t('submit')}
        </button>
      </form>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {response && !error && (
        <div className="flex flex-col gap-4">
          {response.results.length === 0 ? (
            <p className="text-sm text-foreground/70">{t('empty')}</p>
          ) : (
            <>
              <p className="text-xs text-foreground/70">
                {t('cost')}:{' '}
                <span className="font-mono tabular-nums">${response.costUsd.toFixed(6)}</span>
              </p>
              <ol className="flex flex-col gap-4">
                {response.results.map((result, index) => (
                  <li
                    key={result.chunkId}
                    className="flex flex-col gap-3 rounded-xl border border-foreground/10 p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-foreground/70">#{index + 1}</span>
                      <span className="rounded-full border border-foreground/15 px-2.5 py-0.5 text-xs text-foreground/70">
                        {result.page === null ? t('noPage') : t('page', { n: result.page })}
                      </span>
                    </div>
                    <p className="whitespace-pre-line text-sm text-foreground/80">
                      {result.content.length > SNIPPET_MAX
                        ? `${result.content.slice(0, SNIPPET_MAX)}…`
                        : result.content}
                    </p>
                    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Score
                        label={t('score.rerank')}
                        value={formatScore(result.scores.rerank)}
                        primary
                      />
                      <Score label={t('score.rrf')} value={formatScore(result.scores.rrf)} />
                      <Score label={t('score.cosine')} value={formatScore(result.scores.cosine)} />
                      <Score label={t('score.bm25')} value={formatScore(result.scores.bm25)} />
                    </dl>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  );
}
