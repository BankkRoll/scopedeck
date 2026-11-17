use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub(crate) enum ApiError {
    #[error("the API rejected the credentials")]
    Unauthorized { detail: Option<String> },
    #[error("the API token does not have access to this resource")]
    Forbidden { detail: Option<String> },
    #[error("the resource was not found")]
    NotFound { detail: Option<String> },
    #[error("the request was invalid: {}", messages.join("; "))]
    BadRequest { messages: Vec<String> },
    #[error("the API could not process the request: {}", messages.join("; "))]
    Unprocessable { messages: Vec<String> },
    #[error("the API rate limit was reached")]
    RateLimited { retry_after_secs: Option<u64> },
    #[error("the API returned server error {status}")]
    Server { status: u16 },
    #[error("the API returned unexpected status {status}")]
    UnexpectedStatus { status: u16, messages: Vec<String> },
    #[error("could not reach the API: {message}")]
    Network { message: String },
    #[error("the API response could not be read: {message}")]
    Decode { message: String },
    #[error("refusing to follow a link outside the API origin")]
    ForeignLink,
}

#[derive(Debug, Deserialize)]
struct ErrorBody {
    #[serde(default)]
    errors: Vec<ErrorEntry>,
}

#[derive(Debug, Deserialize)]
struct ErrorEntry {
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    detail: serde_json::Value,
    #[serde(default)]
    source: Option<ErrorSource>,
}

#[derive(Debug, Deserialize)]
struct ErrorSource {
    #[serde(default)]
    pointer: Option<String>,
    #[serde(default)]
    parameter: Option<String>,
}

impl ErrorEntry {
    fn message(&self) -> Option<String> {
        let detail = match &self.detail {
            serde_json::Value::String(text) if !text.trim().is_empty() => Some(text.trim().to_owned()),
            serde_json::Value::Object(map) if !map.is_empty() => Some(flatten_detail_object(map)),
            _ => self.title.clone(),
        }?;
        let field = self
            .source
            .as_ref()
            .and_then(|source| source.parameter.clone().or_else(|| source.pointer.as_deref().map(field_from_pointer)));
        Some(match field {
            Some(field) if !detail.contains(&field) => format!("{field}: {detail}"),
            _ => detail,
        })
    }
}

fn field_from_pointer(pointer: &str) -> String {
    pointer.rsplit('/').next().unwrap_or(pointer).to_owned()
}

// Validation failures sometimes arrive with `detail` as a map of field -> messages rather than a
// string (the GET report 404 example even ships `"detail": {}`), so both shapes are flattened.
fn flatten_detail_object(map: &serde_json::Map<String, serde_json::Value>) -> String {
    map.iter()
        .map(|(field, value)| match value {
            serde_json::Value::Array(items) => {
                let joined: Vec<String> = items.iter().map(value_text).collect();
                format!("{field}: {}", joined.join(", "))
            }
            other => format!("{field}: {}", value_text(other)),
        })
        .collect::<Vec<_>>()
        .join("; ")
}

fn value_text(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::String(text) => text.clone(),
        other => other.to_string(),
    }
}

pub(crate) fn error_messages(body: &[u8]) -> Vec<String> {
    serde_json::from_slice::<ErrorBody>(body)
        .map(|parsed| parsed.errors.iter().filter_map(ErrorEntry::message).collect())
        .unwrap_or_default()
}

impl ApiError {
    pub(crate) fn from_status(status: u16, body: &[u8], retry_after: Option<Duration>) -> Self {
        let messages = error_messages(body);
        let detail = messages.first().cloned();
        match status {
            400 => Self::BadRequest { messages },
            401 => Self::Unauthorized { detail },
            403 => Self::Forbidden { detail },
            404 => Self::NotFound { detail },
            422 => Self::Unprocessable { messages },
            429 => Self::RateLimited { retry_after_secs: retry_after.map(|delay| delay.as_secs()) },
            500..=599 => Self::Server { status },
            _ => Self::UnexpectedStatus { status, messages },
        }
    }

    pub(crate) fn decode(error: &impl std::fmt::Display) -> Self {
        Self::Decode { message: error.to_string() }
    }

    pub(crate) fn network(error: reqwest::Error) -> Self {
        let message = if error.is_timeout() {
            "the request timed out".to_owned()
        } else if error.is_connect() {
            "the connection failed; check your network".to_owned()
        } else {
            error.without_url().to_string()
        };
        Self::Network { message }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_status_codes_to_variants() {
        let body = br#"{"errors":[{"status":404,"detail":"Report Intent not found"}]}"#;
        assert_eq!(
            ApiError::from_status(404, body, None),
            ApiError::NotFound { detail: Some("Report Intent not found".into()) }
        );
        assert_eq!(ApiError::from_status(401, b"", None), ApiError::Unauthorized { detail: None });
        assert!(matches!(ApiError::from_status(403, b"{}", None), ApiError::Forbidden { .. }));
        assert_eq!(ApiError::from_status(502, b"<html>", None), ApiError::Server { status: 502 });
        assert_eq!(
            ApiError::from_status(429, b"", Some(Duration::from_secs(7))),
            ApiError::RateLimited { retry_after_secs: Some(7) }
        );
        assert!(matches!(ApiError::from_status(418, b"", None), ApiError::UnexpectedStatus { status: 418, .. }));
    }

    #[test]
    fn collects_validation_messages_with_fields() {
        let body = br#"{"errors":[
            {"status":422,"detail":"can't be blank","source":{"pointer":"/data/attributes/severity_rating"}},
            {"status":422,"detail":{"title":["is too long"]}}
        ]}"#;
        assert_eq!(
            ApiError::from_status(422, body, None),
            ApiError::Unprocessable {
                messages: vec!["severity_rating: can't be blank".into(), "title: is too long".into()]
            }
        );
    }

    #[test]
    fn tolerates_documented_empty_object_detail() {
        let body = br#"{"errors":[{"status":0,"detail":{}}]}"#;
        assert_eq!(ApiError::from_status(404, body, None), ApiError::NotFound { detail: None });
    }

    #[test]
    fn serializes_as_tagged_union() {
        let value = serde_json::to_value(ApiError::RateLimited { retry_after_secs: Some(3) }).unwrap();
        assert_eq!(value, serde_json::json!({ "kind": "rateLimited", "retryAfterSecs": 3 }));
    }
}
