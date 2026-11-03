import { DataTable, TruncText, type DataTableColumn } from "@/components/ui/DataTable";
import type { TestCaseSummary } from "@/lib/api/testing.functions";

import { CASE_STATUS_META, stepLabel } from "./caseStatus";
import { formatDuration } from "./formatDuration";
import { EDGE_LINES } from "./surfaceStyles";

const ID_PREVIEW_CHARS = 6;

const columns: DataTableColumn<TestCaseSummary>[] = [
  {
    key: "id",
    label: "Caso",
    minWidth: 70,
    sortValue: (c) => c.workflow_execution_id,
    searchValue: (c) => `${c.workflow_execution_id} ${c.alert_id}`,
    render: (c) => (
      <span
        title={`Caso ${c.workflow_execution_id}\nAlerta ${c.alert_id}`}
        className="font-mono text-[11px] text-text-primary"
      >
        {c.workflow_execution_id.slice(0, ID_PREVIEW_CHARS)}…
      </span>
    ),
  },
  {
    key: "status",
    label: "Estado",
    minWidth: 90,
    sortValue: (c) => CASE_STATUS_META[c.status].label,
    render: (c) => {
      const status = CASE_STATUS_META[c.status];
      return (
        <span
          title={`Terminó en ${stepLabel(c.current_step)}`}
          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${status.className}`}
        >
          {status.label}
        </span>
      );
    },
  },
  {
    key: "duration",
    label: "Tiempo",
    minWidth: 70,
    align: "right",
    sortValue: (c) => c.duration_seconds,
    render: (c) => (
      <TruncText maxWidth={90} className="text-[11px] text-text-secondary tabular-nums">
        {formatDuration(c.duration_seconds)}
      </TruncText>
    ),
  },
];

export function CaseList({
  cases,
  selectedCaseId,
  onSelect,
}: {
  cases: TestCaseSummary[];
  selectedCaseId: string | null;
  onSelect: (workflowExecutionId: string) => void;
}) {
  return (
    <div className={`bg-card min-w-0 h-full ${EDGE_LINES}`}>
      <DataTable
        compact
        hideColumnMenu
        storageKey="testing-cases"
        itemLabel="caso"
        rows={cases}
        rowKey={(c) => c.workflow_execution_id}
        columns={columns}
        searchPlaceholder="Buscar caso o alerta…"
        searchLabel="Buscar por ID del caso o de la alerta"
        emptyLabel="Ningún caso coincide."
        onRowClick={(c) => onSelect(c.workflow_execution_id)}
        isRowActive={(c) => c.workflow_execution_id === selectedCaseId}
      />
    </div>
  );
}
