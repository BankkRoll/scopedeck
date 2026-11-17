use serde::Serialize;
use std::time::Instant;
use tauri::State;

use crate::ai::{AiClient, AiConfig, AiError, AiKey, CompletionRequest, Provider};
use crate::cache::workspace;
use crate::error::{CommandError, CommandResult};
use crate::state::AppState;

const DEFAULT_MAX_TOKENS: u32 = 1024;
const MAX_TOKENS_LIMIT: u32 = 32_000;
const MAX_INPUT_CHARS: usize = 400_000;
const TEST_SYSTEM: &str = "You are a connectivity check.";
const TEST_PROMPT: &str = "Reply with the single word: ok";
// Reasoning models spend part of the budget before answering, so the check leaves headroom
// and only requires a successful response, not any particular text.
const TEST_MAX_TOKENS: u32 = 256;

/// What the webview may know about the AI configuration; the key itself is reduced to `has_key`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiSettingsView {
    pub provider: Provider,
    pub model: String,
    pub base_url: Option<String>,
    pub enabled: bool,
    pub has_key: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiTestResult {
    pub ok: bool,
    pub model: String,
    pub latency_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiCompletion {
    pub text: String,
}

pub(crate) fn settings_view(state: &AppState) -> CommandResult<AiSettingsView> {
    let config = state.cache.with(|conn| workspace::ai_config(conn))?;
    Ok(AiSettingsView {
        provider: config.provider,
        model: config.model,
        base_url: config.base_url,
        enabled: config.enabled,
        has_key: state.ai_key()?.is_some(),
    })
}

/// `api_key`: `None` keeps the stored key, an empty string removes it, anything else replaces it.
pub(crate) fn save_settings(
    state: &AppState,
    config: AiConfig,
    api_key: Option<&str>,
) -> CommandResult<AiSettingsView> {
    let config = config.normalized()?;
    let key_change = match api_key.map(str::trim) {
        None => None,
        Some("") => Some(None),
        Some(raw) => Some(Some(AiKey::parse(raw)?)),
    };
    state.cache.with(|conn| workspace::save_ai_config(conn, &config))?;
    if let Some(key) = key_change {
        state.set_ai_key(key)?;
    }
    settings_view(state)
}

fn client(state: &AppState, require_enabled: bool) -> CommandResult<AiClient> {
    let config = state.cache.with(|conn| workspace::ai_config(conn))?;
    if require_enabled && !config.enabled {
        return Err(AiError::Disabled.into());
    }
    Ok(AiClient::new(&config, state.ai_key()?)?)
}

/// Runs regardless of `enabled`, so the settings screen can verify a provider before turning it on.
pub(crate) async fn test_connection(state: &AppState) -> CommandResult<AiTestResult> {
    let client = client(state, false)?;
    let started = Instant::now();
    let completion = client
        .complete(&CompletionRequest {
            system: TEST_SYSTEM,
            prompt: TEST_PROMPT,
            max_tokens: TEST_MAX_TOKENS,
            json: false,
        })
        .await?;
    let latency_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
    Ok(AiTestResult { ok: true, model: completion.model, latency_ms })
}

pub(crate) async fn complete(
    state: &AppState,
    system: &str,
    prompt: &str,
    max_tokens: Option<u32>,
    json: bool,
) -> CommandResult<AiCompletion> {
    if prompt.trim().is_empty() {
        return Err(CommandError::invalid("the prompt is empty"));
    }
    if system.chars().count().saturating_add(prompt.chars().count()) > MAX_INPUT_CHARS {
        return Err(CommandError::invalid("the prompt is too long to send"));
    }
    let client = client(state, true)?;
    let max_tokens = max_tokens.unwrap_or(DEFAULT_MAX_TOKENS).clamp(1, MAX_TOKENS_LIMIT);
    let completion = client.complete(&CompletionRequest { system, prompt, max_tokens, json }).await?;
    Ok(AiCompletion { text: completion.text })
}

#[tauri::command]
pub(crate) fn ai_settings_get(state: State<'_, AppState>) -> CommandResult<AiSettingsView> {
    settings_view(&state)
}

#[tauri::command]
pub(crate) fn ai_settings_save(
    state: State<'_, AppState>,
    provider: Provider,
    model: String,
    base_url: Option<String>,
    enabled: bool,
    api_key: Option<String>,
) -> CommandResult<AiSettingsView> {
    save_settings(&state, AiConfig { provider, model, base_url, enabled }, api_key.as_deref())
}

#[tauri::command]
pub(crate) async fn ai_test(state: State<'_, AppState>) -> CommandResult<AiTestResult> {
    test_connection(&state).await
}

#[tauri::command]
pub(crate) async fn ai_complete(
    state: State<'_, AppState>,
    system: String,
    prompt: String,
    max_tokens: Option<u32>,
    json: Option<bool>,
) -> CommandResult<AiCompletion> {
    complete(&state, &system, &prompt, max_tokens, json.unwrap_or(false)).await
}

#[cfg(test)]
pub(crate) mod testing {
    use std::sync::Mutex;
    use url::Url;

    use crate::cache::Cache;
    use crate::credentials::memory::{MemoryAiKeyStore, MemoryStore};
    use crate::redaction::SecretRegistry;
    use crate::state::AppState;

    pub(crate) fn state(key: Option<&str>) -> AppState {
        AppState::new(
            Url::parse("http://127.0.0.1:9/").unwrap(),
            Cache::in_memory().unwrap(),
            Box::new(MemoryStore::default()),
            Box::new(MemoryAiKeyStore(Mutex::new(key.map(str::to_owned)))),
            SecretRegistry::default(),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::testing::state;
    use super::*;
    use crate::ai::testing::{TEST_AI_KEY, config_for};
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn config(provider: Provider, enabled: bool) -> AiConfig {
        AiConfig { provider, model: String::new(), base_url: None, enabled }
    }

    #[test]
    fn defaults_to_disabled_without_a_key() {
        let view = settings_view(&state(None)).unwrap();
        assert_eq!(
            view,
            AiSettingsView {
                provider: Provider::Anthropic,
                model: "claude-sonnet-5-5".into(),
                base_url: None,
                enabled: false,
                has_key: false,
            }
        );
        let json = serde_json::to_value(&view).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "provider": "anthropic", "model": "claude-sonnet-5-5", "baseUrl": null, "enabled": false, "hasKey": false,
            })
        );
    }

    #[test]
    fn saving_keeps_replaces_or_clears_the_key() {
        let state = state(None);
        let view = save_settings(&state, config(Provider::Openai, true), Some(TEST_AI_KEY)).unwrap();
        assert!(view.has_key && view.enabled);
        assert_eq!(view.model, "gpt-5");
        assert!(!serde_json::to_string(&view).unwrap().contains(TEST_AI_KEY));
        assert_eq!(state.secrets.redact(TEST_AI_KEY), "[redacted]");

        let kept = save_settings(&state, config(Provider::Openai, false), None).unwrap();
        assert!(kept.has_key && !kept.enabled);
        assert_eq!(state.ai_key().unwrap().unwrap().expose(), TEST_AI_KEY);

        let cleared = save_settings(&state, config(Provider::Openai, false), Some("  ")).unwrap();
        assert!(!cleared.has_key);
    }

    #[test]
    fn invalid_input_is_rejected_before_anything_is_stored() {
        let state = state(None);
        let bad_key = save_settings(&state, config(Provider::Openai, true), Some("not a key"));
        assert!(matches!(bad_key, Err(CommandError::Invalid { .. })));
        let insecure =
            AiConfig { base_url: Some("http://gateway.example.com".into()), ..config(Provider::Openai, true) };
        assert!(matches!(save_settings(&state, insecure, Some(TEST_AI_KEY)), Err(CommandError::Invalid { .. })));
        let remote_ollama =
            AiConfig { base_url: Some("https://ollama.example.com".into()), ..config(Provider::Ollama, true) };
        assert!(matches!(save_settings(&state, remote_ollama, None), Err(CommandError::Invalid { .. })));
        let view = settings_view(&state).unwrap();
        assert!(!view.enabled && !view.has_key);
    }

    #[tokio::test]
    async fn completion_is_refused_while_disabled_or_without_a_key() {
        let state = state(Some(TEST_AI_KEY));
        let disabled = complete(&state, "", "hello", None, false).await.unwrap_err();
        assert!(matches!(disabled, CommandError::Ai { error: AiError::Disabled, .. }));

        let state = super::testing::state(None);
        save_settings(&state, config(Provider::Anthropic, true), None).unwrap();
        let missing = complete(&state, "", "hello", None, false).await.unwrap_err();
        assert!(matches!(missing, CommandError::Ai { error: AiError::MissingKey, .. }));
        assert!(matches!(complete(&state, "", "  ", None, false).await, Err(CommandError::Invalid { .. })));
    }

    #[tokio::test]
    async fn completes_and_tests_against_the_configured_provider() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/api/chat"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "model": "llama3.1:8b",
                "message": { "role": "assistant", "content": "{\"summary\":\"ok\"}" },
            })))
            .mount(&server)
            .await;
        let state = state(None);
        save_settings(&state, config_for(&server, Provider::Ollama), None).unwrap();
        let completion = complete(&state, "sys", "summarize", Some(500_000), true).await.unwrap();
        assert_eq!(completion, AiCompletion { text: "{\"summary\":\"ok\"}".into() });
        let sent: serde_json::Value = server.received_requests().await.unwrap()[0].body_json().unwrap();
        assert_eq!(sent["options"]["num_predict"], MAX_TOKENS_LIMIT);

        let result = test_connection(&state).await.unwrap();
        assert!(result.ok);
        assert_eq!(result.model, "llama3.1:8b");
    }

    #[tokio::test]
    async fn test_reports_provider_failures_as_ai_errors() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/messages"))
            .respond_with(ResponseTemplate::new(401))
            .mount(&server)
            .await;
        let state = state(Some(TEST_AI_KEY));
        save_settings(&state, AiConfig { enabled: false, ..config_for(&server, Provider::Anthropic) }, None).unwrap();
        let error = test_connection(&state).await.unwrap_err();
        let value = serde_json::to_value(&error).unwrap();
        assert_eq!(
            value,
            serde_json::json!({
                "kind": "ai",
                "error": { "kind": "unauthorized" },
                "message": "the AI provider rejected the API key",
            })
        );
    }
}
