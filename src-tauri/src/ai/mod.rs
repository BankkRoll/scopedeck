//! Provider-agnostic text completion for the optional AI assistant.
//!
//! - Validates provider configuration (model, base URL) before anything is persisted or sent.
//! - Talks to Anthropic, OpenAI-compatible servers and Ollama through one [`AiClient`].
//! - Maps provider failures to [`AiError`] without ever echoing the API key or request body.

mod anthropic;
mod ollama;
mod openai;

use reqwest::header::RETRY_AFTER;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::time::{Duration, Instant};
use time::OffsetDateTime;
use url::{Host, Url};

use crate::api::retry::parse_retry_after;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_ERROR_MESSAGE_CHARS: usize = 300;
const MAX_MODEL_CHARS: usize = 200;
const MIN_KEY_CHARS: usize = 8;
const MAX_KEY_CHARS: usize = 1024;
const USER_AGENT: &str = concat!("Scopedeck/", env!("CARGO_PKG_VERSION"));
const REDACTED: &str = "[redacted]";
const JSON_INSTRUCTION: &str =
    "Respond with a single valid JSON object and nothing else: no prose before or after it and no code fences.";

/// The AI backends Scopedeck can talk to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Provider {
    #[default]
    Anthropic,
    Openai,
    Ollama,
}

impl Provider {
    /// The model used when the user leaves the model field blank.
    pub(crate) fn default_model(self) -> &'static str {
        match self {
            Self::Anthropic => "claude-sonnet-5-5",
            Self::Openai => "gpt-5",
            Self::Ollama => "llama3.1",
        }
    }

    fn default_base_url(self) -> &'static str {
        match self {
            Self::Anthropic => "https://api.anthropic.com/",
            Self::Openai => "https://api.openai.com/",
            Self::Ollama => "http://127.0.0.1:11434/",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Anthropic => "anthropic",
            Self::Openai => "openai",
            Self::Ollama => "ollama",
        }
    }

    /// Local OpenAI-compatible servers (LM Studio, llama.cpp) usually run without a key.
    fn requires_key(self, base: &Url) -> bool {
        match self {
            Self::Anthropic => true,
            Self::Openai => !is_loopback(base),
            Self::Ollama => false,
        }
    }
}

/// Persisted AI preferences. The API key is deliberately absent: it lives only in the keychain.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiConfig {
    pub provider: Provider,
    pub model: String,
    #[serde(default)]
    pub base_url: Option<String>,
    pub enabled: bool,
}

impl Default for AiConfig {
    fn default() -> Self {
        let provider = Provider::default();
        Self { provider, model: provider.default_model().to_owned(), base_url: None, enabled: false }
    }
}

impl AiConfig {
    /// Trims input, fills in the provider's default model and rejects unsafe base URLs.
    pub(crate) fn normalized(self) -> Result<Self, AiError> {
        let model = self.model.trim();
        let model = if model.is_empty() {
            self.provider.default_model().to_owned()
        } else if model.chars().count() > MAX_MODEL_CHARS || model.chars().any(char::is_control) {
            return Err(AiError::invalid("the model name is not valid"));
        } else {
            model.to_owned()
        };
        let base_url = self
            .base_url
            .as_deref()
            .map(str::trim)
            .filter(|raw| !raw.is_empty())
            .map(|raw| validate_base_url(self.provider, raw).map(String::from))
            .transpose()?;
        Ok(Self { model, base_url, ..self })
    }

    /// The configured base URL, or the provider's default.
    pub(crate) fn base_url(&self) -> Result<Url, AiError> {
        validate_base_url(self.provider, self.base_url.as_deref().unwrap_or(self.provider.default_base_url()))
    }
}

/// A provider API key. `Debug` never prints the value.
#[derive(Clone)]
pub(crate) struct AiKey(String);

