import type { ResolutionTag, ShortageBehavior } from "@/data/configs";
import type { ApiShortageBehavior } from "@/lib/api/configurations.functions";
import type { ApiModusOperandiPlaybook } from "@/lib/api/knowledgeLibrary.functions";

export const shortageFromApi = (b: ApiShortageBehavior): ShortageBehavior => ({
  resolutionTag: b.resolution_tag,
  resolutionMethodId: b.resolution_method_id,
});

export const shortageToApi = (b: ShortageBehavior): ApiShortageBehavior => ({
  resolution_tag: b.resolutionTag,
  resolution_method_id: b.resolutionMethodId ?? null,
});

/* The path the executor follows from a playbook's preferred method while
   resources keep being short - same walk as backend's
   RouteAlertResolutionUseCase (a loop back to a tried resource ends in a
   soft block). */
export function playbookPath(p: {
  resolution: ShortageBehavior;
  ifNoVoicebot: ShortageBehavior;
  ifNoAnalyst: ShortageBehavior;
}): ResolutionTag[] {
  const path: ResolutionTag[] = [p.resolution.resolutionTag];
  const seen = new Set<ResolutionTag>(path);
  let current = p.resolution.resolutionTag;
  while (current === "send_to_voicebot" || current === "scale_to_analyst") {
    const next =
      current === "send_to_voicebot" ? p.ifNoVoicebot.resolutionTag : p.ifNoAnalyst.resolutionTag;
    if (seen.has(next)) {
      path.push("block_soft");
      break;
    }
    path.push(next);
    seen.add(next);
    current = next;
  }
  return path;
}

export function apiPlaybookPath(p: ApiModusOperandiPlaybook): ResolutionTag[] {
  return playbookPath({
    resolution: shortageFromApi(p.resolution),
    ifNoVoicebot: shortageFromApi(p.if_no_voicebot),
    ifNoAnalyst: shortageFromApi(p.if_no_analyst),
  });
}
