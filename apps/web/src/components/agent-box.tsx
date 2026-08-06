'use client';

import { AvailableDocuments } from '@/components/available-documents';
import { ErrorState, type ErrorVariant } from '@/components/error-state';
import { BYOK_STORAGE_KEY } from '@/lib/byok';
import type { ReadyDocument } from '@/lib/documents';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

// The route sends the run's tier/caps as message metadata on `start`, and the
// partial-answer flag + usage on `finish` (M6 task 5). `tier`/`maxIterations`
// are repeated on `finish` too (same belt-and-suspenders reason as chat's
// `sources`: whether message metadata merges or replaces across stream events
// isn't a contract we want to depend on).
type AgentUsage = { inputTokens: number; outputTokens: number; costUsd: number; latencyMs: number };
type AgentCapReason = 'max_iterations' | 'max_tokens' | 'max_wall_clock';
type AgentMetadata = {
  tier?: 'free' | 'pro';
  maxIterations?: number;
  capped?: boolean;
  capReason?: AgentCapReason | null;
  usage?: AgentUsage;
};
type AgentUIMessage = UIMessage<AgentMetadata>;

// The shapes agent-tools.ts's execute() functions return — kept in sync by hand
// (same posture as CitationSource elsewhere: this app has no cross-package type
// inference wired from the AI SDK tool definitions to the client yet). Only used
// for display, not validated — a shape drift just shows blank fields, never breaks.
type SearchChunksHit = {
  chunkId: string;
  documentId: string;
  documentLabel: string;
  chunkIndex: number;
  page: number | null;
  relevance: number;
  snippet: string;
};
type PassageChunk = {
  chunkId: string;
  chunkIndex: number;
  page: number | null;
  content: string;
};

const AGENT_ERROR_CODES: ErrorVariant[] = [
  'out_of_credit',
  'invalid_byok',
  'model_overload',
  'project_over_capacity',
  'weekly_lock',
  'agent_daily_limit',
  'network_error',
];

function mapAgentError(error: Error | undefined): ErrorVariant | null {
  if (!error) {
    return null;
  }
  const message = (error.message ?? '').toLowerCase();
  for (const code of AGENT_ERROR_CODES) {
    if (message.includes(code)) {
      return code;
    }
  }
  if (message.includes('failed to fetch') || message.includes('network')) {
    return 'network_error';
  }
  return null;
}

function messageText(message: AgentUIMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

// One request = one self-contained run (no server-side conversation, M6 route
// contract) — the route only ever reads the latest query, so no history is sent.
const transport = new DefaultChatTransport<AgentUIMessage>({
  api: '/api/agent',
  headers: (): Record<string, string> => {
    if (typeof window === 'undefined') {
      return {};
    }
    const key = window.sessionStorage.getItem(BYOK_STORAGE_KEY);
    return key ? { 'x-user-api-key': key } : {};
  },
  prepareSendMessagesRequest: ({ messages }) => {
    const last = messages.at(-1);
    const locale = typeof document !== 'undefined' ? document.documentElement.lang : 'en';
    return { body: { query: last ? messageText(last) : '', locale } };
  },
});

// Renders one text part as markdown (bold, lists, headings, paragraphs). Unlike
// ChatBox's AssistantAnswer, there's no citation-chip plugin — the agent prompt
// asks for plain-text page references ("(DocumentLabel, page N)"), not [n]
// markers, since context here comes from dynamic tool calls rather than a fixed,
// ordered <retrieved_context> list (M3's positional citation scheme doesn't
// apply to a multi-step tool loop).
const MARKDOWN_COMPONENTS: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
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
    <code className="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
  ),
  h1: ({ children }) => (
    <h3 className="mt-3 mb-1 font-semibold text-base first:mt-0">{children}</h3>
  ),
  h2: ({ children }) => (
    <h3 className="mt-3 mb-1 font-semibold text-base first:mt-0">{children}</h3>
  ),
  h3: ({ children }) => <h3 className="mt-3 mb-1 font-semibold text-sm first:mt-0">{children}</h3>,
  hr: () => <hr className="my-3 border-foreground/10" />,
};

function AgentText({ text }: { text: string }) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
      {text}
    </Markdown>
  );
}

