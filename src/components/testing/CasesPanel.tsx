import { useMemo, useState, type ReactNode } from "react";

import type { TestRunDetailResponse } from "@/lib/api/testing.functions";

import { CaseList } from "./CaseList";
import { ALL_OUTCOMES, buildOutcomeGroups, caseOutcomeKey } from "./caseStatus";
import { CaseStatusFilters } from "./CaseStatusFilters";
import { SectionDivider } from "./SectionDivider";

export function CasesPanel({
  run,
  selectedCaseId,
  onSelectCase,
  children,
}: {
  run: TestRunDetailResponse;
  selectedCaseId: string | null;
  onSelectCase: (workflowExecutionId: string) => void;
  children: ReactNode;
}) {
  const [outcome, setOutcome] = useState(ALL_OUTCOMES);
  const [query, setQuery] = useState("");
  const cases = run.cases;

  const caseNumbers = useMemo(
    () => new Map(cases.map((c, index) => [c.workflow_execution_id, index + 1])),
    [cases],
  );
  const groups = useMemo(() => buildOutcomeGroups(cases), [cases]);
  const visibleCases = useMemo(() => {
    const term = query.trim().toLowerCase();
    return cases.filter(
      (c) =>
        (outcome === ALL_OUTCOMES || caseOutcomeKey(c) === outcome) &&
        (!term || c.workflow_execution_id.includes(term) || c.alert_id.includes(term)),
    );
  }, [cases, outcome, query]);

  return (
    <>
      {cases.length === 0 ? (
        <p className="text-[12px] text-text-secondary">Sin casos todavía.</p>
      ) : (
        <>
          <CaseStatusFilters
            groups={groups}
            total={cases.length}
            selected={outcome}
            onSelect={setOutcome}
            infoStats={[
              {
                label: "Tokens (entrada / salida)",
                value: `${run.input_tokens.toLocaleString()} / ${run.output_tokens.toLocaleString()}`,
                caption: `Intentos máx. clasificador: ${run.config.max_feedback_iterations + 1}`,
                captionHint:
                  "Valor elegido al crear la prueba. Si el caso cae en un segmento habilitado, se aplica el máximo de ese segmento.",
                hint: "Tokens del LLM consumidos por todos los casos de la prueba.",
              },
            ]}
          />

          <SectionDivider className="mt-[17px]" />
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)] gap-5 items-stretch mt-[17px]">
            <CaseList
              key={outcome}
              cases={visibleCases}
              caseNumbers={caseNumbers}
              query={query}
              onQueryChange={setQuery}
              selectedCaseId={selectedCaseId}
              onSelect={onSelectCase}
            />
            <div className="min-w-0 flex flex-col">{children}</div>
          </div>
        </>
      )}
    </>
  );
}
