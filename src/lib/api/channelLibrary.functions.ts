import { apiFetch } from "./client";

// Client functions wrapping the backend's channel-library API, mirroring
// resolutionMethod.functions.ts's single-resource pattern. Global,
// config-independent reference data - a new configuration's segments dict
// snapshot-copies the active entries at draft-creation time (see
// buildSegmentsFromChannels in data/configs.ts), same "import, don't
// reference live" semantics as knowledgeLibrary.functions.ts.

export type ChannelLibraryEntry = {
  id: string;
  code: string;
  name: string;
  description: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export function listChannelLibraryEntries({
  data,
}: {
  data: { activeOnly: boolean };
}): Promise<ChannelLibraryEntry[]> {
  return apiFetch(`/api/v0/library/channels?active_only=${data.activeOnly}`);
}

export function createChannelLibraryEntry({
  data,
}: {
  data: { code: string; name: string; description?: string };
}): Promise<ChannelLibraryEntry> {
  return apiFetch("/api/v0/library/channels", { method: "POST", body: JSON.stringify(data) });
}

export function updateChannelLibraryEntry({
  data,
}: {
  data: { entryId: string; code?: string; name?: string; description?: string; active?: boolean };
}): Promise<ChannelLibraryEntry> {
  const { entryId, ...body } = data;
  return apiFetch(`/api/v0/library/channels/${encodeURIComponent(entryId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteChannelLibraryEntry({ data }: { data: { entryId: string } }): Promise<void> {
  return apiFetch(`/api/v0/library/channels/${encodeURIComponent(data.entryId)}`, { method: "DELETE" });
}
