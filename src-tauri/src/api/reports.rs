use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::json;

use super::attachments::{Attachment, AttachmentAttributes};
use super::client::ApiClient;
use super::error::ApiError;
use super::jsonapi::{Document, Many, One, Resource, null_as_empty};
use super::programs::{ScopeAttributes, StructuredScope, Weakness, WeaknessAttributes};
use super::rate_limit::Bucket;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Report {
    pub id: String,
    pub title: String,
    pub vulnerability_information: Option<String>,
    pub state: Option<String>,
    pub created_at: Option<String>,
    pub submitted_at: Option<String>,
    pub triaged_at: Option<String>,
    pub closed_at: Option<String>,
    pub last_activity_at: Option<String>,
    pub last_reporter_activity_at: Option<String>,
    pub first_program_activity_at: Option<String>,
    pub last_program_activity_at: Option<String>,
    pub bounty_awarded_at: Option<String>,
    pub disclosed_at: Option<String>,
    pub cve_ids: Vec<String>,
    pub program: Option<ProgramRef>,
    pub weakness: Option<Weakness>,
    pub severity: Option<Severity>,
    pub structured_scope: Option<StructuredScope>,
    pub activities: Vec<Activity>,
    pub attachments: Vec<Attachment>,
    pub bounties: Vec<Bounty>,
    pub summaries: Vec<ReportSummary>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProgramRef {
    pub id: String,
    pub handle: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Severity {
    pub id: String,
    pub rating: Option<String>,
    pub author_type: Option<String>,
    pub score: Option<f64>,
    pub attack_vector: Option<String>,
    pub attack_complexity: Option<String>,
    pub privileges_required: Option<String>,
    pub user_interaction: Option<String>,
    pub scope: Option<String>,
    pub confidentiality: Option<String>,
    pub integrity: Option<String>,
    pub availability: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Actor {
    pub kind: String,
    pub username: Option<String>,
    pub name: Option<String>,
    pub handle: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Activity {
    pub id: String,
    pub kind: String,
    pub message: Option<String>,
    pub internal: bool,
    pub created_at: Option<String>,
    pub actor: Option<Actor>,
    pub attachments: Vec<Attachment>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Bounty {
    pub id: String,
    pub amount: Option<String>,
    pub bonus_amount: Option<String>,
    pub awarded_amount: Option<String>,
    pub awarded_bonus_amount: Option<String>,
    pub awarded_currency: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReportSummary {
    pub id: String,
    pub content: String,
    pub category: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ReportAttributes {
    title: String,
    vulnerability_information: Option<String>,
    state: Option<String>,
    created_at: Option<String>,
    submitted_at: Option<String>,
    triaged_at: Option<String>,
    closed_at: Option<String>,
    last_activity_at: Option<String>,
    last_reporter_activity_at: Option<String>,
    first_program_activity_at: Option<String>,
    last_program_activity_at: Option<String>,
    bounty_awarded_at: Option<String>,
    disclosed_at: Option<String>,
    #[serde(default, deserialize_with = "null_as_empty")]
    cve_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct ProgramRefAttributes {
    handle: String,
}

#[derive(Debug, Deserialize)]
struct SeverityAttributes {
    rating: Option<String>,
    author_type: Option<String>,
    score: Option<f64>,
    attack_vector: Option<String>,
    attack_complexity: Option<String>,
    privileges_required: Option<String>,
    user_interaction: Option<String>,
    scope: Option<String>,
    confidentiality: Option<String>,
    integrity: Option<String>,
    availability: Option<String>,
    created_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ActorAttributes {
    username: Option<String>,
    name: Option<String>,
    handle: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ActivityAttributes {
    message: Option<String>,
    internal: Option<bool>,
    created_at: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct ActivityRelationships {
    actor: Option<One<Resource<ActorAttributes>>>,
    #[serde(default)]
    attachments: Many<Resource<AttachmentAttributes>>,
}

#[derive(Debug, Deserialize)]
struct BountyAttributes {
    amount: Option<String>,
    bonus_amount: Option<String>,
    awarded_amount: Option<String>,
    awarded_bonus_amount: Option<String>,
    awarded_currency: Option<String>,
    created_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SummaryAttributes {
    content: String,
    category: Option<String>,
    created_at: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct ReportRelationships {
    program: Option<One<Resource<ProgramRefAttributes>>>,
    weakness: Option<One<Resource<WeaknessAttributes>>>,
    severity: Option<One<Resource<SeverityAttributes>>>,
    structured_scope: Option<One<Resource<ScopeAttributes>>>,
    #[serde(default)]
    activities: Many<Resource<ActivityAttributes, ActivityRelationships>>,
    #[serde(default)]
    attachments: Many<Resource<AttachmentAttributes>>,
    #[serde(default)]
    bounties: Many<Resource<BountyAttributes>>,
    #[serde(default)]
    summaries: Many<Resource<SummaryAttributes>>,
}

type ReportResource = Resource<ReportAttributes, ReportRelationships>;

impl From<ReportResource> for Report {
    fn from(resource: ReportResource) -> Self {
        let a = resource.attributes;
        let r = resource.relationships;
        Self {
            id: resource.id,
            title: a.title,
            vulnerability_information: a.vulnerability_information,
            state: a.state,
            created_at: a.created_at,
            submitted_at: a.submitted_at,
            triaged_at: a.triaged_at,
            closed_at: a.closed_at,
            last_activity_at: a.last_activity_at,
            last_reporter_activity_at: a.last_reporter_activity_at,
            first_program_activity_at: a.first_program_activity_at,
            last_program_activity_at: a.last_program_activity_at,
            bounty_awarded_at: a.bounty_awarded_at,
            disclosed_at: a.disclosed_at,
            cve_ids: a.cve_ids,
            program: One::into_inner(r.program)
                .map(|program| ProgramRef { id: program.id, handle: program.attributes.handle }),
            weakness: One::into_inner(r.weakness).map(Weakness::from),
            severity: One::into_inner(r.severity).map(severity_from),
            structured_scope: One::into_inner(r.structured_scope).map(StructuredScope::from),
            activities: r.activities.data.into_iter().map(activity_from).collect(),
            attachments: r.attachments.data.into_iter().map(Attachment::from).collect(),
            bounties: r.bounties.data.into_iter().map(bounty_from).collect(),
            summaries: r
                .summaries
                .data
                .into_iter()
                .map(|summary| ReportSummary {
                    id: summary.id,
                    content: summary.attributes.content,
                    category: summary.attributes.category,
                    created_at: summary.attributes.created_at,
                })
                .collect(),
        }
    }
}

fn severity_from(resource: Resource<SeverityAttributes>) -> Severity {
    let a = resource.attributes;
    Severity {
        id: resource.id,
        rating: a.rating,
        author_type: a.author_type,
        score: a.score,
        attack_vector: a.attack_vector,
        attack_complexity: a.attack_complexity,
        privileges_required: a.privileges_required,
        user_interaction: a.user_interaction,
        scope: a.scope,
        confidentiality: a.confidentiality,
        integrity: a.integrity,
        availability: a.availability,
        created_at: a.created_at,
    }
}

fn activity_from(resource: Resource<ActivityAttributes, ActivityRelationships>) -> Activity {
    Activity {
        id: resource.id,
        kind: resource.kind,
        message: resource.attributes.message,
        internal: resource.attributes.internal.unwrap_or(false),
        created_at: resource.attributes.created_at,
        actor: One::into_inner(resource.relationships.actor).map(|actor| Actor {
            kind: actor.kind,
            username: actor.attributes.username,
            name: actor.attributes.name,
            handle: actor.attributes.handle,
        }),
        attachments: resource.relationships.attachments.data.into_iter().map(Attachment::from).collect(),
    }
}

fn bounty_from(resource: Resource<BountyAttributes>) -> Bounty {
    let a = resource.attributes;
    Bounty {
        id: resource.id,
        amount: a.amount,
        bonus_amount: a.bonus_amount,
        awarded_amount: a.awarded_amount,
        awarded_bonus_amount: a.awarded_bonus_amount,
        awarded_currency: a.awarded_currency,
        created_at: a.created_at,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum SeverityRating {
    None,
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NewReport {
    pub team_handle: String,
    pub title: String,
    pub vulnerability_information: String,
    pub impact: String,
    pub severity_rating: Option<SeverityRating>,
    pub weakness_id: Option<String>,
    pub structured_scope_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub(crate) enum NewReportError {
    #[error("{0} is required")]
    Missing(&'static str),
    #[error("{0} must be a numeric id")]
    NotNumeric(&'static str),
}

impl NewReport {
    pub(crate) fn request_body(&self) -> Result<serde_json::Value, NewReportError> {
        let required = [
            ("program", &self.team_handle),
            ("title", &self.title),
            ("vulnerability information", &self.vulnerability_information),
            ("impact", &self.impact),
        ];
        if let Some((field, _)) = required.iter().find(|(_, value)| value.trim().is_empty()) {
            return Err(NewReportError::Missing(field));
        }
        let mut attributes = serde_json::Map::new();
        attributes.insert("team_handle".into(), json!(self.team_handle.trim()));
        attributes.insert("title".into(), json!(self.title.trim()));
        attributes.insert("vulnerability_information".into(), json!(self.vulnerability_information));
        attributes.insert("impact".into(), json!(self.impact));
        if let Some(rating) = self.severity_rating {
            attributes.insert("severity_rating".into(), json!(rating));
        }
        if let Some(id) = &self.weakness_id {
            attributes.insert("weakness_id".into(), json!(numeric_id(id, "weakness")?));
        }
        if let Some(id) = &self.structured_scope_id {
            attributes.insert("structured_scope_id".into(), json!(numeric_id(id, "asset")?));
        }
        Ok(json!({ "data": { "type": "report", "attributes": attributes } }))
    }
}

fn numeric_id(value: &str, field: &'static str) -> Result<u64, NewReportError> {
    value.trim().parse().map_err(|_| NewReportError::NotNumeric(field))
}

pub(crate) async fn mine(client: &ApiClient) -> Result<Vec<Report>, ApiError> {
    let resources: Vec<ReportResource> = client
        .get_all(client.endpoint(&["me", "reports"]), &vec![("page[size]", "100".to_owned())], Bucket::Read)
        .await?;
    Ok(resources.into_iter().map(Report::from).collect())
}

pub(crate) async fn get(client: &ApiClient, id: &str) -> Result<Report, ApiError> {
    let document: Document<ReportResource> =
        client.get(client.endpoint(&["reports", id]), &Vec::new(), Bucket::Read).await?;
    Ok(document.data.into())
}

pub(crate) async fn create(client: &ApiClient, body: &serde_json::Value) -> Result<Report, ApiError> {
    let document: Document<ReportResource> =
        client.send_json(Method::POST, client.endpoint(&["reports"]), Some(body)).await?;
    Ok(document.data.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::client::testing::{assert_maps_error_statuses, client_for};
    use wiremock::matchers::{body_json, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    pub(crate) fn report_json() -> serde_json::Value {
        json!({
            "id": "1337", "type": "report",
            "attributes": {
                "title": "XSS in login", "state": "triaged", "created_at": "2026-01-01T00:00:00.000Z",
                "vulnerability_information": "Steps", "cve_ids": null, "last_activity_at": "2026-02-01T00:00:00.000Z"
            },
            "relationships": {
                "program": { "data": { "id": "9", "type": "program", "attributes": { "handle": "acme" } } },
                "weakness": { "data": { "id": "60", "type": "weakness", "attributes": { "name": "XSS", "description": "d", "external_id": "cwe-79", "created_at": "2026-01-01T00:00:00Z" } } },
                "severity": { "data": { "id": "57", "type": "severity", "attributes": { "rating": "high", "author_type": "User", "user_id": 1, "score": 8.7, "created_at": "2026-01-01T00:00:00Z" } } },
                "structured_scope": { "data": { "id": "5", "type": "structured-scope", "attributes": { "asset_identifier": "acme.com", "asset_type": "url", "eligible_for_bounty": true, "eligible_for_submission": true, "max_severity": "critical" } } },
                "activities": { "data": [{
                    "id": "1", "type": "activity-comment",
                    "attributes": { "message": "Thanks", "internal": null, "created_at": "2026-01-02T00:00:00Z", "updated_at": "2026-01-02T00:00:00Z" },
                    "relationships": {
                        "actor": { "data": { "id": "3", "type": "user", "attributes": { "username": "triager", "name": "T" } } },
                        "attachments": { "data": [] }
                    }
                }] },
                "attachments": { "data": [{ "id": "8", "type": "attachment", "attributes": { "file_name": "poc.png", "content_type": "image/png", "file_size": 13808, "expiring_url": "https://files/x", "created_at": "2026-01-01T00:00:00Z" } }] },
                "bounties": { "data": [{ "id": "4", "type": "bounty", "attributes": { "amount": "500.00", "bonus_amount": "50.00", "awarded_amount": "500.00", "awarded_bonus_amount": "50.00", "awarded_currency": "USD", "created_at": "2026-01-03T00:00:00Z" } }] },
                "summaries": { "data": [] },
                "swag": { "data": [] }
            }
        })
    }

    #[test]
    fn maps_full_report_relationships() {
        let resource: ReportResource = serde_json::from_value(report_json()).unwrap();
        let report = Report::from(resource);
        assert_eq!(report.program.unwrap().handle, "acme");
        assert_eq!(report.weakness.unwrap().external_id.as_deref(), Some("cwe-79"));
        assert_eq!(report.severity.unwrap().rating.as_deref(), Some("high"));
        assert_eq!(report.activities[0].actor.as_ref().unwrap().username.as_deref(), Some("triager"));
        assert_eq!(report.attachments[0].file_size, Some(13808));
        assert_eq!(report.bounties[0].bonus_amount.as_deref(), Some("50.00"));
        assert!(report.cve_ids.is_empty());
    }

    #[test]
    fn builds_request_body_with_only_present_optional_fields() {
        let mut input = NewReport {
            team_handle: " acme ".into(),
            title: "SQLi".into(),
            vulnerability_information: "steps".into(),
            impact: "data".into(),
            severity_rating: Some(SeverityRating::High),
            weakness_id: Some("67".into()),
            structured_scope_id: None,
        };
        assert_eq!(
            input.request_body().unwrap(),
            json!({ "data": { "type": "report", "attributes": {
                "team_handle": "acme", "title": "SQLi", "vulnerability_information": "steps",
                "impact": "data", "severity_rating": "high", "weakness_id": 67
            } } })
        );
        input.impact = "  ".into();
        assert_eq!(input.request_body(), Err(NewReportError::Missing("impact")));
        input.impact = "x".into();
        input.structured_scope_id = Some("abc".into());
        assert_eq!(input.request_body(), Err(NewReportError::NotNumeric("asset")));
    }

    #[tokio::test]
    async fn lists_gets_and_creates_reports() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v1/hackers/me/reports"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "data": [report_json()], "links": {} })))
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/v1/hackers/reports/1337"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "data": report_json() })))
            .mount(&server)
            .await;
        let body = json!({ "data": { "type": "report", "attributes": { "team_handle": "acme" } } });
        Mock::given(method("POST"))
            .and(path("/v1/hackers/reports"))
            .and(body_json(&body))
            .respond_with(ResponseTemplate::new(201).set_body_json(json!({ "data": report_json() })))
            .expect(1)
            .mount(&server)
            .await;
        let client = client_for(&server);
        assert_eq!(mine(&client).await.unwrap()[0].id, "1337");
        assert_eq!(get(&client, "1337").await.unwrap().title, "XSS in login");
        assert_eq!(create(&client, &body).await.unwrap().id, "1337");
    }

    #[tokio::test]
    async fn every_report_endpoint_maps_error_statuses() {
        assert_maps_error_statuses("GET", "/v1/hackers/me/reports", |c| async move { mine(&c).await }).await;
        assert_maps_error_statuses("GET", "/v1/hackers/reports/1", |c| async move { get(&c, "1").await }).await;
        assert_maps_error_statuses("POST", "/v1/hackers/reports", |c| async move { create(&c, &json!({})).await })
            .await;
    }
}
