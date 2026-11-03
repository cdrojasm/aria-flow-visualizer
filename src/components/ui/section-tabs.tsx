import { cn } from "@/lib/utils";

type SectionTab<T extends string> = { key: T; label: string; dirty?: boolean };

type SectionTabsProps<T extends string> = {
  label: string;
  items: SectionTab<T>[];
  value: T;
  onValueChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
  variant?: "underline" | "pills";
};

/** Shared section navigation used by configuration and the model wizard. */
export function SectionTabs<T extends string>({
  label,
  items,
  value,
  onValueChange,
  disabled = false,
  className,
  variant = "underline",
}: SectionTabsProps<T>) {
  return (
    <nav
      aria-label={label}
      className={cn(
        variant === "pills"
          ? "flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1.5"
          : "flex shrink-0 items-center gap-1 overflow-x-auto overflow-y-hidden border-b border-border",
        className,
      )}
    >
      {items.map((tab) => (
        <button
          key={tab.key}
          type="button"
          aria-current={value === tab.key ? "page" : undefined}
          disabled={disabled}
          onClick={() => onValueChange(tab.key)}
          className={cn(
            "relative shrink-0 whitespace-nowrap px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:opacity-40 disabled:cursor-not-allowed",
            value === tab.key
              ? variant === "pills"
                ? "rounded-lg bg-primary text-white"
                : "border-b-2 border-primary -mb-px text-primary"
              : variant === "pills"
                ? "rounded-lg text-text-secondary hover:text-text-primary"
                : "border-b-2 border-transparent -mb-px text-text-secondary hover:text-text-primary",
          )}
        >
          {tab.label}
          {tab.dirty && (
            <>
              <span
                aria-hidden="true"
                className="absolute top-1.5 right-0.5 h-1.5 w-1.5 rounded-full bg-warning"
              />
              <span className="sr-only"> · Cambios sin guardar</span>
            </>
          )}
        </button>
      ))}
    </nav>
  );
}
