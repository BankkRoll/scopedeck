use serde::Serialize;

use crate::ai::AiError;
use crate::api::error::ApiError;
use crate::api::reports::NewReportError;
use crate::cache::CacheError;
use crate::credentials::CredentialError;

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub(crate) enum CommandError {
    #[error(transparent)]
    Api { error: ApiError },
    #[error("sign in to continue")]
    NotSignedIn,
    #[error("{message}")]
    Credentials { message: String },
    #[error("{message}")]
    Cache { message: String },
    #[error("{message}")]
    Invalid { message: String },
    #[error("{message}")]
    NotFound { message: String },
    #[error("{message}")]
    File { message: String },
    #[error("{message}")]
    Update { message: String },
    /// `message` duplicates the `Display` of `error` so generic UI can show it without a lookup.
    #[error("{message}")]
    Ai { error: AiError, message: String },
}

impl From<AiError> for CommandError {
    fn from(error: AiError) -> Self {
        match error {
            AiError::InvalidConfig { message } => Self::Invalid { message },
            other => Self::Ai { message: other.to_string(), error: other },
        }
    }
}

impl From<ApiError> for CommandError {
    fn from(error: ApiError) -> Self {
        Self::Api { error }
    }
}

impl From<CacheError> for CommandError {
    fn from(error: CacheError) -> Self {
        tracing::error!(error = %error, "cache failure");
        Self::Cache { message: error.to_string() }
    }
}

impl From<CredentialError> for CommandError {
    fn from(error: CredentialError) -> Self {
        match error {
            CredentialError::Invalid(message) => Self::Invalid { message },
            other => Self::Credentials { message: other.to_string() },
        }
    }
}

impl From<NewReportError> for CommandError {
    fn from(error: NewReportError) -> Self {
        Self::Invalid { message: error.to_string() }
    }
}

impl CommandError {
    pub(crate) fn invalid(message: impl Into<String>) -> Self {
        Self::Invalid { message: message.into() }
    }

    pub(crate) fn file(message: impl Into<String>) -> Self {
        Self::File { message: message.into() }
    }
}

pub(crate) type CommandResult<T> = Result<T, CommandError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nests_api_errors_under_a_tag() {
        let value = serde_json::to_value(CommandError::from(ApiError::Unauthorized { detail: None })).unwrap();
        assert_eq!(value, serde_json::json!({ "kind": "api", "error": { "kind": "unauthorized", "detail": null } }));
        let value = serde_json::to_value(CommandError::NotSignedIn).unwrap();
        assert_eq!(value, serde_json::json!({ "kind": "notSignedIn" }));
    }

    #[test]
    fn nests_ai_errors_with_a_message_and_flattens_config_errors() {
        let value = serde_json::to_value(CommandError::from(AiError::Disabled)).unwrap();
        assert_eq!(
            value,
            serde_json::json!({
                "kind": "ai",
                "error": { "kind": "disabled" },
                "message": "AI assistance is turned off; enable it in Settings",
            })
        );
        let value = serde_json::to_value(CommandError::from(AiError::invalid("bad url"))).unwrap();
        assert_eq!(value, serde_json::json!({ "kind": "invalid", "message": "bad url" }));
    }
}
