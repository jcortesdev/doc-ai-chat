'use client';

import { ErrorState, type ErrorVariant } from '@/components/error-state';
import { useRouter } from '@/i18n/navigation';
import { BYOK_STORAGE_KEY } from '@/lib/byok';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

const MAX_BYTES = 10 * 1024 * 1024;

type PresignResponse = { documentId: string; uploadUrl: string };

// 'type' (wrong file type) keeps its plain message; 'generic' falls back; a known
// variant (file_too_large / weekly_lock / project_over_capacity) renders ErrorState.
type UploadError = ErrorVariant | 'type' | 'generic';

export function PdfUploader() {
  const t = useTranslations('upload');
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<UploadError | null>(null);

  async function handleFile(file: File) {
    setError(null);
    if (file.type !== 'application/pdf') {
      setError('type');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('file_too_large');
      return;
    }

    setBusy(true);
    try {
      // BYOK: forward the user's key (sessionStorage) so a trial-expired BYOK user
      // can still upload. Read fresh each time; absent → free tier.
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const byokKey = window.sessionStorage.getItem(BYOK_STORAGE_KEY);
      if (byokKey) {
        headers['x-user-api-key'] = byokKey;
      }

      const presign = await fetch('/api/uploads/presign', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          filename: file.name,
          contentType: 'application/pdf',
          size: file.size,
        }),
      });
      if (!presign.ok) {
        const body = (await presign.json().catch(() => null)) as { error?: string } | null;
        const code = body?.error;
        setError(
          code === 'weekly_lock' || code === 'project_over_capacity' || code === 'file_too_large'
            ? code
            : 'generic',
        );
        setBusy(false);
        return;
      }
      const { documentId, uploadUrl } = (await presign.json()) as PresignResponse;

      const upload = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
        body: file,
      });
      if (!upload.ok) {
        throw new Error('upload');
      }

      const finalize = await fetch('/api/ingest/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      });
      if (!finalize.ok) {
        throw new Error('finalize');
      }

      router.push(`/ingest/${documentId}`);
    } catch {
      setError('generic');
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) {
            void handleFile(file);
          }
        }}
        disabled={busy}
        className={`flex flex-col items-center gap-1 rounded-xl border border-dashed px-6 py-10 text-center transition-colors ${
          dragging
            ? 'border-foreground bg-foreground/5'
            : 'border-foreground/25 hover:border-foreground/50'
        } ${busy ? 'cursor-wait opacity-60' : 'cursor-pointer'}`}
      >
        <span className="font-medium">{busy ? t('uploading') : t('cta')}</span>
        <span className="text-xs text-foreground/70">{t('hint')}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleFile(file);
          }
        }}
      />
      {error === 'type' && <p className="text-sm text-red-500">{t('errorType')}</p>}
      {error === 'generic' && <p className="text-sm text-red-500">{t('errorGeneric')}</p>}
      {error && error !== 'type' && error !== 'generic' && <ErrorState variant={error} />}
    </div>
  );
}
