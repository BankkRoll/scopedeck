use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::BTreeMap;
use std::time::Duration;

use super::attachments::{Attachment, AttachmentAttributes};
use super::client::{ApiClient, UploadFile};
use super::error::ApiError;
use super::jsonapi::{Document, Many, One, Resource, ResourceRef};
use super::rate_limit::Bucket;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum IntentState {
    Pending,
    Draft,
    ReadyToSubmit,
    Submitted,
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum IntentPhase {
    Analyzing,
    NeedsInput,
    Ready,
    Submitted,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct IntentMetadata {
    pub bug_class: Option<String>,
    pub http_method: Option<String>,
    pub vulnerable_url: Option<String>,
    pub vulnerable_parameter: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReportIntent {
    pub id: String,
    pub title: Option<String>,
    pub description: String,
    pub state: IntentState,
    pub phase: IntentPhase,
    pub has_failing_jobs: bool,
    pub has_canceled_jobs: bool,
    pub job_status_by_type: BTreeMap<String, String>,
    pub metadata: IntentMetadata,
    pub program_id: Option<String>,
    pub report_id: Option<String>,
    pub attachments: Vec<Attachment>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

impl ReportIntent {
    fn has_running_jobs(&self) -> bool {
        self.job_status_by_type
            .values()
            .any(|status| matches!(status.as_str(), "pending" | "running" | "queued" | "in_progress"))
    }

    pub(crate) fn derive_phase(&self) -> IntentPhase {
        match self.state {
            IntentState::Submitted => IntentPhase::Submitted,
            IntentState::ReadyToSubmit => IntentPhase::Ready,
            _ if self.has_failing_jobs || self.has_canceled_jobs => IntentPhase::Failed,
            IntentState::Pending | IntentState::Unknown => IntentPhase::Analyzing,
            IntentState::Draft if self.has_running_jobs() => IntentPhase::Analyzing,
            IntentState::Draft => IntentPhase::NeedsInput,
        }
    }

    pub(crate) fn is_settled(&self) -> bool {
        self.phase != IntentPhase::Analyzing
    }

    pub(crate) fn can_submit(&self) -> bool {
        self.state == IntentState::ReadyToSubmit
    }
}

#[derive(Debug, Deserialize)]
struct IntentAttributes {
    title: Option<String>,
    #[serde(default)]
    description: String,
    state: IntentState,
    #[serde(default)]
    has_failing_jobs: bool,
    #[serde(default)]
    has_canceled_jobs: bool,
    #[serde(default)]
    job_status_by_type: BTreeMap<String, serde_json::Value>,
    #[serde(default)]
    metadata: Option<MetadataAttributes>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct MetadataAttributes {
    bug_class: Option<String>,
    http_method: Option<String>,
    vulnerable_url: Option<String>,
    vulnerable_parameter: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct IntentRelationships {
    program: Option<One<ResourceRef>>,
    report: Option<One<ResourceRef>>,
    #[serde(default)]
    attachments: Many<Resource<AttachmentAttributes>>,
}

type IntentResource = Resource<IntentAttributes, IntentRelationships>;

impl From<IntentResource> for ReportIntent {
    fn from(resource: IntentResource) -> Self {
        let a = resource.attributes;
        let r = resource.relationships;
        let metadata = a.metadata.unwrap_or_default();
        let mut intent = Self {
            id: resource.id,
            title: a.title,
            description: a.description,
            state: a.state,
            phase: IntentPhase::Analyzing,
            has_failing_jobs: a.has_failing_jobs,
            has_canceled_jobs: a.has_canceled_jobs,
            job_status_by_type: a
                .job_status_by_type
                .into_iter()
                .map(|(job, status)| {
                    let label = status.as_str().map_or_else(|| status.to_string(), str::to_owned);
                    (job, label)
                })
                .collect(),
            metadata: IntentMetadata {
                bug_class: metadata.bug_class,
                http_method: metadata.http_method,
                vulnerable_url: metadata.vulnerable_url,
                vulnerable_parameter: metadata.vulnerable_parameter,
            },
            program_id: One::into_inner(r.program).map(|program| program.id),
            report_id: One::into_inner(r.report).map(|report| report.id),
            attachments: r.attachments.data.into_iter().map(Attachment::from).collect(),
            created_at: a.created_at,
            updated_at: a.updated_at,
        };
        intent.phase = intent.derive_phase();
        intent
    }
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct PollPolicy {
    pub initial: Duration,
    pub max_interval: Duration,
    pub max_attempts: u32,
}

impl Default for PollPolicy {
    fn default() -> Self {
        Self { initial: Duration::from_secs(2), max_interval: Duration::from_secs(20), max_attempts: 40 }
    }
}

impl PollPolicy {
    pub(crate) fn interval(&self, attempt: u32) -> Duration {
        let factor = 1.5_f64.powi(i32::try_from(attempt.min(20)).unwrap_or(20));
        self.initial.mul_f64(factor).min(self.max_interval)
    }
}

fn intent_body(attributes: &serde_json::Value) -> serde_json::Value {
    json!({ "data": { "type": "report-intent", "attributes": attributes } })
}

async fn intent_request(
    client: &ApiClient,
    method: Method,
    segments: &[&str],
    body: Option<&serde_json::Value>,
) -> Result<ReportIntent, ApiError> {
    let document: Document<IntentResource> = client.send_json(method, client.endpoint(segments), body).await?;
    Ok(document.data.into())
}

pub(crate) async fn list(client: &ApiClient) -> Result<Vec<ReportIntent>, ApiError> {
    let resources: Vec<IntentResource> =
        client.get_all(client.endpoint(&["report_intents"]), &Vec::new(), Bucket::Read).await?;
    Ok(resources.into_iter().map(ReportIntent::from).collect())
}

pub(crate) async fn get(client: &ApiClient, id: &str) -> Result<ReportIntent, ApiError> {
    let document: Document<IntentResource> =
        client.get(client.endpoint(&["report_intents", id]), &Vec::new(), Bucket::Read).await?;
    Ok(document.data.into())
}

pub(crate) async fn create(client: &ApiClient, team_handle: &str, description: &str) -> Result<ReportIntent, ApiError> {
    let body = intent_body(&json!({ "team_handle": team_handle, "description": description }));
    intent_request(client, Method::POST, &["report_intents"], Some(&body)).await
}

pub(crate) async fn update(client: &ApiClient, id: &str, description: &str) -> Result<ReportIntent, ApiError> {
    let body = intent_body(&json!({ "description": description }));
    intent_request(client, Method::PATCH, &["report_intents", id], Some(&body)).await
}

pub(crate) async fn delete(client: &ApiClient, id: &str) -> Result<ReportIntent, ApiError> {
    intent_request(client, Method::DELETE, &["report_intents", id], None).await
}

pub(crate) async fn submit(client: &ApiClient, id: &str) -> Result<ReportIntent, ApiError> {
    intent_request(client, Method::POST, &["report_intents", id, "submit"], None).await
}

pub(crate) async fn attachments(client: &ApiClient, intent_id: &str) -> Result<Vec<Attachment>, ApiError> {
    let resources: Vec<Resource<AttachmentAttributes>> = client
        .get_all(client.endpoint(&["report_intents", intent_id, "attachments"]), &Vec::new(), Bucket::Read)
        .await?;
    Ok(resources.into_iter().map(Attachment::from).collect())
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum OneOrMany<T> {
    Many(Vec<T>),
    One(T),
}

impl<T> OneOrMany<T> {
    fn into_vec(self) -> Vec<T> {
        match self {
            Self::Many(items) => items,
            Self::One(item) => vec![item],
        }
    }
}

pub(crate) async fn upload_attachments(
    client: &ApiClient,
    intent_id: &str,
    files: &[UploadFile],
) -> Result<Vec<Attachment>, ApiError> {
    let document: Document<OneOrMany<Resource<AttachmentAttributes>>> =
        client.upload(client.endpoint(&["report_intents", intent_id, "attachments"]), files).await?;
    Ok(document.data.into_vec().into_iter().map(Attachment::from).collect())
}

/// Returns the attachments that remain on the intent, which is what the API responds with.
pub(crate) async fn delete_attachment(
    client: &ApiClient,
    intent_id: &str,
    attachment_id: &str,
) -> Result<Vec<Attachment>, ApiError> {
    let document: Document<OneOrMany<Resource<AttachmentAttributes>>> = client
        .send_json(Method::DELETE, client.endpoint(&["report_intents", intent_id, "attachments", attachment_id]), None)
        .await?;
    Ok(document.data.into_vec().into_iter().map(Attachment::from).collect())
}

pub(crate) async fn wait_until_settled(
    client: &ApiClient,
    id: &str,
    policy: PollPolicy,
    mut on_update: impl FnMut(&ReportIntent),
) -> Result<ReportIntent, ApiError> {
    let mut attempt = 0;
    loop {
        let intent = get(client, id).await?;
        on_update(&intent);
        if intent.is_settled() || attempt + 1 >= policy.max_attempts {
            return Ok(intent);
        }
        tokio::time::sleep(policy.interval(attempt)).await;
        attempt += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::client::testing::{assert_maps_error_statuses, client_for};
    use wiremock::matchers::{body_json, header_regex, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn intent_json(state: &str, jobs: &serde_json::Value, failing: bool) -> serde_json::Value {
        json!({
            "id": "42", "type": "report-intent",
            "attributes": {
                "title": null, "description": "XSS on search", "state": state,
                "has_failing_jobs": failing, "has_canceled_jobs": false,
                "job_status_by_type": jobs, "metadata": {},
                "created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z"
            }
        })
    }

    fn intent(state: &str, jobs: &serde_json::Value, failing: bool) -> ReportIntent {
        ReportIntent::from(serde_json::from_value::<IntentResource>(intent_json(state, jobs, failing)).unwrap())
    }

    #[test]
    fn derives_phase_from_state_and_jobs() {
        assert_eq!(intent("pending", &json!({ "assistant_response": "pending" }), false).phase, IntentPhase::Analyzing);
        assert_eq!(intent("draft", &json!({ "analyze_cif": "pending" }), false).phase, IntentPhase::Analyzing);
        assert_eq!(intent("draft", &json!({ "analyze_cif": "succeeded" }), false).phase, IntentPhase::NeedsInput);
        assert_eq!(intent("draft", &json!({ "analyze_cif": "failed" }), true).phase, IntentPhase::Failed);
        assert_eq!(intent("ready_to_submit", &json!({}), false).phase, IntentPhase::Ready);
        assert_eq!(intent("submitted", &json!({}), true).phase, IntentPhase::Submitted);
        assert_eq!(intent("archived", &json!({}), false).state, IntentState::Unknown);
    }

    #[test]
    fn only_ready_intents_can_submit_and_submitted_ones_are_frozen() {
        assert!(intent("ready_to_submit", &json!({}), false).can_submit());
        assert!(!intent("draft", &json!({}), false).can_submit());
        assert!(!intent("pending", &json!({}), false).can_submit());
    }

    #[test]
    fn poll_interval_backs_off_to_a_ceiling() {
        let policy = PollPolicy::default();
        assert_eq!(policy.interval(0), Duration::from_secs(2));
        assert_eq!(policy.interval(1), Duration::from_secs(3));
        assert!(policy.interval(3) > policy.interval(2));
        assert_eq!(policy.interval(30), Duration::from_secs(20));
    }

    #[tokio::test]
    async fn polls_until_the_intent_settles() {
        let server = MockServer::start().await;
        Mock::given(path("/v1/hackers/report_intents/42"))
            .respond_with(ResponseTemplate::new(200).set_body_json(
                json!({ "data": intent_json("pending", &json!({ "assistant_response": "pending" }), false) }),
            ))
            .up_to_n_times(2)
            .mount(&server)
            .await;
        Mock::given(path("/v1/hackers/report_intents/42"))
            .respond_with(ResponseTemplate::new(200).set_body_json(
                json!({ "data": intent_json("ready_to_submit", &json!({ "assistant_response": "succeeded" }), false) }),
            ))
            .mount(&server)
            .await;
        let policy =
            PollPolicy { initial: Duration::from_millis(1), max_interval: Duration::from_millis(2), max_attempts: 10 };
        let mut seen = Vec::new();
        let settled = wait_until_settled(&client_for(&server), "42", policy, |i| seen.push(i.phase)).await.unwrap();
        assert_eq!(settled.phase, IntentPhase::Ready);
        assert_eq!(seen, [IntentPhase::Analyzing, IntentPhase::Analyzing, IntentPhase::Ready]);
    }

    #[tokio::test]
    async fn crud_and_submit_send_documented_bodies() {
        let server = MockServer::start().await;
        let ok = |state: &str| {
            ResponseTemplate::new(200).set_body_json(json!({ "data": intent_json(state, &json!({}), false) }))
        };
        Mock::given(method("POST"))
            .and(path("/v1/hackers/report_intents"))
            .and(body_json(json!({ "data": { "type": "report-intent", "attributes": { "team_handle": "acme", "description": "d" } } })))
            .respond_with(ok("pending"))
            .expect(1)
            .mount(&server)
            .await;
        Mock::given(method("PATCH"))
            .and(path("/v1/hackers/report_intents/42"))
            .and(body_json(json!({ "data": { "type": "report-intent", "attributes": { "description": "more" } } })))
            .respond_with(ok("draft"))
            .expect(1)
            .mount(&server)
            .await;
        Mock::given(method("POST"))
            .and(path("/v1/hackers/report_intents/42/submit"))
            .respond_with(ok("submitted"))
            .expect(1)
            .mount(&server)
            .await;
        Mock::given(method("DELETE"))
            .and(path("/v1/hackers/report_intents/42"))
            .respond_with(ok("draft"))
            .expect(1)
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/v1/hackers/report_intents"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(json!({ "data": [intent_json("draft", &json!({}), false)] })),
            )
            .mount(&server)
            .await;
        let client = client_for(&server);
        assert_eq!(create(&client, "acme", "d").await.unwrap().state, IntentState::Pending);
        assert_eq!(update(&client, "42", "more").await.unwrap().state, IntentState::Draft);
        assert_eq!(submit(&client, "42").await.unwrap().state, IntentState::Submitted);
        assert_eq!(delete(&client, "42").await.unwrap().id, "42");
        assert_eq!(list(&client).await.unwrap().len(), 1);
    }

    fn attachment_json(id: &str) -> serde_json::Value {
        json!({ "id": id, "type": "attachment", "attributes": {
            "file_name": "poc.png", "content_type": "image/png", "file_size": 13808,
            "expiring_url": "https://files/x", "created_at": "2026-01-01T00:00:00Z"
        } })
    }

    #[tokio::test]
    async fn uploads_multipart_and_reads_remaining_attachments_after_delete() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/hackers/report_intents/42/attachments"))
            .and(header_regex("content-type", "^multipart/form-data; boundary="))
            .respond_with(ResponseTemplate::new(201).set_body_json(json!({ "data": attachment_json("7") })))
            .expect(1)
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/v1/hackers/report_intents/42/attachments"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(json!({ "data": [attachment_json("7"), attachment_json("8")] })),
            )
            .mount(&server)
            .await;
        Mock::given(method("DELETE"))
            .and(path("/v1/hackers/report_intents/42/attachments/7"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "data": [attachment_json("8")] })))
            .mount(&server)
            .await;
        let client = client_for(&server);
        let file = UploadFile {
            file_name: "poc.png".into(),
            content_type: "image/png".into(),
            bytes: vec![0x89, 0x50, 0x4e, 0x47],
        };
        let uploaded = upload_attachments(&client, "42", &[file]).await.unwrap();
        assert_eq!(uploaded[0].id, "7");
        assert_eq!(attachments(&client, "42").await.unwrap().len(), 2);
        let remaining = delete_attachment(&client, "42", "7").await.unwrap();
        assert_eq!(remaining.iter().map(|a| a.id.as_str()).collect::<Vec<_>>(), ["8"]);

        let requests = server.received_requests().await.unwrap();
        let upload = requests.iter().find(|r| r.method.as_str() == "POST").unwrap();
        let body = String::from_utf8_lossy(&upload.body);
        assert!(body.contains("name=\"files[]\"; filename=\"poc.png\""));
    }

    #[tokio::test]
    async fn every_intent_endpoint_maps_error_statuses() {
        assert_maps_error_statuses("GET", "/v1/hackers/report_intents", |c| async move { list(&c).await }).await;
        assert_maps_error_statuses("GET", "/v1/hackers/report_intents/1", |c| async move { get(&c, "1").await }).await;
        assert_maps_error_statuses("POST", "/v1/hackers/report_intents", |c| async move { create(&c, "a", "b").await })
            .await;
        assert_maps_error_statuses(
            "PATCH",
            "/v1/hackers/report_intents/1",
            |c| async move { update(&c, "1", "b").await },
        )
        .await;
        assert_maps_error_statuses("DELETE", "/v1/hackers/report_intents/1", |c| async move { delete(&c, "1").await })
            .await;
        assert_maps_error_statuses(
            "POST",
            "/v1/hackers/report_intents/1/submit",
            |c| async move { submit(&c, "1").await },
        )
        .await;
        assert_maps_error_statuses("GET", "/v1/hackers/report_intents/1/attachments", |c| async move {
            attachments(&c, "1").await
        })
        .await;
        assert_maps_error_statuses("POST", "/v1/hackers/report_intents/1/attachments", |c| async move {
            upload_attachments(&c, "1", &[]).await
        })
        .await;
        assert_maps_error_statuses("DELETE", "/v1/hackers/report_intents/1/attachments/2", |c| async move {
            delete_attachment(&c, "1", "2").await
        })
        .await;
    }
}
