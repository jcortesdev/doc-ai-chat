import { getTranslations } from 'next-intl/server';

// A small "?" affordance next to a page title. Hovering or focusing it reveals a
// tooltip explaining what the page does — compact, so it never competes with the
// page's actual content. Pure CSS (group-hover / group-focus-within), no client
// JS; the button is focusable so keyboard and tap users get the tooltip too.
// `align` decides which way the tooltip opens: 'start' (default) anchors its left
// edge to the icon (for left-of-content icons); 'end' anchors the right edge, so
// an icon near the screen's right edge (e.g. the home title) stays on-screen.
export async function PageHelp({
  body,
  align = 'start',
}: {
  body: string;
  align?: 'start' | 'end';
}) {
  const t = await getTranslations('help');
  const side = align === 'end' ? 'right-0' : 'left-0';

  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={t('summary')}
        className="flex size-5 items-center justify-center rounded-full border border-foreground/25 font-medium text-[11px] text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground"
      >
        ?
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none invisible absolute top-full ${side} z-20 mt-2 w-64 max-w-[calc(100vw-3rem)] rounded-lg border border-foreground/10 bg-background p-3 text-left font-normal text-foreground/70 text-xs normal-case leading-relaxed tracking-normal opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100`}
      >
        {body}
      </span>
    </span>
  );
}
