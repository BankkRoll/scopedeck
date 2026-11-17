import { useQuery } from "@tanstack/react-query";
import { aiSettingsGet, type AiProvider } from "@/ipc/ai";
import { queryKeys } from "@/query/keys";

/** Display details per provider. Default models mirror the core's defaults. */
export const PROVIDER_INFO: Record<
  AiProvider,
  { label: string; defaultModel: string; keyLabel: string | null; local: boolean; baseUrlHint: string }
> = {
  anthropic: {
    label: "Anthropic",
    defaultModel: "claude-sonnet-5-5",
    keyLabel: "Anthropic API key",
    local: false,
    baseUrlHint: "Leave empty for api.anthropic.com",
  },
  openai: {
    label: "OpenAI or compatible",
    defaultModel: "gpt-5",
    keyLabel: "API key",
    local: false,
    baseUrlHint: "Leave empty for api.openai.com, or point at a local server such as LM Studio",
  },
  ollama: {
    label: "Ollama (local)",
    defaultModel: "llama3.1",
    keyLabel: null,
    local: true,
    baseUrlHint: "Leave empty for http://localhost:11434",
  },
};

/** Reads the stored assistant configuration. */
export function useAiSettings() {
  return useQuery({ queryKey: queryKeys.aiSettings, queryFn: aiSettingsGet, staleTime: Infinity });
}
