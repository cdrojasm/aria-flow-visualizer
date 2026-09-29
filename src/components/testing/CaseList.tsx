import { ChevronLeft, ChevronRight, Search } from "lucide-react";

import { usePagination } from "@/hooks/usePagination";
import type { TestCaseSummary } from "@/lib/api/testing.functions";

import { CASE_STATUS_META, stepLabel } from "./caseStatus";
import { formatDuration } from "./formatDuration";
import { EDGE_LINES } from "./surfaceStyles";

const PAGE_SIZE = 10;

export function CaseList({
  cases,
  caseNumbers,
  query,
  onQueryChange,
  selectedCaseId,
  onSelect,
}: {
  cases: TestCaseSummary[];
  caseNumbers: Map<string, number>;
  query: string;
  onQueryChange: (query: string) => void;
  selectedCaseId: string | null;
  onSelect: (workflowExecutionId: string) => void;
}) {
  const casesPage = usePagination(cases, PAGE_SIZE);

  return (
    <div className={`bg-card min-w-0 h-full ${EDGE_LINES}`}>
      <div className="flex items-center gap-2 px-2 py-2 border-b border-border bg-surface">
        <div className="relative flex-1 min-w-0">
          <Search className="h-3.5 w-3.5 text-text-secondary absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => {
              onQueryChange(e.target.value);
              casesPage.setPage(1);
            }}
            placeholder="Buscar caso o alerta…"
            aria-label="Buscar por ID del caso o de la alerta"
            className="w-full pl-8 pr-2 py-1 rounded-md border border-border text-[12px] bg-background"
          />
        </div>
        <CompactPager
          page={casesPage.page}
          pageCount={casesPage.pageCount}
          pageSize={casesPage.pageSize}
          total={casesPage.total}
          onPageChange={casesPage.setPage}
        />
      </div>

      <div className="divide-y divide-border">
        {cases.length === 0 && (
          <p className="px-3 py-3 text-[12px] text-text-secondary">Ningún caso coincide.</p>
        )}
        {casesPage.pageItems.map((testCase) => {
          const active = testCase.workflow_execution_id === selectedCaseId;
          const status = CASE_STATUS_META[testCase.status];
          const step = stepLabel(testCase.current_step);
          return (
            <button
              key={testCase.workflow_execution_id}
              onClick={() => onSelect(testCase.workflow_execution_id)}
              aria-current={active}
              className={`w-full grid grid-cols-[24px_minmax(0,1fr)] gap-x-2 gap-y-1 items-center text-left px-2 py-1.5 transition-colors ${active ? "bg-primary-light shadow-[inset_3px_0_0_var(--color-primary)]" : "hover:bg-surface"}`}
            >
              <span className="row-span-2 text-[11px] text-text-secondary tabular-nums">
                #{caseNumbers.get(testCase.workflow_execution_id)}
              </span>
              <span className="text-[11px] font-mono text-text-primary truncate">
                {testCase.workflow_execution_id}
              </span>
              <span className="flex items-center gap-2 min-w-0">
                <span className="flex-1 text-[11px] leading-tight text-text-secondary truncate">
                  Terminó en {step}
                </span>
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${status.className}`}
                >
                  {status.label}
                </span>
                <span className="w-12 text-right text-[11px] text-text-secondary tabular-nums">
                  {formatDuration(testCase.duration_seconds)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CompactPager({
  page,
  pageCount,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const arrow =
    "h-6 w-6 grid place-items-center rounded text-text-secondary hover:bg-card hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <button
        type="button"
        aria-label="Página anterior"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className={arrow}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <span className="text-[11px] text-text-secondary tabular-nums whitespace-nowrap">
        {start}–{end} de {total}
      </span>
      <button
        type="button"
        aria-label="Página siguiente"
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
        className={arrow}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