function ToolStepCard({
  toolName,
  state,
  input,
  output,
  errorText,
}: {
  toolName: string;
  state: string;
  input: unknown;
  output: unknown;
  errorText?: string;
}) {
  const t = useTranslations('agent');
  const label = toolName === 'search_chunks' ? t('toolSearchChunks') : t('toolGetPassage');
  const stateLabel =
    state === 'output-available'
      ? t('toolDone')
      : state === 'output-error'
        ? t('toolError')
        : t('toolRunning');
  const stateClass =
    state === 'output-error'
      ? 'text-red-500'
      : state === 'output-available'
        ? 'text-foreground/50'
        : 'text-foreground/70';

  const searchInput = input as { query?: string } | undefined;
  const passageInput = input as { documentId?: string; chunkIndex?: number } | undefined;

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-mono font-medium text-foreground/80">{label}</span>
        <span className={stateClass}>{stateLabel}</span>
      </div>
      {toolName === 'search_chunks' && searchInput?.query && (
        <p className="text-foreground/60 italic">&ldquo;{searchInput.query}&rdquo;</p>
      )}
      {toolName === 'get_full_passage' && passageInput?.chunkIndex !== undefined && (
        <p className="text-foreground/60">chunk #{passageInput.chunkIndex}</p>
      )}
      {state === 'output-available' && toolName === 'search_chunks' && (
        <ul className="flex flex-col gap-1.5">
          {(output as SearchChunksHit[]).map((hit) => (
            <li
              key={hit.chunkId}
              className="border-foreground/10 border-t pt-1.5 first:border-t-0 first:pt-0"
            >
              <div className="flex items-center gap-2 font-medium text-foreground/80">
                <span className="truncate">{hit.documentLabel}</span>
                {hit.page !== null && <span className="text-foreground/50">p.{hit.page}</span>}
                <span className="ml-auto shrink-0 font-mono text-foreground/40">
                  {hit.relevance.toFixed(2)}
                </span>
              </div>
              <p className="text-foreground/50 leading-relaxed">{hit.snippet.slice(0, 200)}…</p>
            </li>
          ))}
        </ul>
      )}
      {state === 'output-available' && toolName === 'get_full_passage' && (
        <ul className="flex flex-col gap-1.5">
          {(output as PassageChunk[]).map((chunk) => (
            <li
              key={chunk.chunkId}
              className="border-foreground/10 border-t pt-1.5 first:border-t-0 first:pt-0"
            >
              <div className="font-medium text-foreground/80">
                #{chunk.chunkIndex}
                {chunk.page !== null && (
                  <span className="text-foreground/50"> · p.{chunk.page}</span>
                )}
              </div>
              <p className="text-foreground/50 leading-relaxed">{chunk.content.slice(0, 200)}…</p>
            </li>
          ))}
        </ul>
      )}
      {state === 'output-error' && <p className="text-red-500">{errorText}</p>}
    </div>
  );
}

function CapBadge({ reason }: { reason: AgentCapReason | null | undefined }) {
  const t = useTranslations('agent');
  const reasonLabel =
    reason === 'max_tokens'
      ? t('capReasonMaxTokens')
      : reason === 'max_wall_clock'
        ? t('capReasonMaxWallClock')
        : t('capReasonMaxIterations');
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700 text-xs dark:text-amber-400">
      {t('capBadge', { reason: reasonLabel })}
    </div>
  );
}

function TypingIndicator() {
  const t = useTranslations('agent');
  return (
    <div
      aria-label={t('thinking')}
      className="flex w-fit items-center gap-1 self-start rounded-xl border border-foreground/10 px-4 py-3.5"
    >
      <span className="size-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:-0.3s] motion-reduce:animate-none" />
      <span className="size-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:-0.15s] motion-reduce:animate-none" />
      <span className="size-1.5 animate-bounce rounded-full bg-foreground/40 motion-reduce:animate-none" />
    </div>
  );
}

// Ephemeral, client-only transcript persistence — same posture as ChatBox
// (localStorage only, scoped per user, never reaches the server).
function agentStorageKey(userId: string): string {
  return `docai:agent:${userId}`;
}

