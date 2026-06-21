'use client';

import { type Citation, citationSearchPhrase } from '@doc-ai-chat/prompts/rag-answer';
import { useTranslations } from 'next-intl';
import { type MouseEvent, useEffect, useRef } from 'react';

// Builds the same-origin proxy URL with the native PDF viewer's deep-link
// fragment. `#page=N` jumps to the page in every browser's PDF viewer (the
// guaranteed baseline). `:~:text=phrase` is a W3C Text Fragment (scroll-to-text)
// — Chromium PDF viewers honor it and highlight the match; others ignore it and
// just land on the page. We use the standard rather than UA-sniffing per browser;
// the panel shows a disclaimer that the in-PDF highlight is browser-dependent.
// Legacy `#search=` is Firefox-only (PDFium ignores it), so we don't use it.
function pdfUrl(citation: Citation): string {
  const base = `/api/documents/${citation.documentId}/pdf`;
  const pagePart = citation.page === null ? '' : `page=${citation.page}`;
  const phrase = citationSearchPhrase(citation.content);
  const textPart = phrase ? `:~:text=${encodeURIComponent(phrase)}` : '';
  if (!pagePart && !textPart) {
    return base;
  }
  return `${base}#${pagePart}${pagePart && textPart ? '&' : ''}${textPart}`;
}

export function CitationPanel({
  citation,
  onClose,
}: {
  citation: Citation | null;
  onClose: () => void;
}) {
  const t = useTranslations('chat');
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Drive the native <dialog> from the `citation` prop. showModal() gives focus
  // trapping + Esc handling for free; `cancel`/`close` events report back up.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (citation && !dialog.open) {
      dialog.showModal();
    } else if (!citation && dialog.open) {
      dialog.close();
    }
  }, [citation]);

  // Close when the click lands on the backdrop area (the dialog fills the
  // viewport; the inner panel stops propagation).
  function onBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) {
      onClose();
    }
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click is a mouse-only convenience; keyboard users close via Esc (native onCancel) or the focusable Close button.
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={onClose}
      onClick={onBackdropClick}
      className="m-0 h-dvh max-h-dvh w-dvw max-w-none bg-transparent p-0 backdrop:bg-black/40"
    >
      {citation && (
        <div className="ml-auto flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto border-foreground/10 border-l bg-background p-6 text-foreground shadow-xl">
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-full border border-foreground/15 px-2.5 py-0.5 text-foreground/70 text-xs">
              {citation.page === null
                ? t('citationAriaNoPage', { label: citation.label })
                : t('citationAria', { label: citation.label, page: citation.page })}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-foreground/60 text-sm transition-colors hover:text-foreground"
            >
              {t('close')}
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <span className="font-medium text-foreground/50 text-xs">{t('sourcePassage')}</span>
            <blockquote className="whitespace-pre-wrap rounded-lg border border-foreground/10 border-l-2 border-l-foreground/40 bg-foreground/5 p-4 text-foreground/80 text-sm leading-relaxed">
              {citation.content}
            </blockquote>
          </div>

          <a
            href={pdfUrl(citation)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-fit items-center rounded-lg bg-foreground px-4 py-2 font-medium text-background text-sm transition-opacity hover:opacity-90"
          >
            {citation.page === null ? t('openPdfNoPage') : t('openPdf', { page: citation.page })}
          </a>

          <p className="text-foreground/50 text-xs">{t('pdfHighlightNote')}</p>
        </div>
      )}
    </dialog>
  );
}
