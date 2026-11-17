use tokio::sync::RwLock;
use url::Url;

use crate::api::client::ApiClient;
use crate::cache::Cache;
use crate::credentials::{CredentialStore, Credentials};
use crate::error::{CommandError, CommandResult};
use crate::redaction::SecretRegistry;

pub(crate) struct AppState {
    pub base_url: Url,
    pub cache: Cache,
    pub secrets: SecretRegistry,
    store: Box<dyn CredentialStore>,
    session: RwLock<Option<Session>>,
}

#[derive(Clone)]
struct Session {
    username: String,
    client: ApiClient,
}

impl AppState {
    pub(crate) fn new(base_url: Url, cache: Cache, store: Box<dyn CredentialStore>, secrets: SecretRegistry) -> Self {
        Self { base_url, cache, secrets, store, session: RwLock::new(None) }
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

    pub(crate) async fn sign_out(&self) -> CommandResult<()> {
        *self.session.write().await = None;
        self.store.clear()?;
        self.secrets.clear();
        self.cache.wipe()?;
        Ok(())
    }
}
