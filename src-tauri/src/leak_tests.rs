use base64::Engine;
use std::io::Write;
use std::sync::{Arc, Mutex};
use url::Url;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

use crate::api::client::testing::{TEST_TOKEN, TEST_USERNAME};
use crate::cache::Cache;
use crate::credentials::Credentials;
use crate::credentials::memory::{MemoryAiKeyStore, MemoryStore};
use crate::redaction::{RedactingMakeWriter, SecretRegistry};
use crate::state::AppState;
use crate::sync;

#[derive(Clone, Default)]
struct Captured(Arc<Mutex<Vec<u8>>>);

impl Write for Captured {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.0.lock().unwrap().extend_from_slice(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

fn secrets() -> [String; 2] {
    let basic = base64::engine::general_purpose::STANDARD.encode(format!("{TEST_USERNAME}:{TEST_TOKEN}"));
    [TEST_TOKEN.to_owned(), basic]
}

fn assert_clean(label: &str, haystack: &[u8]) {
    let text = String::from_utf8_lossy(haystack);
    for secret in secrets() {
        assert!(!text.contains(&secret), "{label} leaked a credential");
    }
}

async fn mock_api() -> MockServer {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/v1/hackers/programs"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({ "data": [{
            "id": "9", "type": "program", "attributes": { "handle": "acme", "name": "Acme" }
        }] })))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/v1/hackers/me/reports"))
        .respond_with(ResponseTemplate::new(401).insert_header("www-authenticate", "Basic realm=\"api\""))
        .mount(&server)
        .await;
    server
}

#[tokio::test]
async fn credentials_never_reach_logs_database_or_webview_payloads() {
    let raw_logs = Captured::default();
    let redacted_logs = Captured::default();
    let registry = SecretRegistry::default();
    let raw_writer = raw_logs.clone();
    let subscriber = tracing_subscriber::fmt()
        .with_max_level(tracing::Level::TRACE)
        .with_writer(move || raw_writer.clone())
        .finish();
    let _guard = tracing::subscriber::set_default(subscriber);

    let server = mock_api().await;
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("cache.sqlite3");
    let state = AppState::new(
        Url::parse(&server.uri()).unwrap(),
        Cache::open(db_path.clone()).unwrap(),
        Box::new(MemoryStore::default()),
        Box::new(MemoryAiKeyStore::default()),
        registry.clone(),
    );

    let credentials = Credentials::new(TEST_USERNAME, TEST_TOKEN).unwrap();
    let client = state.client_for(credentials.clone()).unwrap();
    crate::api::programs::verify_access(&client).await.unwrap();
    state.activate(credentials, client.clone()).await.unwrap();

    let programs = sync::programs(&client, &state.cache).await.unwrap();
    let failure = sync::reports(&client, &state.cache).await.unwrap_err();
    tracing::error!(error = %failure, debug = ?failure, client_state = ?state.restore().await, "captured failure");

    assert!(!raw_logs.0.lock().unwrap().is_empty(), "the subscriber captured nothing");
    assert_clean("trace logs", &raw_logs.0.lock().unwrap());

    let sink = redacted_logs.clone();
    let redacting = RedactingMakeWriter::new(move || sink.clone(), registry);
    let mut writer = tracing_subscriber::fmt::MakeWriter::make_writer(&redacting);
    writeln!(writer, "Authorization: Basic {} token={TEST_TOKEN}", secrets()[1]).unwrap();
    assert_clean("redacted logs", &redacted_logs.0.lock().unwrap());

    for payload in [
        serde_json::to_vec(&programs).unwrap(),
        serde_json::to_vec(&failure).unwrap(),
        serde_json::to_vec(&state.restore().await.unwrap()).unwrap(),
    ] {
        assert_clean("webview payload", &payload);
    }

    drop(state);
    for suffix in ["", "-wal", "-shm"] {
        let mut file = db_path.clone().into_os_string();
        file.push(suffix);
        if let Ok(bytes) = std::fs::read(&file) {
            assert_clean("sqlite file", &bytes);
        }
    }
}

