use serde::{Deserialize, Serialize};
use std::fmt;

const KEYCHAIN_SERVICE: &str = "dev.scopedeck.app";
const KEYCHAIN_ACCOUNT: &str = "hacker-api-credentials";
const AI_KEY_ACCOUNT: &str = "ai-provider-key";

#[derive(Clone)]
pub(crate) struct ApiToken(String);

impl ApiToken {
    pub(crate) fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    pub(crate) fn expose(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for ApiToken {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("ApiToken(<redacted>)")
    }
}

#[derive(Clone, Debug)]
pub(crate) struct Credentials {
    pub username: String,
    pub token: ApiToken,
}

impl Credentials {
    pub(crate) fn new(username: &str, token: &str) -> Result<Self, CredentialError> {
        let username = username.trim();
        let token = token.trim();
        if username.is_empty() {
            return Err(CredentialError::Invalid("enter your HackerOne username".into()));
        }
        if token.is_empty() {
            return Err(CredentialError::Invalid("enter your API token".into()));
        }
        if username.chars().any(char::is_whitespace) || token.chars().any(char::is_whitespace) {
            return Err(CredentialError::Invalid("the username and token cannot contain spaces".into()));
        }
        Ok(Self { username: username.to_owned(), token: ApiToken::new(token) })
    }
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum CredentialError {
    #[error("{0}")]
    Invalid(String),
    #[error("the system keychain is unavailable: {0}")]
    Unavailable(String),
    #[error("the stored credentials are unreadable; sign in again")]
    Corrupt,
}

pub(crate) trait CredentialStore: Send + Sync {
    fn load(&self) -> Result<Option<Credentials>, CredentialError>;
    fn save(&self, credentials: &Credentials) -> Result<(), CredentialError>;
    fn clear(&self) -> Result<(), CredentialError>;
}

/// Holds the AI provider API key, kept apart from the Hacker API credentials so either can be
/// replaced or cleared without touching the other.
pub(crate) trait AiKeyStore: Send + Sync {
    fn load(&self) -> Result<Option<String>, CredentialError>;
    fn save(&self, key: &str) -> Result<(), CredentialError>;
    fn clear(&self) -> Result<(), CredentialError>;
}

/// Deletes every secret Scopedeck keeps in the system keychain: the Hacker API credentials and
/// the AI provider key. Missing entries are not an error.
/// Both are attempted even if the first fails, so one broken entry cannot strand the other.
pub(crate) fn remove_all(api: &dyn CredentialStore, ai: &dyn AiKeyStore) -> Result<(), CredentialError> {
    let api = api.clear();
    let ai = ai.clear();
    api.and(ai)
}

#[derive(Serialize, Deserialize)]
struct StoredCredentials {
    username: String,
    token: String,
}

pub(crate) struct KeychainStore;

impl KeychainStore {
    fn entry() -> Result<keyring::Entry, CredentialError> {
        Self::entry_for(KEYCHAIN_ACCOUNT)
    }

    fn entry_for(account: &str) -> Result<keyring::Entry, CredentialError> {
        keyring::Entry::new(KEYCHAIN_SERVICE, account).map_err(|error| CredentialError::Unavailable(error.to_string()))
    }
}

impl AiKeyStore for KeychainStore {
    fn load(&self) -> Result<Option<String>, CredentialError> {
        match Self::entry_for(AI_KEY_ACCOUNT)?.get_password() {
            Ok(key) => Ok(Some(key)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(CredentialError::Unavailable(error.to_string())),
        }
    }

    fn save(&self, key: &str) -> Result<(), CredentialError> {
        Self::entry_for(AI_KEY_ACCOUNT)?
            .set_password(key)
            .map_err(|error| CredentialError::Unavailable(error.to_string()))
    }

    fn clear(&self) -> Result<(), CredentialError> {
        match Self::entry_for(AI_KEY_ACCOUNT)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(CredentialError::Unavailable(error.to_string())),
        }
    }
}

impl CredentialStore for KeychainStore {
    fn load(&self) -> Result<Option<Credentials>, CredentialError> {
        match Self::entry()?.get_password() {
            Ok(raw) => {
                let stored: StoredCredentials = serde_json::from_str(&raw).map_err(|_| CredentialError::Corrupt)?;
                Ok(Some(Credentials { username: stored.username, token: ApiToken::new(stored.token) }))
            }
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(CredentialError::Unavailable(error.to_string())),
        }
    }

    fn save(&self, credentials: &Credentials) -> Result<(), CredentialError> {
        let raw = serde_json::to_string(&StoredCredentials {
            username: credentials.username.clone(),
            token: credentials.token.expose().to_owned(),
        })
        .map_err(|_| CredentialError::Corrupt)?;
        Self::entry()?.set_password(&raw).map_err(|error| CredentialError::Unavailable(error.to_string()))
    }

    fn clear(&self) -> Result<(), CredentialError> {
        match Self::entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(CredentialError::Unavailable(error.to_string())),
        }
    }
}

#[cfg(test)]
pub(crate) mod memory {
    use super::*;
    use std::sync::Mutex;

    #[derive(Default)]
    pub(crate) struct MemoryStore(Mutex<Option<(String, String)>>);

    impl CredentialStore for MemoryStore {
        fn load(&self) -> Result<Option<Credentials>, CredentialError> {
            Ok(self
                .0
                .lock()
                .unwrap()
                .clone()
                .map(|(username, token)| Credentials { username, token: ApiToken::new(token) }))
        }

        fn save(&self, credentials: &Credentials) -> Result<(), CredentialError> {
            *self.0.lock().unwrap() = Some((credentials.username.clone(), credentials.token.expose().to_owned()));
            Ok(())
        }

        fn clear(&self) -> Result<(), CredentialError> {
            *self.0.lock().unwrap() = None;
            Ok(())
        }
    }

    #[derive(Default)]
    pub(crate) struct MemoryAiKeyStore(pub(crate) Mutex<Option<String>>);

    impl AiKeyStore for MemoryAiKeyStore {
        fn load(&self) -> Result<Option<String>, CredentialError> {
            Ok(self.0.lock().unwrap().clone())
        }

        fn save(&self, key: &str) -> Result<(), CredentialError> {
            *self.0.lock().unwrap() = Some(key.to_owned());
            Ok(())
        }

        fn clear(&self) -> Result<(), CredentialError> {
            *self.0.lock().unwrap() = None;
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remove_all_clears_the_token_and_the_ai_key() {
        let api = memory::MemoryStore::default();
        let ai = memory::MemoryAiKeyStore::default();
        CredentialStore::save(&api, &Credentials::new("hacker", "token-value").unwrap()).unwrap();
        AiKeyStore::save(&ai, "sk-test-key").unwrap();

        remove_all(&api, &ai).unwrap();

        assert!(CredentialStore::load(&api).unwrap().is_none());
        assert!(AiKeyStore::load(&ai).unwrap().is_none());
    }

    #[test]
    fn debug_output_never_contains_the_token() {
        let credentials = Credentials::new("hacker", "s3cr3t-token-value").unwrap();
        let rendered = format!("{credentials:?}");
        assert!(!rendered.contains("s3cr3t-token-value"));
        assert!(rendered.contains("<redacted>"));
    }

    #[test]
    fn rejects_blank_or_spaced_input() {
        assert!(Credentials::new(" ", "x").is_err());
        assert!(Credentials::new("user", "").is_err());
        assert!(Credentials::new("user", "two words").is_err());
        let trimmed = Credentials::new("  user ", " tok ").unwrap();
        assert_eq!(trimmed.username, "user");
        assert_eq!(trimmed.token.expose(), "tok");
    }
}
