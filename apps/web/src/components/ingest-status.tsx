'use client';

import type { DocumentStatus } from '@/lib/documents';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

const TERMINAL_STATUSES = new Set(['ready', 'failed']);
// Stop polling after this long so a document stuck in `processing` (e.g. the
// worker is down) doesn't poll forever in an open tab.
const MAX_POLL_MS = 3 * 60 * 1000;

// Backoff: fast at first, then ease off for slow ingests.
function pollDelay(attempt: number): number {
  if (attempt < 10) {
    return 1000;
  }
  if (attempt < 30) {
    return 2000;
  }
  return 5000;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-foreground/10 p-4">
      <div className="text-xs uppercase tracking-wide text-foreground/50">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function IngestStatus({ initial }: { initial: DocumentStatus }) {
  const t = useTranslations('ingest');
  const [doc, setDoc] = useState(initial);
  const [timedOut, setTimedOut] = useState(false);

  const isTerminal = TERMINAL_STATUSES.has(doc.status);

  useEffect(() => {
    if (TERMINAL_STATUSES.has(doc.status)) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempt = 0;
    const startedAt = Date.now();

    const schedule = (delay: number) => {
      timer = setTimeout(tick, delay);
    };

    const tick = async () => {
      if (cancelled) {
        return;
      }
      if (Date.now() - startedAt > MAX_POLL_MS) {
        setTimedOut(true);
        return;
      }
      // Pause network requests while the tab is hidden; re-check cheaply.
      if (document.hidden) {
        schedule(2000);
        return;
      }
      try {
        const response = await fetch(`/api/ingest/${doc.id}/status`);
        if (response.ok) {
          const next = (await response.json()) as DocumentStatus;
          if (cancelled) {
            return;
          }
          setDoc(next);
          if (TERMINAL_STATUSES.has(next.status)) {
            return;
          }
        }
      } catch {
        // Transient error — keep polling.
      }
      attempt += 1;
      schedule(pollDelay(attempt));
    };

    schedule(pollDelay(attempt));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [doc.id, doc.status]);

  const latencyPerChunk =
    doc.latencyMs !== null && doc.chunkCount > 0
      ? `${(doc.latencyMs / doc.chunkCount).toFixed(0)} ms`
      : '—';

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-foreground/50">{t('title')}</span>
        <h1 className="break-all font-mono text-xl font-semibold">{doc.filename}</h1>
      </div>

      <div className="flex items-center gap-3">
        <span
          data-status={doc.status}
          className="rounded-full border border-foreground/15 px-3 py-1 text-sm font-medium"
        >
          {t(`status.${doc.status}`)}
        </span>
        {!isTerminal && !timedOut && (
          <span
            className="size-4 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground"
            aria-hidden="true"
          />
        )}
        {!isTerminal && (
          <span className="text-sm text-foreground/50">
            {timedOut ? t('timeoutHint') : t('processingHint')}
          </span>
        )}
      </div>

      {doc.status === 'failed' ? (
        <p className="rounded-lg border border-foreground/10 p-4 text-sm text-foreground/70">
          {doc.errorVariant === 'file_too_large' ? t('failedFileTooLarge') : t('failedHint')}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Metric label={t('metric.pages')} value={doc.pageCount?.toString() ?? '—'} />
          <Metric label={t('metric.chunks')} value={doc.chunkCount.toString()} />
          <Metric label={t('metric.embeddings')} value={doc.chunkCount.toString()} />
          <Metric label={t('metric.tokens')} value={doc.totalTokens.toLocaleString()} />
          <Metric label={t('metric.cost')} value={`$${doc.costUsd}`} />
          <Metric label={t('metric.latencyPerChunk')} value={latencyPerChunk} />
        </div>
      )}
    </main>
  );
}
