import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { AI_PROVIDERS, aiSettingsSave, aiTest, type AiProvider, type AiSettings } from "@/ipc/ai";
import { describeError, toAppError } from "@/ipc/errors";
import { ErrorNotice } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { queryKeys } from "@/query/keys";
import { PROVIDER_INFO } from "./ai-config";

const PROVIDER_OPTIONS = AI_PROVIDERS.map((provider) => ({
  value: provider,
  label: PROVIDER_INFO[provider].label,
}));

/**
 * Settings for the optional report assistant: provider, model, endpoint and key. The key field
 * is write-only; the core reports only whether one is stored.
 */
export function AiSettingsForm({ settings }: { settings: AiSettings }) {
  const queryClient = useQueryClient();
  const ids = { provider: useId(), model: useId(), baseUrl: useId(), key: useId(), enabled: useId() };
  const [provider, setProvider] = useState<AiProvider>(settings.provider);
  const [model, setModel] = useState(settings.model);
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const info = PROVIDER_INFO[provider];

  const save = useMutation({
    mutationFn: (input: { enabled: boolean; apiKey: string | null }) =>
      aiSettingsSave({ provider, model, baseUrl: baseUrl.trim() || null, ...input }),
    onSuccess: (next) => {
      queryClient.setQueryData(queryKeys.aiSettings, next);
      setApiKey("");
      setModel(next.model);
      setBaseUrl(next.baseUrl ?? "");
    },
    onError: (error) => toast.error(describeError(toAppError(error)).title),
  });
  const test = useMutation({
    mutationFn: async () => {
      await save.mutateAsync({ enabled: settings.enabled, apiKey: apiKey || null });
      return aiTest();
    },
    onSuccess: (result) => toast.success(`Connected to ${result.model} in ${result.latencyMs} ms`),
  });

  const dirty =
    provider !== settings.provider ||
    model !== settings.model ||
    (baseUrl.trim() || null) !== settings.baseUrl ||
    apiKey.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-6">
        <label htmlFor={ids.enabled} className="text-muted">
          Enable the report assistant
        </label>
        <Switch
          id={ids.enabled}
          checked={settings.enabled}
          disabled={save.isPending}
          onCheckedChange={(enabled) => {
            save.mutate({ enabled, apiKey: apiKey || null });
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Provider" htmlFor={ids.provider}>
          <Select
            id={ids.provider}
            value={provider}
            options={PROVIDER_OPTIONS}
            onValueChange={(next) => {
              setProvider(next);
              setModel(PROVIDER_INFO[next].defaultModel);
              setBaseUrl("");
            }}
          />
        </Field>
        <Field label="Model" htmlFor={ids.model}>
          <Input
            id={ids.model}
            value={model}
            placeholder={info.defaultModel}
            spellCheck={false}
            onChange={(event) => {
              setModel(event.target.value);
            }}
          />
        </Field>
      </div>
      <Field label="Endpoint" htmlFor={ids.baseUrl} hint={info.baseUrlHint}>
        <Input
          id={ids.baseUrl}
          value={baseUrl}
          placeholder="Default"
          spellCheck={false}
          onChange={(event) => {
            setBaseUrl(event.target.value);
          }}
        />
      </Field>
      {info.keyLabel ? (
        <Field
          label={info.keyLabel}
          htmlFor={ids.key}
          hint={
            settings.hasKey && settings.provider === provider
              ? "A key is stored in the system keychain. Type a new one to replace it."
              : "Stored in the system keychain, never in the local database."
          }
        >
          <Input
            id={ids.key}
            type="password"
            autoComplete="off"
            value={apiKey}
            placeholder={settings.hasKey ? "••••••••••••" : "Paste a key"}
            onChange={(event) => {
              setApiKey(event.target.value);
            }}
          />
        </Field>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          disabled={!dirty || save.isPending}
          onClick={() => {
            save.mutate({ enabled: settings.enabled, apiKey: apiKey || null });
          }}
        >
          Save
        </Button>
        <Button
          disabled={test.isPending}
          onClick={() => {
            test.mutate();
          }}
        >
          {test.isPending ? "Testing" : "Test connection"}
        </Button>
        {settings.hasKey && info.keyLabel ? (
          <Button
            variant="ghost"
            disabled={save.isPending}
            onClick={() => {
              save.mutate({ enabled: settings.enabled, apiKey: "" });
            }}
          >
            Remove key
          </Button>
        ) : null}
      </div>
      {test.isError ? <ErrorNotice error={toAppError(test.error)} /> : null}
      <p className="text-[13px] text-faint">
        {info.local
          ? "Requests stay on this machine."
          : "Draft text you send to the assistant goes to this provider. Each program must be allowed separately in the composer, because many programs forbid sharing undisclosed findings with third parties."}
      </p>
    </div>
  );
}
