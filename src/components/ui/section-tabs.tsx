import { cn } from "@/lib/utils";

type SectionTab<T extends string> = { key: T; label: string; dirty?: boolean };

type SectionTabsProps<T extends string> = {
  label: string;
  items: SectionTab<T>[];
  value: T;
  onValueChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
};

/** Shared section navigation used by configuration and the model wizard. */
export function SectionTabs<T extends string>({
  label,
  items,
  value,
  onValueChange,
  disabled = false,
  className,
}: SectionTabsProps<T>) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "flex shrink-0 items-center gap-1 overflow-x-auto overflow-y-hidden border-b border-border",
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
            "relative shrink-0 whitespace-nowrap px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:opacity-40 disabled:cursor-not-allowed",
            value === tab.key
              ? "border-primary text-primary"
              : "border-transparent text-text-secondary hover:text-text-primary",
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