export function AgentBox({ documents, userId }: { documents: ReadyDocument[]; userId: string }) {
  const t = useTranslations('agent');
  const storageKey = agentStorageKey(userId);
  const { messages, setMessages, sendMessage, status, error, regenerate } = useChat<AgentUIMessage>(
    {
      transport,
    },
  );
  const [input, setInput] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const busy = status === 'submitted' || status === 'streaming';
  const errorVariant = mapAgentError(error);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        setMessages(JSON.parse(stored) as AgentUIMessage[]);
      }
    } catch {
      // Corrupt/unreadable storage — start fresh.
    }
    setHydrated(true);
  }, [setMessages, storageKey]);

  useEffect(() => {
    if (!hydrated || busy) {
      return;
    }
    if (messages.length === 0) {
      window.localStorage.removeItem(storageKey);
    } else {
      window.localStorage.setItem(storageKey, JSON.stringify(messages));
    }
  }, [messages, busy, hydrated, storageKey]);

  function handleNewRun() {
    setMessages([]);
    window.localStorage.removeItem(storageKey);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (text.length === 0 || busy) {
      return;
    }
    void sendMessage({ text });
    setInput('');
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const tier = lastAssistant?.metadata?.tier;
  const maxIterations = lastAssistant?.metadata?.maxIterations;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[260px_minmax(0,1fr)] xl:gap-8">
      <aside className="flex flex-col gap-4 xl:sticky xl:top-6 xl:self-start">
        {messages.length > 0 && (
          <button
            type="button"
            onClick={handleNewRun}
            className="w-fit rounded-lg border border-foreground/20 px-3 py-1.5 font-medium text-foreground/70 text-xs transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            {t('newRun')}
          </button>
        )}
        {tier && maxIterations !== undefined && (
          <p className="text-foreground/50 text-xs">
            {tier === 'pro'
              ? t('tierPro', { n: maxIterations })
              : t('tierFree', { n: maxIterations })}
          </p>
        )}
        <AvailableDocuments documents={documents} />
      </aside>

      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-col gap-5">
          {messages.length === 0 && <p className="text-foreground/60 text-sm">{t('empty')}</p>}

          {messages.map((message) => {
            const isUser = message.role === 'user';
            if (isUser) {
              return (
                <div key={message.id} className="flex flex-col gap-1">
                  <span className="self-end font-medium text-foreground/70 text-xs">
                    {t('you')}
                  </span>
                  <div className="self-end whitespace-pre-wrap rounded-xl border border-foreground/15 bg-foreground/5 px-4 py-2.5 text-sm leading-relaxed">
                    {messageText(message)}
                  </div>
                </div>
              );
            }

            const usage = message.metadata?.usage;
            const capped = message.metadata?.capped;

            return (
              <div key={message.id} className="flex flex-col gap-1">
                <span className="font-medium text-foreground/70 text-xs">{t('assistant')}</span>
                <div className="flex flex-col gap-2 rounded-xl border border-foreground/10 px-4 py-3">
                  {message.parts.map((part, i) => {
                    if (part.type === 'text') {
                      return part.text.length === 0 ? null : (
                        <div
                          // biome-ignore lint/suspicious/noArrayIndexKey: parts are append-only and never reordered within a message
                          key={i}
                          className="text-sm leading-relaxed"
                        >
                          <AgentText text={part.text} />
                        </div>
                      );
                    }
                    if (part.type.startsWith('tool-')) {
                      const toolPart = part as unknown as {
                        toolCallId: string;
                        state: string;
                        input: unknown;
                        output?: unknown;
                        errorText?: string;
                      };
                      return (
                        <ToolStepCard
                          key={toolPart.toolCallId}
                          toolName={part.type.slice('tool-'.length)}
                          state={toolPart.state}
                          input={toolPart.input}
                          output={toolPart.output}
                          errorText={toolPart.errorText}
                        />
                      );
                    }
                    return null;
                  })}
                  {capped && <CapBadge reason={message.metadata?.capReason} />}
                  {usage && (
                    <p className="text-foreground/40 text-xs">
                      {t('usageCost')} ${usage.costUsd.toFixed(6)} · {t('usageLatency')}{' '}
                      {(usage.latencyMs / 1000).toFixed(1)}s
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          {busy &&
            (messages.at(-1)?.role !== 'assistant' || messages.at(-1)?.parts.length === 0) && (
              <TypingIndicator />
            )}
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

        <p className="text-foreground/60 text-xs">{t('privacyNote')}</p>
      </div>
    </div>
  );
}