impl AiKey {
    /// Validates a key typed by the user. Keys are opaque tokens, so anything with whitespace or
    /// non-ASCII characters is a paste mistake, and too-short values would make log redaction
    /// rewrite ordinary words.
    pub(crate) fn parse(raw: &str) -> Result<Self, AiError> {
        let key = raw.trim();
        if key.len() < MIN_KEY_CHARS || key.len() > MAX_KEY_CHARS || !key.chars().all(|c| c.is_ascii_graphic()) {
            return Err(AiError::invalid("that API key does not look right; paste it again without spaces"));
        }
        Ok(Self(key.to_owned()))
    }

    pub(crate) fn expose(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for AiKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("AiKey(<redacted>)")
    }
}

/// Failures surfaced to the webview under `{ kind: "ai", error }`.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub(crate) enum AiError {
    #[error("AI assistance is turned off; enable it in Settings")]
    Disabled,
    #[error("add an API key for the AI provider in Settings")]
    MissingKey,
    #[error("{message}")]
    InvalidConfig { message: String },
    #[error("the AI provider rejected the API key")]
    Unauthorized,
    #[error("the AI provider rate limit was reached")]
    RateLimited { retry_after_secs: Option<u64> },
    #[error("the AI provider returned server error {status}")]
    Server { status: u16 },
    #[error("the AI provider rejected the request (HTTP {status}){}", detail_suffix(message.as_deref()))]
    Rejected { status: u16, message: Option<String> },
    #[error("could not reach the AI provider: {message}")]
    Network { message: String },
    #[error("the AI provider response could not be read: {message}")]
    Decode { message: String },
}

fn detail_suffix(message: Option<&str>) -> String {
    message.map(|message| format!(": {message}")).unwrap_or_default()
}

impl AiError {
    pub(crate) fn invalid(message: impl Into<String>) -> Self {
        Self::InvalidConfig { message: message.into() }
    }
}

/// One single-turn completion.
#[derive(Debug, Clone, Copy)]
pub(crate) struct CompletionRequest<'a> {
    pub system: &'a str,
    pub prompt: &'a str,
    pub max_tokens: u32,
    /// Ask the provider for a JSON object where it supports a dedicated mode.
    pub json: bool,
}

/// A provider reply. `model` is what the provider reports, falling back to the requested one.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Completion {
    pub text: String,
    pub model: String,
}

struct Reply {
    text: String,
    model: Option<String>,
}

/// Accepts `https` anywhere, and plain `http` only for a server on this machine. Ollama has no
/// authentication of its own, so it is restricted to loopback entirely.
pub(crate) fn validate_base_url(provider: Provider, raw: &str) -> Result<Url, AiError> {
    let url =
        Url::parse(raw.trim()).map_err(|_| AiError::invalid("enter a full base URL such as https://example.com"))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(AiError::invalid("the base URL must start with https://"));
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(AiError::invalid("the base URL cannot contain a username or password"));
    }
    if url.query().is_some() || url.fragment().is_some() {
        return Err(AiError::invalid("the base URL cannot contain a query string or fragment"));
    }
    let loopback = is_loopback(&url);
    if provider == Provider::Ollama && !loopback {
        return Err(AiError::invalid("Ollama must run on this computer (localhost or 127.0.0.1)"));
    }
    if url.scheme() == "http" && !loopback {
        return Err(AiError::invalid("use https, or http only for a server on this computer"));
    }
    Ok(url)
}

fn is_loopback(url: &Url) -> bool {
    match url.host() {
        Some(Host::Ipv4(ip)) => ip.is_loopback(),
        Some(Host::Ipv6(ip)) => ip.is_loopback(),
        Some(Host::Domain(domain)) => domain.eq_ignore_ascii_case("localhost"),
        None => false,
    }
}

fn endpoint(base: &Url, segments: &[&str]) -> Url {
    let mut url = base.clone();
    if let Ok(mut path) = url.path_segments_mut() {
        path.pop_if_empty().extend(segments);
    }
    url
}

