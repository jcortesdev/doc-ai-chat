'use client';

import type { DocumentListItem } from '@/lib/documents';
import { useFormatter, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

// Lists the caller's uploaded PDFs with a two-step inline delete (Delete →
// Confirm/Cancel, no blocking window.confirm). The server passes the initial rows;
// a successful DELETE drops the row from local state so the list refreshes without
// a full reload. Deleting removes the R2 object and the document (chunks cascade).
export function DocumentsList({ documents }: { documents: DocumentListItem[] }) {
  const t = useTranslations('files');
  const tStatus = useTranslations('ingest');
  const format = useFormatter();
  const router = useRouter();
  const [items, setItems] = useState(documents);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeletingId(id);
    setErrorId(null);
    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        throw new Error('delete failed');
      }
      setItems((prev) => prev.filter((doc) => doc.id !== id));
      // Re-render the server components so the topbar's Chat/Search gate (and the
      // home files section) reflect the new count — e.g. deleting your last ready
      // document disables those links again.
      router.refresh();
    } catch {
      setErrorId(id);
    } finally {
      setDeletingId(null);
      setConfirmingId(null);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-foreground/10 p-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-base">{t('title')}</h2>
        <p className="text-foreground/70 text-sm">{t('hint')}</p>
      </div>

      {items.length === 0 ? (
        <p className="text-foreground/60 text-sm">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((doc) => {
            const isConfirming = confirmingId === doc.id;
            const isDeleting = deletingId === doc.id;
            return (
              <li
                key={doc.id}
                className="flex flex-col gap-2 rounded-lg border border-foreground/10 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-medium text-sm">{doc.filename}</span>
                  <span className="text-foreground/60 text-xs">
                    {tStatus(`status.${doc.status}`)}
                    {doc.pageCount !== null && ` · ${t('pages', { count: doc.pageCount })}`}
                    {` · ${t('expires', { date: format.dateTime(doc.expiresAt, { dateStyle: 'medium' }) })}`}
                  </span>
                  {errorId === doc.id && (
                    <span className="text-red-500 text-xs">{t('deleteError')}</span>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {isConfirming ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleDelete(doc.id)}
                        disabled={isDeleting}
                        className="rounded-md bg-red-600 px-3 py-1.5 font-medium text-white text-xs transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        {isDeleting ? t('deleting') : t('confirm')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        disabled={isDeleting}
                        className="rounded-md border border-foreground/20 px-3 py-1.5 font-medium text-xs transition-colors hover:bg-foreground/5 disabled:opacity-50"
                      >
                        {t('cancel')}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setErrorId(null);
                        setConfirmingId(doc.id);
                      }}
                      className="rounded-md border border-foreground/20 px-3 py-1.5 font-medium text-xs transition-colors hover:bg-foreground/5"
                    >
                      {t('delete')}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
