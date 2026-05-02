/**
 * Compat shims for helpers that lived under the removed `src/core/agents/` tree.
 * They are intentionally minimal — VIGIL no longer ships an embedded SWE agent;
 * skills come from `src/core/skills/` instead.
 */

export function mergeDefaultInternalSkillPrompts(prompts: Record<string, string> | undefined): Record<string, string> {
  return { ...(prompts ?? {}) };
}

export async function loadExternalSkillsFromData(_dataDir?: string): Promise<Array<{ name: string; prompt: string }>> {
  return [];
}