fn chat_messages(system: &str, prompt: &str) -> serde_json::Value {
    let mut messages = Vec::with_capacity(2);
    if !system.is_empty() {
        messages.push(serde_json::json!({ "role": "system", "content": system }));
    }
    messages.push(serde_json::json!({ "role": "user", "content": prompt }));
    serde_json::Value::Array(messages)
}

/// A configured connection to one provider.
pub(crate) struct AiClient {
    http: reqwest::Client,
    provider: Provider,
    model: String,
    base: Url,
    key: Option<AiKey>,
}

impl AiClient {
    /// Builds a client for `config`, failing early when a required key is missing.
    pub(crate) fn new(config: &AiConfig, key: Option<AiKey>) -> Result<Self, AiError> {
        let base = config.base_url()?;
        let key = if config.provider == Provider::Ollama { None } else { key };
        if key.is_none() && config.provider.requires_key(&base) {
            return Err(AiError::MissingKey);
        }
        // SECURITY: redirects are refused because reqwest only strips standard auth headers when a
        // redirect crosses origins; Anthropic's `x-api-key` would follow the request anywhere.
        let http = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .connect_timeout(CONNECT_TIMEOUT)
            .timeout(REQUEST_TIMEOUT)
            .redirect(reqwest::redirect::Policy::none())
            .https_only(base.scheme() == "https")
            .build()
            .map_err(|error| AiError::Network { message: error.without_url().to_string() })?;
        let model = if config.model.trim().is_empty() {
            config.provider.default_model().to_owned()
        } else {
            config.model.trim().to_owned()
        };
        Ok(Self { http, provider: config.provider, model, base, key })
    }

    /// Sends one prompt and returns the provider's text.
    ///
    /// # Errors
    ///
    /// Returns an [`AiError`] describing the HTTP or decoding failure; messages never contain the key.
    pub(crate) async fn complete(&self, request: &CompletionRequest<'_>) -> Result<Completion, AiError> {
        // OpenAI's JSON mode refuses prompts that never mention JSON, and Anthropic has no JSON
        // mode at all, so the instruction goes into the system prompt for every provider.
        let system = if request.json {
            if request.system.trim().is_empty() {
                JSON_INSTRUCTION.to_owned()
            } else {
                format!("{}\n\n{JSON_INSTRUCTION}", request.system.trim_end())
            }
        } else {
            request.system.to_owned()
        };
        let prepared = CompletionRequest { system: &system, ..*request };
        let key = self.key.as_ref();
        let builder = match self.provider {
            Provider::Anthropic => anthropic::request(&self.http, &self.base, &self.model, key, &prepared)?,
            Provider::Openai => openai::request(&self.http, &self.base, &self.model, key, &prepared),
            Provider::Ollama => ollama::request(&self.http, &self.base, &self.model, &prepared),
        };

        let started = Instant::now();
        let response = builder.send().await.map_err(|error| self.network(&error))?;
        let status = response.status().as_u16();
        let retry_after = response
            .headers()
            .get(RETRY_AFTER)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| parse_retry_after(value, OffsetDateTime::now_utc()));
        let bytes = response.bytes().await.map_err(|error| self.network(&error))?;
        let latency_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
        tracing::debug!(provider = self.provider.label(), status, latency_ms, "ai response");