const VULN_DETAIL: &str = "SSRF-VIA-PDF-RENDERER-169.254.169.254";

#[tokio::test]
async fn ai_key_and_prompt_never_reach_logs_database_or_webview_payloads() {
    use crate::ai::Provider;
    use crate::ai::testing::{TEST_AI_KEY, config_for};
    use crate::commands::ai;

    let raw_logs = Captured::default();
    let raw_writer = raw_logs.clone();
    let subscriber = tracing_subscriber::fmt()
        .with_max_level(tracing::Level::TRACE)
        .with_writer(move || raw_writer.clone())
        .finish();
    let _guard = tracing::subscriber::set_default(subscriber);

    let server = MockServer::start().await;
    let echoed = serde_json::json!({ "error": { "message": format!("Incorrect API key provided: {TEST_AI_KEY}") } });
    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(400).set_body_json(echoed.clone()))
        .up_to_n_times(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(401).set_body_json(echoed))
        .up_to_n_times(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "model": "gpt-5", "choices": [{ "message": { "content": "triaged" } }],
        })))
        .mount(&server)
        .await;

    let registry = SecretRegistry::default();
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("cache.sqlite3");
    let state = AppState::new(
        Url::parse("http://127.0.0.1:9/").unwrap(),
        Cache::open(db_path.clone()).unwrap(),
        Box::new(MemoryStore::default()),
        Box::new(MemoryAiKeyStore::default()),
        registry.clone(),
    );
    let config = config_for(&server, Provider::Openai);
    let view = ai::save_settings(&state, config, Some(TEST_AI_KEY)).unwrap();

    let rejected = ai::complete(&state, "triage", VULN_DETAIL, None, false).await.unwrap_err();
    let unauthorized = ai::test_connection(&state).await.unwrap_err();
    let completion = ai::complete(&state, "triage", VULN_DETAIL, None, true).await.unwrap();
    tracing::error!(error = %rejected, debug = ?rejected, key = ?state.ai_key(), "captured ai failure");
    tracing::error!(error = %unauthorized, debug = ?unauthorized, "captured ai failure");

    let logs = raw_logs.0.lock().unwrap().clone();
    assert!(!logs.is_empty(), "the subscriber captured nothing");
    let logs = String::from_utf8_lossy(&logs);
    assert!(!logs.contains(TEST_AI_KEY), "trace logs leaked the AI key");
    assert!(!logs.contains(VULN_DETAIL), "trace logs leaked the prompt body");

    let sink = Captured::default();
    let writer_sink = sink.clone();
    let redacting = RedactingMakeWriter::new(move || writer_sink.clone(), registry);
    let mut writer = tracing_subscriber::fmt::MakeWriter::make_writer(&redacting);
    writeln!(writer, "authorization: Bearer {TEST_AI_KEY}").unwrap();
    assert!(!String::from_utf8_lossy(&sink.0.lock().unwrap()).contains(TEST_AI_KEY), "redacted logs leaked the AI key");

    for payload in [
        serde_json::to_string(&view).unwrap(),
        serde_json::to_string(&ai::settings_view(&state).unwrap()).unwrap(),
        serde_json::to_string(&rejected).unwrap(),
        rejected.to_string(),
        serde_json::to_string(&unauthorized).unwrap(),
        serde_json::to_string(&completion).unwrap(),
    ] {
        assert!(!payload.contains(TEST_AI_KEY), "webview payload leaked the AI key: {payload}");
    }

    drop(state);
    for suffix in ["", "-wal", "-shm"] {
        let mut file = db_path.clone().into_os_string();
        file.push(suffix);
        if let Ok(bytes) = std::fs::read(&file) {
            assert!(!String::from_utf8_lossy(&bytes).contains(TEST_AI_KEY), "sqlite file leaked the AI key");
        }
    }
}
