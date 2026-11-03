import { Info } from "lucide-react";
import type { ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function Hint({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    // Sin área de gracia: al pasar a un disparador vecino se abre su tooltip y se cierra el anterior.
    <Tooltip disableHoverableContent>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-xs break-words">{content}</TooltipContent>
    </Tooltip>
  );
}

export function InfoHint({ content }: { content: ReactNode }) {
  return (
    <Hint content={content}>
      <span
        tabIndex={0}
        aria-label={typeof content === "string" ? content : "Más información"}
        className="inline-grid place-items-center align-middle text-text-secondary hover:text-primary focus-visible:text-primary cursor-help"
      >
        <Info className="h-3 w-3" />
      </span>
    </Hint>
  );
}
