use serde::Deserialize;
use url::Url;

use super::{CompletionRequest, Reply, chat_messages, endpoint};

pub(super) fn request(
    http: &reqwest::Client,
    base: &Url,
    model: &str,
    request: &CompletionRequest<'_>,
) -> reqwest::RequestBuilder {
    let mut body = serde_json::json!({
        "model": model,
        "messages": chat_messages(request.system, request.prompt),
        "stream": false,
        "options": { "num_predict": request.max_tokens },
    });
    if request.json {
        body["format"] = serde_json::Value::from("json");
    }
    http.post(endpoint(base, &["api", "chat"])).json(&body)
}

#[derive(Deserialize)]
struct Response {
    #[serde(default)]
    model: Option<String>,
    message: Message,
}

#[derive(Deserialize)]
struct Message {
    #[serde(default)]
    content: String,
}

pub(super) fn parse(bytes: &[u8]) -> Result<Reply, String> {
    let response: Response = serde_json::from_slice(bytes).map_err(|error| error.to_string())?;
    Ok(Reply { text: response.message.content, model: response.model })
}
