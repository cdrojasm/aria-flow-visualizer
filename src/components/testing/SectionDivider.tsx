export function SectionDivider({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`relative h-[3px] rounded-full overflow-hidden bg-primary/20 ${className}`}
    >
      <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,var(--color-primary),transparent)] bg-size-[40%_100%] bg-no-repeat animate-divider-shine motion-reduce:animate-none" />
    </div>
  );
}
