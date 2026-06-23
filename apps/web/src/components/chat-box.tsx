'use client';

import { CitationPanel } from '@/components/citation-panel';
import { type ChatUsage, CostLatencyBar } from '@/components/cost-latency-bar';
import { ErrorState, type ErrorVariant } from '@/components/error-state';
import { BYOK_STORAGE_KEY } from '@/lib/byok';
import { rehypeCitations } from '@/lib/rehype-citations';
import { useChat } from '@ai-sdk/react';
import type { Citation, CitationSource } from '@doc-ai-chat/prompts/rag-answer';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

// The route sends the citation sources (label -> chunk/page) and per-response
// usage (cost/latency, task 7) as message metadata.
type ChatMetadata = { sources?: CitationSource[]; usage?: ChatUsage };
type ChatUIMessage = UIMessage<ChatMetadata>;

// Server error codes that map to an ErrorState variant. The route returns the
// code in the response body (gate errors) or via the stream's onError (provider
// errors); both reach useChat's `error.message`, so a substring scan covers both.
// `rate_limit_exceeded`/`chat_failed` have no dedicated variant → generic fallback.
const CHAT_ERROR_CODES: ErrorVariant[] = [
  'out_of_credit',
  'invalid_byok',
  'model_overload',
  'project_over_capacity',
  'weekly_lock',
  'daily_limit',
  'network_error',
];

function mapChatError(error: Error | undefined): ErrorVariant | null {
  if (!error) {
    return null;
  }
  const message = (error.message ?? '').toLowerCase();
  for (const code of CHAT_ERROR_CODES) {
    if (message.includes(code)) {
      return code;
    }
  }
  if (message.includes('failed to fetch') || message.includes('network')) {
    return 'network_error';
  }
  return null;
}

// Joins a message's text parts; reasoning and other parts are not rendered.
function messageText(message: ChatUIMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

// useChat posts the full UIMessage list; the route wants { message, history }.
// The latest turn is the question we retrieve on; the rest is conversation
// history (text only). History lives client-side and is sent each request.
const transport = new DefaultChatTransport<ChatUIMessage>({
  api: '/api/chat',
  // BYOK: attach the user's Anthropic key from sessionStorage as a per-request
  // header (read fresh each send). Never stored server-side; absent → free tier.
  headers: (): Record<string, string> => {
    if (typeof window === 'undefined') {
      return {};
    }
    const key = window.sessionStorage.getItem(BYOK_STORAGE_KEY);
    return key ? { 'x-user-api-key': key } : {};
  },
  prepareSendMessagesRequest: ({ messages }) => {
    const last = messages.at(-1);
    const history = messages
      .slice(0, -1)
      .map((message) => ({ role: message.role, content: messageText(message) }))
      .filter(
        (message) =>
          (message.role === 'user' || message.role === 'assistant') && message.content.length > 0,
      );
    return { body: { message: last ? messageText(last) : '', history } };
  },
});

function CitationChip({
  citation,
  onOpen,
}: {
  citation: Citation;
  onOpen: (citation: Citation) => void;
}) {
  const t = useTranslations('chat');
  const aria =
    citation.page === null
      ? t('citationAriaNoPage', { label: citation.label })
      : t('citationAria', { label: citation.label, page: citation.page });
  return (
    <button
      type="button"
      onClick={() => onOpen(citation)}
      title={aria}
      aria-label={aria}
      className="mx-0.5 inline-flex cursor-pointer select-none items-center rounded border border-foreground/25 px-1 align-super font-medium text-[10px] text-foreground/70 transition-colors hover:bg-foreground/10"
    >
      {citation.label}
    </button>
  );
}

// Renders an assistant answer as markdown (bold, lists, paragraphs) with the [n]
// citation markers turned into chips. rehypeCitations rewrites each [n] into a
// <cite data-label> node; the `cite` component below resolves it to its source.
function AssistantAnswer({
  text,
  sources,
  onOpenCitation,
}: {
  text: string;
  sources: CitationSource[];
  onOpenCitation: (citation: Citation) => void;
}) {
  const components: Components = {
    cite: ({ node }) => {
      const raw = node?.properties?.dataLabel;
      const label = Number(raw);
      const source = Number.isInteger(label) ? sources[label - 1] : undefined;
      return source ? (
        <CitationChip citation={{ label, ...source }} onOpen={onOpenCitation} />
      ) : (
        <>{`[${raw ?? ''}]`}</>
      );
    },
    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
    ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
    ol: ({ children }) => (
      <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
    ),
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    a: ({ children, href }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2"
      >
        {children}
      </a>
    ),
    code: ({ children }) => (
      <code className="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[0.85em]">
        {children}
      </code>
    ),
    h1: ({ children }) => (
      <h3 className="mt-3 mb-1 font-semibold text-base first:mt-0">{children}</h3>
    ),
    h2: ({ children }) => (
      <h3 className="mt-3 mb-1 font-semibold text-base first:mt-0">{children}</h3>
    ),
    h3: ({ children }) => (
      <h3 className="mt-3 mb-1 font-semibold text-sm first:mt-0">{children}</h3>
    ),
  };
  return (
    <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeCitations]} components={components}>
      {text}
    </Markdown>
  );
}

