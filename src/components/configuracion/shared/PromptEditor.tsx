import { useRef, type UIEvent } from "react";

/* ─── Highlighted f-string prompt editor (Phase 4) ──────
   Dependency-free: a transparent-text <textarea> layered exactly over a
   same-font/same-padding <pre> that renders the same string with
   {variable} tokens highlighted. Scroll position is synced from the
   textarea to the <pre> underneath on every scroll event. Drop-in
   replacement for a plain <textarea>, adopted only where explicitly
   requested (Classification + Adversarial prompts) - not retrofitted
   into every other prompt in the app. */

const TOKEN_PATTERN = /(\{[^{}]+\})/g;

function renderHighlighted(value: string) {
  const parts = value.split(TOKEN_PATTERN);
  return parts.map((part, i) =>
    TOKEN_PATTERN.test(part) ? (
      <span key={i} className="text-primary font-medium bg-primary/10 rounded px-0.5">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function PromptEditor({
  value,
  onChange,
  rows = 4,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
}) {
  const preRef = useRef<HTMLPreElement>(null);

  const syncScroll = (e: UIEvent<HTMLTextAreaElement>) => {
    if (preRef.current) {
      preRef.current.scrollTop = e.currentTarget.scrollTop;
      preRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const sharedStyle = "w-full rounded-md border border-border px-3 py-2 text-[13px] font-sans leading-[1.5] whitespace-pre-wrap break-words";

  return (
    <div className="relative">
      <pre
        ref={preRef}
        aria-hidden
        className={`${sharedStyle} absolute inset-0 m-0 overflow-hidden border-transparent pointer-events-none text-text-primary`}
        style={{ height: `${rows * 1.5 + 1}em` }}
      >
        {value.length === 0 ? "" : renderHighlighted(value)}
      </pre>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        rows={rows}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck={false}
        className={`${sharedStyle} relative bg-transparent text-transparent caret-text-primary resize-none focus:outline-none focus:border-primary disabled:opacity-50 placeholder:text-text-secondary`}
      />
    </div>
  );
}
