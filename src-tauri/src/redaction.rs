use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use std::io::{self, Write};
use std::sync::{Arc, PoisonError, RwLock};
use tracing_subscriber::fmt::MakeWriter;

use crate::credentials::Credentials;

const REDACTED: &str = "[redacted]";

#[derive(Clone, Default)]
pub(crate) struct SecretRegistry(Arc<RwLock<Vec<String>>>);

impl SecretRegistry {
    pub(crate) fn register(&self, credentials: &Credentials) {
        let token = credentials.token.expose();
        let basic = STANDARD.encode(format!("{}:{token}", credentials.username));
        let mut secrets = self.0.write().unwrap_or_else(PoisonError::into_inner);
        for secret in [token.to_owned(), basic] {
            if !secret.is_empty() && !secrets.contains(&secret) {
                secrets.push(secret);
            }
        }
    }

    pub(crate) fn clear(&self) {
        self.0.write().unwrap_or_else(PoisonError::into_inner).clear();
    }

    pub(crate) fn redact(&self, text: &str) -> String {
        let secrets = self.0.read().unwrap_or_else(PoisonError::into_inner);
        secrets.iter().fold(text.to_owned(), |acc, secret| acc.replace(secret.as_str(), REDACTED))
    }
}

#[derive(Clone)]
pub(crate) struct RedactingMakeWriter<M> {
    inner: M,
    secrets: SecretRegistry,
}

impl<M> RedactingMakeWriter<M> {
    pub(crate) fn new(inner: M, secrets: SecretRegistry) -> Self {
        Self { inner, secrets }
    }
}

pub(crate) struct RedactingWriter<W> {
    inner: W,
    secrets: SecretRegistry,
}

impl<W: Write> Write for RedactingWriter<W> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let redacted = self.secrets.redact(&String::from_utf8_lossy(buf));
        self.inner.write_all(redacted.as_bytes())?;
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}

impl<'a, M: MakeWriter<'a>> MakeWriter<'a> for RedactingMakeWriter<M> {
    type Writer = RedactingWriter<M::Writer>;

    fn make_writer(&'a self) -> Self::Writer {
        RedactingWriter { inner: self.inner.make_writer(), secrets: self.secrets.clone() }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replaces_token_and_basic_auth_value() {
        let registry = SecretRegistry::default();
        let credentials = Credentials::new("alice", "tok-123").unwrap();
        registry.register(&credentials);
        let header = STANDARD.encode("alice:tok-123");
        let line = format!("auth Basic {header} token=tok-123");
        assert_eq!(registry.redact(&line), "auth Basic [redacted] token=[redacted]");
        registry.clear();
        assert_eq!(registry.redact("tok-123"), "tok-123");
    }

    #[test]
    fn writer_redacts_before_forwarding() {
        let registry = SecretRegistry::default();
        registry.register(&Credentials::new("bob", "zz-secret").unwrap());
        let mut writer = RedactingWriter { inner: Vec::new(), secrets: registry };
        writer.write_all(b"leaked zz-secret here").unwrap();
        assert_eq!(String::from_utf8(writer.inner).unwrap(), "leaked [redacted] here");
    }
}