        if !(200..300).contains(&status) {
            return Err(self.status_error(status, &bytes, retry_after));
        }
        let reply = match self.provider {
            Provider::Anthropic => anthropic::parse(&bytes),
            Provider::Openai => openai::parse(&bytes),
            Provider::Ollama => ollama::parse(&bytes),
        }
        .map_err(|message| AiError::Decode { message: self.scrub(&message) })?;
        Ok(Completion {
            text: reply.text,
            model: reply.model.filter(|model| !model.is_empty()).unwrap_or_else(|| self.model.clone()),
        })
    }

    fn status_error(&self, status: u16, body: &[u8], retry_after: Option<Duration>) -> AiError {
        match status {
            401 => AiError::Unauthorized,
            429 => AiError::RateLimited { retry_after_secs: retry_after.map(|delay| delay.as_secs()) },
            500..=599 => AiError::Server { status },
            _ => AiError::Rejected { status, message: provider_message(body).map(|message| self.scrub(&message)) },
        }
    }

    fn network(&self, error: &reqwest::Error) -> AiError {
        let message = if error.is_timeout() {
            "the request timed out".to_owned()
        } else if error.is_connect() {
            "the connection failed; check that the provider is reachable".to_owned()
        } else if error.is_redirect() {
            "the provider tried to redirect the request, which is not allowed".to_owned()
        } else {
            self.scrub(&error.to_string())
        };
        AiError::Network { message }
    }

    fn scrub(&self, text: &str) -> String {
        match &self.key {
            Some(key) => text.replace(key.expose(), REDACTED),
            None => text.to_owned(),
        }
    }
}

/// Pulls a human-readable message out of the error envelopes used by all three providers:
/// `{ error: { message } }` (Anthropic, `OpenAI`) and `{ error: "..." }` (Ollama).
fn provider_message(body: &[u8]) -> Option<String> {
    let value: serde_json::Value = serde_json::from_slice(body).ok()?;
    let error = value.get("error")?;
    let message = error.as_str().or_else(|| error.get("message").and_then(serde_json::Value::as_str))?.trim();
    if message.is_empty() {
        return None;
    }
    Some(if message.chars().count() > MAX_ERROR_MESSAGE_CHARS {
        let truncated: String = message.chars().take(MAX_ERROR_MESSAGE_CHARS).collect();
        format!("{truncated}…")
    } else {
        message.to_owned()
    })
}

#[cfg(test)]
pub(crate) mod testing {
    use super::*;
    use wiremock::MockServer;

    pub(crate) const TEST_AI_KEY: &str = "sk-test-0123456789abcdef";

    pub(crate) fn config_for(server: &MockServer, provider: Provider) -> AiConfig {
        AiConfig { provider, model: String::new(), base_url: Some(server.uri()), enabled: true }
    }
}

#[cfg(test)]
mod tests {
    use super::testing::*;
    use super::*;
    use wiremock::matchers::{body_partial_json, header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn request(json: bool) -> CompletionRequest<'static> {
        CompletionRequest { system: "be terse", prompt: "say hi", max_tokens: 32, json }
    }

    fn client(server: &MockServer, provider: Provider) -> AiClient {
        AiClient::new(&config_for(server, provider), Some(AiKey::parse(TEST_AI_KEY).unwrap())).unwrap()
    }

