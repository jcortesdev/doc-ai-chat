'use client';

import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

const MAX_BYTES = 10 * 1024 * 1024;

type PresignResponse = { documentId: string; uploadUrl: string };

export function PdfUploader() {
  const t = useTranslations('upload');
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    if (file.type !== 'application/pdf') {
      setError(t('errorType'));
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(t('errorSize'));
      return;
    }

    setBusy(true);
    try {
      const presign = await fetch('/api/uploads/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: 'application/pdf',
          size: file.size,
        }),
      });
      if (!presign.ok) {
        throw new Error('presign');
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
      setError(t('errorGeneric'));
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
        <span className="text-xs text-foreground/50">{t('hint')}</span>
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
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
