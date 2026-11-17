use serde::Deserialize;
use url::Url;

use super::{AiKey, CompletionRequest, Reply, chat_messages, endpoint};

pub(super) fn request(
    http: &reqwest::Client,
    base: &Url,
    model: &str,
    key: Option<&AiKey>,
    request: &CompletionRequest<'_>,
) -> reqwest::RequestBuilder {
    // COMPAT: OpenAI's reasoning models reject the legacy `max_tokens`; compatible servers that
    // predate `max_completion_tokens` ignore unknown fields, which only loses the cap.
    let mut body = serde_json::json!({
        "model": model,
        "messages": chat_messages(request.system, request.prompt),
        "max_completion_tokens": request.max_tokens,
    });
    if request.json {
        body["response_format"] = serde_json::json!({ "type": "json_object" });
    }
    let builder = http.post(chat_completions(base)).json(&body);
    match key {
        Some(key) => builder.bearer_auth(key.expose()),
        None => builder,
    }
}

/// Many compatible gateways document their base URL with the `/v1` already on it.
fn chat_completions(base: &Url) -> Url {
    let has_version = base.path_segments().and_then(|mut segments| segments.rfind(|s| !s.is_empty())) == Some("v1");
    if has_version { endpoint(base, &["chat", "completions"]) } else { endpoint(base, &["v1", "chat", "completions"]) }
}

#[derive(Deserialize)]
struct Response {
    #[serde(default)]
    model: Option<String>,
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    message: Message,
}

#[derive(Deserialize)]
struct Message {
    #[serde(default)]
    content: Option<String>,
}

pub(super) fn parse(bytes: &[u8]) -> Result<Reply, String> {
    let response: Response = serde_json::from_slice(bytes).map_err(|error| error.to_string())?;
    let choice = response.choices.into_iter().next().ok_or_else(|| "the response contained no choices".to_owned())?;
    Ok(Reply { text: choice.message.content.unwrap_or_default(), model: response.model })
}
