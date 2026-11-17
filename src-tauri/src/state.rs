use std::sync::{Mutex, PoisonError};
use tokio::sync::RwLock;
use url::Url;

use crate::ai::AiKey;
use crate::api::client::ApiClient;
use crate::cache::Cache;
use crate::credentials::{AiKeyStore, CredentialStore, Credentials};
use crate::error::{CommandError, CommandResult};
use crate::redaction::SecretRegistry;

pub(crate) struct AppState {
    pub base_url: Url,
    pub cache: Cache,
    pub secrets: SecretRegistry,
    store: Box<dyn CredentialStore>,
    session: RwLock<Option<Session>>,
    ai_keys: Box<dyn AiKeyStore>,
    ai_key: Mutex<KeyCache>,
}

/// Avoids a keychain round trip (and possibly an OS prompt) on every AI call.
#[derive(Clone)]
enum KeyCache {
    Unloaded,
    Loaded(Option<AiKey>),
}

#[derive(Clone)]
struct Session {
    username: String,
    client: ApiClient,
}

impl AppState {
    pub(crate) fn new(
        base_url: Url,
        cache: Cache,
        store: Box<dyn CredentialStore>,
        ai_keys: Box<dyn AiKeyStore>,
        secrets: SecretRegistry,
    ) -> Self {
        Self {
            base_url,
            cache,
            secrets,
            store,
            session: RwLock::new(None),
            ai_keys,
            ai_key: Mutex::new(KeyCache::Unloaded),
        }
    }

    pub(crate) fn client_for(&self, credentials: Credentials) -> CommandResult<ApiClient> {
        self.secrets.register(&credentials);
        Ok(ApiClient::new(&self.base_url, credentials)?)
    }

    pub(crate) async fn restore(&self) -> CommandResult<Option<String>> {
        if let Some(session) = self.session.read().await.as_ref() {
            return Ok(Some(session.username.clone()));
        }
        let Some(credentials) = self.store.load()? else {
            return Ok(None);
        };
        let username = credentials.username.clone();
        let client = self.client_for(credentials)?;
        *self.session.write().await = Some(Session { username: username.clone(), client });
        Ok(Some(username))
    }

    pub(crate) async fn client(&self) -> CommandResult<ApiClient> {
        if let Some(session) = self.session.read().await.as_ref() {
            return Ok(session.client.clone());
        }
        self.restore().await?;
        self.session.read().await.as_ref().map(|session| session.client.clone()).ok_or(CommandError::NotSignedIn)
    }

    pub(crate) async fn try_client(&self) -> Option<ApiClient> {
        self.client().await.ok()
    }

    pub(crate) async fn activate(&self, credentials: Credentials, client: ApiClient) -> CommandResult<()> {
        self.store.save(&credentials)?;
        *self.session.write().await = Some(Session { username: credentials.username, client });
        Ok(())
    }

    /// Loads the AI provider key, registering it for log redaction before anyone can use it.
    pub(crate) fn ai_key(&self) -> CommandResult<Option<AiKey>> {
        let mut cached = self.ai_key.lock().unwrap_or_else(PoisonError::into_inner);
        if let KeyCache::Loaded(key) = &*cached {
            return Ok(key.clone());
        }
        let raw = self.ai_keys.load()?;
        if let Some(raw) = &raw {
            self.secrets.register_value(raw.trim());
        }
        let key = raw.and_then(|raw| AiKey::parse(&raw).ok());
        *cached = KeyCache::Loaded(key.clone());
        Ok(key)
    }

    /// Replaces (`Some`) or removes (`None`) the AI provider key in the keychain.
    pub(crate) fn set_ai_key(&self, key: Option<AiKey>) -> CommandResult<()> {
        let mut cached = self.ai_key.lock().unwrap_or_else(PoisonError::into_inner);
        match &key {
            Some(key) => {
                self.secrets.register_value(key.expose());
                self.ai_keys.save(key.expose())?;
            }
            None => self.ai_keys.clear()?,
        }
        *cached = KeyCache::Loaded(key);
        Ok(())
    }

    /// Signing out removes every secret and all local data, including the AI provider key.
    pub(crate) async fn sign_out(&self) -> CommandResult<()> {
        *self.session.write().await = None;
        self.store.clear()?;
        self.set_ai_key(None)?;
        self.secrets.clear();
        self.cache.wipe()?;
        Ok(())
    }
}