    fn route(provider: Provider) -> &'static str {
        match provider {
            Provider::Anthropic => "/v1/messages",
            Provider::Openai => "/v1/chat/completions",
            Provider::Ollama => "/api/chat",
        }
    }

    async fn failing(provider: Provider, response: ResponseTemplate) -> AiError {
        let server = MockServer::start().await;
        Mock::given(method("POST")).and(path(route(provider))).respond_with(response).mount(&server).await;
        client(&server, provider).complete(&request(false)).await.unwrap_err()
    }

    #[tokio::test]
    async fn anthropic_sends_key_version_and_reads_text_blocks() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/messages"))
            .and(header("x-api-key", TEST_AI_KEY))
            .and(header("anthropic-version", "2023-06-01"))
            .and(body_partial_json(serde_json::json!({
                "model": "claude-sonnet-5-5",
                "max_tokens": 32,
                "messages": [{ "role": "user", "content": "say hi" }],
            })))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "model": "claude-sonnet-5-5-20261101",
                "content": [{ "type": "text", "text": "hi" }, { "type": "text", "text": " there" }],
            })))
            .expect(1)
            .mount(&server)
            .await;
        let completion = client(&server, Provider::Anthropic).complete(&request(true)).await.unwrap();
        assert_eq!(completion, Completion { text: "hi there".into(), model: "claude-sonnet-5-5-20261101".into() });
        let sent: serde_json::Value = server.received_requests().await.unwrap()[0].body_json().unwrap();
        let system = sent["system"].as_str().unwrap();
        assert!(system.starts_with("be terse") && system.contains("JSON"));
    }

    #[tokio::test]
    async fn openai_sends_bearer_and_json_mode() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .and(header("authorization", format!("Bearer {TEST_AI_KEY}").as_str()))
            .and(body_partial_json(serde_json::json!({
                "model": "gpt-5",
                "max_completion_tokens": 32,
                "response_format": { "type": "json_object" },
            })))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "model": "gpt-5-2026",
                "choices": [{ "message": { "role": "assistant", "content": "{\"ok\":true}" } }],
            })))
            .expect(1)
            .mount(&server)
            .await;
        let completion = client(&server, Provider::Openai).complete(&request(true)).await.unwrap();
        assert_eq!(completion.text, "{\"ok\":true}");
        assert_eq!(completion.model, "gpt-5-2026");
        let sent: serde_json::Value = server.received_requests().await.unwrap()[0].body_json().unwrap();
        assert_eq!(sent["messages"][0]["role"], "system");
        assert_eq!(sent["messages"][1]["content"], "say hi");
    }

    #[tokio::test]
    async fn openai_base_ending_in_v1_is_not_doubled() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/proxy/v1/chat/completions"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "choices": [{ "message": { "content": "ok" } }],
            })))
            .expect(1)
            .mount(&server)
            .await;
        let config =
            AiConfig { base_url: Some(format!("{}/proxy/v1", server.uri())), ..config_for(&server, Provider::Openai) };
        let completion = AiClient::new(&config, None).unwrap().complete(&request(false)).await.unwrap();
        assert_eq!(completion, Completion { text: "ok".into(), model: "gpt-5".into() });
    }

    #[tokio::test]
    async fn ollama_disables_streaming_requests_json_format_and_sends_no_key() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/api/chat"))
            .and(body_partial_json(serde_json::json!({
                "model": "llama3.1",
                "stream": false,
                "format": "json",
                "options": { "num_predict": 32 },
            })))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "model": "llama3.1",
                "message": { "role": "assistant", "content": "{}" },
                "done": true,
            })))
            .expect(1)
            .mount(&server)
            .await;
        let completion = client(&server, Provider::Ollama).complete(&request(true)).await.unwrap();
        assert_eq!(completion.text, "{}");
        let received = server.received_requests().await.unwrap();
        assert!(received[0].headers.get("authorization").is_none());
        assert!(received[0].headers.get("x-api-key").is_none());
    }

    #[tokio::test]
    async fn every_provider_maps_unauthorized_and_rate_limits() {
        for provider in [Provider::Anthropic, Provider::Openai, Provider::Ollama] {
            let unauthorized = failing(
                provider,
                ResponseTemplate::new(401).set_body_json(serde_json::json!({ "error": { "message": "invalid key" } })),
            )
            .await;
            assert_eq!(unauthorized, AiError::Unauthorized, "{provider:?}");
            let limited = failing(provider, ResponseTemplate::new(429).insert_header("retry-after", "12")).await;
            assert_eq!(limited, AiError::RateLimited { retry_after_secs: Some(12) }, "{provider:?}");
        }
    }

    #[tokio::test]
    async fn maps_server_errors_and_provider_messages() {
        assert_eq!(failing(Provider::Anthropic, ResponseTemplate::new(529)).await, AiError::Server { status: 529 });
        let rejected = failing(
            Provider::Ollama,
            ResponseTemplate::new(404).set_body_json(serde_json::json!({ "error": "model \"llama3.1\" not found" })),
        )
        .await;
        assert_eq!(rejected, AiError::Rejected { status: 404, message: Some("model \"llama3.1\" not found".into()) });
        let unreadable = failing(Provider::Openai, ResponseTemplate::new(200).set_body_string("<html>")).await;
        assert!(matches!(unreadable, AiError::Decode { .. }));
    }

    #[tokio::test]
    async fn error_messages_never_echo_the_key() {
        let echoed = format!("Incorrect API key provided: {TEST_AI_KEY}");
        let error = failing(
            Provider::Openai,
            ResponseTemplate::new(400).set_body_json(serde_json::json!({ "error": { "message": echoed } })),
        )
        .await;
        assert!(!error.to_string().contains(TEST_AI_KEY));
        assert!(!serde_json::to_string(&error).unwrap().contains(TEST_AI_KEY));
        assert!(error.to_string().contains(REDACTED));
    }

    #[test]
    fn hosted_providers_require_a_key_unless_local() {
        let anthropic = AiConfig { provider: Provider::Anthropic, ..AiConfig::default() };
        assert_eq!(AiClient::new(&anthropic, None).err(), Some(AiError::MissingKey));
        let openai = AiConfig { provider: Provider::Openai, ..AiConfig::default() };
        assert_eq!(AiClient::new(&openai, None).err(), Some(AiError::MissingKey));
        let local = AiConfig { base_url: Some("http://localhost:1234".into()), ..openai };
        assert!(AiClient::new(&local, None).is_ok());
        let ollama = AiConfig { provider: Provider::Ollama, ..AiConfig::default() };
        assert!(AiClient::new(&ollama, None).is_ok());
    }

    #[test]
    fn base_urls_must_be_https_or_loopback() {
        for ok in [
            "https://api.example.com",
            "https://gw.example.com/openai/v1",
            "http://127.0.0.1:8080",
            "http://localhost:1234",
            "http://[::1]:8000",
        ] {
            assert!(validate_base_url(Provider::Openai, ok).is_ok(), "{ok}");
        }
        for bad in [
            "http://api.example.com",
            "http://192.168.1.10:11434",
            "ftp://127.0.0.1",
            "file:///etc/passwd",
            "https://user:pass@api.example.com",
            "https://api.example.com/?key=1",
            "api.example.com",
            "",
        ] {
            assert!(validate_base_url(Provider::Openai, bad).is_err(), "{bad}");
            assert!(validate_base_url(Provider::Anthropic, bad).is_err(), "{bad}");
        }
        assert!(validate_base_url(Provider::Ollama, "http://127.0.0.1:11434").is_ok());
        assert!(validate_base_url(Provider::Ollama, "https://ollama.example.com").is_err());
        assert!(validate_base_url(Provider::Ollama, "http://10.0.0.5:11434").is_err());
    }

    #[test]
    fn normalization_fills_defaults_and_validates() {
        let config =
            AiConfig { provider: Provider::Ollama, model: "  ".into(), base_url: Some("  ".into()), enabled: true }
                .normalized()
                .unwrap();
        assert_eq!(config.model, "llama3.1");
        assert_eq!(config.base_url, None);
        let bad = AiConfig { base_url: Some("http://example.com".into()), ..AiConfig::default() }.normalized();
        assert!(matches!(bad, Err(AiError::InvalidConfig { .. })));
    }

    #[test]
    fn keys_are_validated_and_never_debug_printed() {
        assert!(AiKey::parse("short").is_err());
        assert!(AiKey::parse("has a space in it").is_err());
        let key = AiKey::parse(&format!("  {TEST_AI_KEY}\n")).unwrap();
        assert_eq!(key.expose(), TEST_AI_KEY);
        assert!(!format!("{key:?}").contains(TEST_AI_KEY));
    }

    #[test]
    fn errors_serialize_as_tagged_union() {
        assert_eq!(serde_json::to_value(AiError::Disabled).unwrap(), serde_json::json!({ "kind": "disabled" }));
        assert_eq!(
            serde_json::to_value(AiError::RateLimited { retry_after_secs: None }).unwrap(),
            serde_json::json!({ "kind": "rateLimited", "retryAfterSecs": null })
        );
    }
}
