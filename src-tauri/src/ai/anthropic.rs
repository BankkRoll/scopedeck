use reqwest::header::HeaderValue;
use serde::Deserialize;
use url::Url;

use super::{AiError, AiKey, CompletionRequest, Reply, endpoint};

const API_VERSION: &str = "2023-06-01";

pub(super) fn request(
    http: &reqwest::Client,
    base: &Url,
    model: &str,
    key: Option<&AiKey>,
    request: &CompletionRequest<'_>,
) -> Result<reqwest::RequestBuilder, AiError> {
    let mut body = serde_json::json!({
        "model": model,
        "max_tokens": request.max_tokens,
        "messages": [{ "role": "user", "content": request.prompt }],
    });
    if !request.system.is_empty() {
        body["system"] = serde_json::Value::from(request.system);
    }
    let mut builder =
        http.post(endpoint(base, &["v1", "messages"])).header("anthropic-version", API_VERSION).json(&body);
    if let Some(key) = key {
        let mut value = HeaderValue::from_str(key.expose())
            .map_err(|_| AiError::invalid("the stored API key contains characters that cannot be sent"))?;
        value.set_sensitive(true);
        builder = builder.header("x-api-key", value);
    }
    Ok(builder)
}

#[derive(Deserialize)]
struct Response {
    #[serde(default)]
    model: Option<String>,
    content: Vec<Block>,
}

#[derive(Deserialize)]
struct Block {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    text: Option<String>,
}

pub(super) fn parse(bytes: &[u8]) -> Result<Reply, String> {
    let response: Response = serde_json::from_slice(bytes).map_err(|error| error.to_string())?;
    let text = response
        .content
        .into_iter()
        .filter(|block| block.kind == "text")
        .filter_map(|block| block.text)
        .collect::<String>();
    Ok(Reply { text, model: response.model })
}
