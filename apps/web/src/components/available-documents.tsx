'use client';

import type { ReadyDocument } from '@/lib/documents';
import { useTranslations } from 'next-intl';

// Read-only list of the documents the user can ask about, shown on chat/search so
// they know what's in scope. Informational only — no open/delete actions (that's
// the home "your files" list). Renders nothing when there are no ready documents.
// Client component so it can sit inside the chat's two-column layout (ChatBox).
export function AvailableDocuments({ documents }: { documents: ReadyDocument[] }) {
  const t = useTranslations('documents');

  if (documents.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-foreground/10 p-4">
      <span className="font-medium text-foreground/70 text-xs tracking-wide">{t('available')}</span>
      <ul className="flex flex-wrap gap-2">
        {documents.map((doc) => (
          <li
            key={doc.id}
            title={doc.filename}
            className="max-w-full truncate rounded-full border border-foreground/15 px-3 py-1 font-mono text-foreground/80 text-xs"
          >
            {doc.filename}
          </li>
        ))}
      </ul>
    </div>
  );
}
