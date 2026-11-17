use tracing_subscriber::EnvFilter;

use crate::redaction::{RedactingMakeWriter, SecretRegistry};

const LOG_ENV: &str = "SCOPEDECK_LOG";

pub(crate) fn init(secrets: SecretRegistry) {
    let filter = EnvFilter::try_from_env(LOG_ENV).unwrap_or_else(|_| EnvFilter::new("scopedeck_lib=info,warn"));
    let _ = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(false)
        .with_writer(RedactingMakeWriter::new(std::io::stderr, secrets))
        .try_init();
}