// Animated dots shown while the model is working but hasn't streamed any answer
// text yet — covers both the pre-stream wait and DeepSeek's reasoning phase
// (reasoning parts aren't rendered, so the bubble would otherwise sit empty).
function TypingIndicator() {
  const t = useTranslations('chat');
  return (
    <div className="flex flex-col gap-1">
      <span className="font-medium text-foreground/70 text-xs">{t('assistant')}</span>
      <div
        aria-label={t('thinking')}
        className="flex w-fit items-center gap-1 self-start rounded-xl border border-foreground/10 px-4 py-3.5"
      >
        <span className="size-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:-0.3s] motion-reduce:animate-none" />
        <span className="size-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:-0.15s] motion-reduce:animate-none" />
        <span className="size-1.5 animate-bounce rounded-full bg-foreground/40 motion-reduce:animate-none" />
      </div>
    </div>
  );
}

export function ChatBox() {
  const t = useTranslations('chat');
  const { messages, sendMessage, status, error, regenerate } = useChat<ChatUIMessage>({
    transport,
  });
  const [input, setInput] = useState('');
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const busy = status === 'submitted' || status === 'streaming';
  const errorVariant = mapChatError(error);
  const usages = messages
    .map((message) => message.metadata?.usage)
    .filter((usage): usage is ChatUsage => usage !== undefined);
  const lastMessage = messages.at(-1);
  const awaitingAnswer =
    busy &&
    (lastMessage === undefined ||
      lastMessage.role !== 'assistant' ||
      messageText(lastMessage).trim().length === 0);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (text.length === 0 || busy) {
      return;
    }
    void sendMessage({ text });
    setInput('');
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <CostLatencyBar usages={usages} />
      <div className="flex flex-col gap-4">
        {messages.length === 0 && <p className="text-foreground/60 text-sm">{t('empty')}</p>}

        {messages.map((message) => {
          const text = messageText(message);
          // Suppress an assistant bubble that has no text yet — the typing
          // indicator below stands in until the first token arrives.
          if (message.role === 'assistant' && text.length === 0) {
            return null;
          }
          const isUser = message.role === 'user';
          return (
            <div key={message.id} className="flex flex-col gap-1">
              <span className="font-medium text-foreground/70 text-xs">
                {isUser ? t('you') : t('assistant')}
              </span>
              <div
                className={`rounded-xl border px-4 py-2.5 text-sm leading-relaxed ${
                  isUser
                    ? 'self-end whitespace-pre-wrap border-foreground/15 bg-foreground/5'
                    : 'self-start border-foreground/10'
                }`}
              >
                {isUser ? (
                  text
                ) : (
                  <AssistantAnswer
                    text={text}
                    sources={message.metadata?.sources ?? []}
                    onOpenCitation={setActiveCitation}
                  />
                )}
              </div>
            </div>
          );
        })}

        {awaitingAnswer && <TypingIndicator />}
        {error &&
          (errorVariant ? (
            <ErrorState variant={errorVariant} onRetry={() => regenerate()} />
          ) : (
            <p className="text-red-500 text-sm">{t('errorGeneric')}</p>
          ))}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t('placeholder')}
          aria-label={t('title')}
          className="flex-1 rounded-lg border border-foreground/20 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-foreground/50"
        />
        <button
          type="submit"
          disabled={busy || input.trim().length === 0}
          className="rounded-lg bg-foreground px-5 py-2.5 font-medium text-background text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? t('thinking') : t('send')}
        </button>
      </form>

      <CitationPanel citation={activeCitation} onClose={() => setActiveCitation(null)} />
    </div>
  );
}
