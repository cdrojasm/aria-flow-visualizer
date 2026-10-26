import { useCallback, useMemo, useState, type ComponentProps } from "react";
import { Gitgraph, Orientation, TemplateName, templateExtend } from "@gitgraph/react";
import type { ConfigurationGraphNodeResponse } from "@/lib/api/configurations.functions";

type GraphNode = ConfigurationGraphNodeResponse;
type GitgraphApi = Parameters<
  Extract<ComponentProps<typeof Gitgraph>, { children: unknown }>["children"]
>[0];

const STATE_COLORS = {
  active: "#15803d",
  promoted: "#000194",
  tested: "#b45309",
  draft: "#6b7280",
} as const;

type VersionState = keyof typeof STATE_COLORS;

const STATE_LABELS: Record<VersionState, string> = {
  active: "Activa en producción",
  promoted: "Promovida alguna vez",
  tested: "Probada",
  draft: "Borrador",
};

function stateOf(node: GraphNode): VersionState {
  if (node.active) return "active";
  if (node.ever_activated) return "promoted";
  if (node.ever_tested) return "tested";
  return "draft";
}

const hashOf = (configurationId: string, version: number) => `${configurationId}:v${version}`;

// Nodes grouped into families: every version of one configuration is a single
// chain (older versions carry no parent_ref), and a parent_ref pointing into
// another configuration joins both. Input is chronological, so parents are
// always drawn before their children.
function groupByFamily(nodes: GraphNode[], byHash: Map<string, GraphNode>): GraphNode[][] {
  const root = new Map<string, string>();
  const find = (id: string): string => {
    const parent = root.get(id) ?? id;
    if (parent === id) return id;
    const top = find(parent);
    root.set(id, top);
    return top;
  };
  for (const node of nodes) {
    const ref = node.parent_ref;
    if (ref && byHash.has(hashOf(ref.configuration_id, ref.version))) {
      root.set(find(node.configuration_id), find(ref.configuration_id));
    }
  }
  const families = new Map<string, GraphNode[]>();
  for (const node of nodes) {
    const key = find(node.configuration_id);
    families.set(key, [...(families.get(key) ?? []), node]);
  }
  return [...families.values()];
}

type Props = {
  nodes: GraphNode[];
  // The configuration picked in the page selector: only its family is drawn.
  selectedConfigurationId: string | null;
  selectedVersion: number | "draft";
  onSelectVersion: (configurationId: string, version: number) => void;
};

export function ConfigurationVersionGraph({
  nodes,
  selectedConfigurationId,
  selectedVersion,
  onSelectVersion,
}: Props) {
  const byHash = useMemo(
    () => new Map(nodes.map((node) => [hashOf(node.configuration_id, node.version), node])),
    [nodes],
  );

  const family = useMemo(
    () =>
      groupByFamily(nodes, byHash).find((members) =>
        members.some((node) => node.configuration_id === selectedConfigurationId),
      ) ?? null,
    [nodes, byHash, selectedConfigurationId],
  );

  // The version being viewed; an unsaved draft shows its lineage's latest.
  const selected = useMemo(() => {
    const lineage = (family ?? []).filter((n) => n.configuration_id === selectedConfigurationId);
    if (typeof selectedVersion === "number") {
      return lineage.find((node) => node.version === selectedVersion) ?? null;
    }
    return lineage.at(-1) ?? null;
  }, [family, selectedConfigurationId, selectedVersion]);
  const parentOfSelected =
    selected?.parent_ref &&
    byHash.get(hashOf(selected.parent_ref.configuration_id, selected.parent_ref.version));

  const template = useMemo(
    () =>
      templateExtend(TemplateName.Metro, {
        colors: ["#000194", "#0e7490", "#7c3aed", "#be123c", "#4d7c0f"],
        branch: { lineWidth: 4, label: { font: "normal 11px sans-serif" } },
        commit: {
          spacing: 44,
          dot: { size: 8 },
          message: { displayAuthor: false, displayHash: false, font: "normal 12px sans-serif" },
        },
      }),
    [],
  );

  const selectedHash = selected ? hashOf(selected.configuration_id, selected.version) : null;

  const draw = useMemo(() => {
    if (!family) return null;
    return (gitgraph: GitgraphApi) => {
      const branches = new Map<string, ReturnType<typeof gitgraph.branch>>();
      const lanes = [...new Set(family.map((node) => node.configuration_id))];
      for (const node of family) {
        const hash = hashOf(node.configuration_id, node.version);
        const color = STATE_COLORS[stateOf(node)];
        let branch = branches.get(node.configuration_id);
        if (!branch) {
          const parentHash =
            node.parent_ref &&
            byHash.has(hashOf(node.parent_ref.configuration_id, node.parent_ref.version))
              ? hashOf(node.parent_ref.configuration_id, node.parent_ref.version)
              : undefined;
          branch = gitgraph.branch({
            name: `${node.name} (${lanes.indexOf(node.configuration_id) + 1})`,
            from: parentHash,
          });
          branches.set(node.configuration_id, branch);
        }
        const select = () => onSelectVersion(node.configuration_id, node.version);
        const isSelected = hash === selectedHash;
        branch.commit({
          hash,
          subject: `${node.name} v${node.version}${node.active ? " ★" : ""}`,
          style: {
            dot: {
              color,
              strokeColor: isSelected ? "#111827" : color,
              strokeWidth: isSelected ? 3 : 0,
              size: isSelected ? 11 : 8,
            },
            message: { color: "#1f2937" },
          },
          onClick: select,
          onMessageClick: select,
        });
      }
    };
  }, [family, byHash, selectedHash, onSelectVersion]);

  return (
    <div data-testid="configuration-version-graph">
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-secondary">
        {(Object.keys(STATE_COLORS) as VersionState[]).map((state) => (
          <li key={state} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: STATE_COLORS[state] }}
            />
            {STATE_LABELS[state]}
          </li>
        ))}
      </ul>

      {draw ? (
        <div className="max-h-[28rem] overflow-auto rounded-lg border border-border bg-white p-3">
          {/* gitgraph only draws on mount, so a new family or selection needs a new key. */}
          <Gitgraph
            key={`${family?.[0].configuration_id}:${family?.[0].version}:${selectedHash}`}
            options={{ template, orientation: Orientation.Vertical }}
          >
            {draw}
          </Gitgraph>
        </div>
      ) : (
        <p className="rounded-lg border border-border px-3 py-2 text-[12px] text-text-secondary">
          Esta configuración todavía no tiene versiones guardadas.
        </p>
      )}

      <div
        data-testid="configuration-graph-detail"
        className="mt-3 rounded-lg border border-border px-3 py-2 text-[12px]"
      >
        {selected ? (
          <>
            <p className="font-medium text-text-primary">
              {selected.name} · v{selected.version} · {STATE_LABELS[stateOf(selected)]}
            </p>
            <p className="mt-1 text-text-secondary">
              {parentOfSelected
                ? `Deriva de ${parentOfSelected.name} v${parentOfSelected.version}`
                : "Versión raíz"}
            </p>
            {selected.promotion_comment && (
              <p className="mt-1 text-text-primary">
                <span className="text-text-secondary">Comentario de promoción: </span>
                {selected.promotion_comment}
              </p>
            )}
          </>
        ) : (
          <p className="text-text-secondary">Selecciona una versión para ver su detalle.</p>
        )}
      </div>
    </div>
  );
}
