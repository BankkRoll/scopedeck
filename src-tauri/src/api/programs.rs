use serde::{Deserialize, Serialize};

use super::client::{self, ApiClient, Query};
use super::error::ApiError;
use super::jsonapi::{Document, Resource};
use super::rate_limit::Bucket;

const PAGE_SIZE: &str = "100";
/// Structured scope pagination stops at 10,000 records; past that the API requires
/// `filter[id__gt]` cursoring (results are sorted by id ascending).
const SCOPE_PAGINATION_CAP: usize = 10_000;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Program {
    pub id: String,
    pub handle: String,
    pub name: String,
    pub currency: Option<String>,
    pub policy: Option<String>,
    pub profile_picture: Option<String>,
    pub submission_state: Option<String>,
    pub state: Option<String>,
    pub triage_active: Option<bool>,
    pub started_accepting_at: Option<String>,
    pub number_of_reports_for_user: Option<i64>,
    pub number_of_valid_reports_for_user: Option<i64>,
    pub bounty_earned_for_user: Option<f64>,
    pub last_invitation_accepted_at_for_user: Option<String>,
    pub bookmarked: Option<bool>,
    pub allows_bounty_splitting: Option<bool>,
    pub offers_bounties: Option<bool>,
    pub open_scope: Option<bool>,
    pub fast_payments: Option<bool>,
    pub gold_standard_safe_harbor: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct ProgramAttributes {
    handle: String,
    #[serde(default)]
    name: Option<String>,
    currency: Option<String>,
    policy: Option<String>,
    profile_picture: Option<String>,
    submission_state: Option<String>,
    state: Option<String>,
    triage_active: Option<bool>,
    started_accepting_at: Option<String>,
    number_of_reports_for_user: Option<i64>,
    number_of_valid_reports_for_user: Option<i64>,
    bounty_earned_for_user: Option<f64>,
    last_invitation_accepted_at_for_user: Option<String>,
    bookmarked: Option<bool>,
    allows_bounty_splitting: Option<bool>,
    offers_bounties: Option<bool>,
    open_scope: Option<bool>,
    fast_payments: Option<bool>,
    gold_standard_safe_harbor: Option<bool>,
}

impl From<Resource<ProgramAttributes>> for Program {
    fn from(resource: Resource<ProgramAttributes>) -> Self {
        let a = resource.attributes;
        Self {
            id: resource.id,
            name: a.name.unwrap_or_else(|| a.handle.clone()),
            handle: a.handle,
            currency: a.currency,
            policy: a.policy,
            profile_picture: a.profile_picture,
            submission_state: a.submission_state,
            state: a.state,
            triage_active: a.triage_active,
            started_accepting_at: a.started_accepting_at,
            number_of_reports_for_user: a.number_of_reports_for_user,
            number_of_valid_reports_for_user: a.number_of_valid_reports_for_user,
            bounty_earned_for_user: a.bounty_earned_for_user,
            last_invitation_accepted_at_for_user: a.last_invitation_accepted_at_for_user,
            bookmarked: a.bookmarked,
            allows_bounty_splitting: a.allows_bounty_splitting,
            offers_bounties: a.offers_bounties,
            open_scope: a.open_scope,
            fast_payments: a.fast_payments,
            gold_standard_safe_harbor: a.gold_standard_safe_harbor,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StructuredScope {
    pub id: String,
    pub asset_identifier: String,
    pub asset_type: String,
    pub eligible_for_bounty: bool,
    pub eligible_for_submission: bool,
    pub instruction: Option<String>,
    pub max_severity: Option<String>,
    pub confidentiality_requirement: Option<String>,
    pub integrity_requirement: Option<String>,
    pub availability_requirement: Option<String>,
    pub reference: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ScopeAttributes {
    asset_identifier: String,
    asset_type: String,
    #[serde(default)]
    eligible_for_bounty: bool,
    #[serde(default)]
    eligible_for_submission: bool,
    instruction: Option<String>,
    max_severity: Option<String>,
    confidentiality_requirement: Option<String>,
    integrity_requirement: Option<String>,
    availability_requirement: Option<String>,
    reference: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

impl From<Resource<ScopeAttributes>> for StructuredScope {
    fn from(resource: Resource<ScopeAttributes>) -> Self {
        let a = resource.attributes;
        Self {
            id: resource.id,
            asset_identifier: a.asset_identifier,
            asset_type: a.asset_type,
            eligible_for_bounty: a.eligible_for_bounty,
            eligible_for_submission: a.eligible_for_submission,
            instruction: a.instruction,
            max_severity: a.max_severity,
            confidentiality_requirement: a.confidentiality_requirement,
            integrity_requirement: a.integrity_requirement,
            availability_requirement: a.availability_requirement,
            reference: a.reference,
            created_at: a.created_at,
            updated_at: a.updated_at,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ScopeExclusion {
    pub id: String,
    pub category: Option<String>,
    pub details: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ExclusionAttributes {
    category: Option<String>,
    details: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Weakness {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub external_id: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct WeaknessAttributes {
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) description: Option<String>,
    #[serde(default)]
    pub(crate) external_id: Option<String>,
    #[serde(default)]
    pub(crate) created_at: Option<String>,
}

impl From<Resource<WeaknessAttributes>> for Weakness {
    fn from(resource: Resource<WeaknessAttributes>) -> Self {
        Self {
            id: resource.id,
            name: resource.attributes.name,
            description: resource.attributes.description,
            external_id: resource.attributes.external_id,
            created_at: resource.attributes.created_at,
        }
    }
}

#[derive(Debug, Clone, Default)]
pub(crate) struct ScopeFilter {
    pub updated_after: Option<String>,
    pub created_after: Option<String>,
}

fn paged() -> Query {
    vec![("page[size]", PAGE_SIZE.to_owned())]
}

pub(crate) async fn list(client: &ApiClient) -> Result<Vec<Program>, ApiError> {
    let resources: Vec<Resource<ProgramAttributes>> =
        client.get_all(client.endpoint(&["programs"]), &paged(), Bucket::Read).await?;
    Ok(resources.into_iter().map(Program::from).collect())
}

pub(crate) async fn verify_access(client: &ApiClient) -> Result<(), ApiError> {
    let _: Document<Vec<serde_json::Value>> =
        client.get(client.endpoint(&["programs"]), &vec![("page[size]", "1".to_owned())], Bucket::Read).await?;
    Ok(())
}

pub(crate) async fn get(client: &ApiClient, handle: &str) -> Result<Program, ApiError> {
    let url = client.endpoint(&["programs", handle]);
    let path = url.path().to_owned();
    let body: serde_json::Value = client.get(url, &Vec::new(), Bucket::Read).await?;
    // Unlike every other endpoint, this one returns the program resource itself rather than a
    // `data` envelope. Both shapes are accepted in case it is ever brought in line.
    let resource = match body {
        serde_json::Value::Object(mut object) if object.contains_key("data") => {
            object.remove("data").unwrap_or_default()
        }
        other => other,
    };
    let resource: Resource<ProgramAttributes> = client::decode_value(&path, resource)?;
    Ok(resource.into())
}

pub(crate) async fn structured_scopes(
    client: &ApiClient,
    handle: &str,
    filter: &ScopeFilter,
) -> Result<Vec<StructuredScope>, ApiError> {
    let url = client.endpoint(&["programs", handle, "structured_scopes"]);
    let mut scopes: Vec<StructuredScope> = Vec::new();
    let mut cursor: Option<String> = None;
    loop {
        let mut query = paged();
        if let Some(updated) = &filter.updated_after {
            query.push(("filter[updated_at__gt]", updated.clone()));
        }
        if let Some(created) = &filter.created_after {
            query.push(("filter[created_at__gt]", created.clone()));
        }
        if let Some(after) = &cursor {
            query.push(("filter[id__gt]", after.clone()));
        }
        let batch: Vec<Resource<ScopeAttributes>> =
            client.get_all(url.clone(), &query, Bucket::StructuredScopes).await?;
        let reached_cap = batch.len() >= SCOPE_PAGINATION_CAP;
        let last_id = batch.last().map(|resource| resource.id.clone());
        scopes.extend(batch.into_iter().map(StructuredScope::from));
        match (reached_cap, last_id) {
            (true, Some(id)) if cursor.as_deref() != Some(id.as_str()) => cursor = Some(id),
            _ => break,
        }
    }
    Ok(scopes)
}

pub(crate) async fn scope_exclusions(client: &ApiClient, handle: &str) -> Result<Vec<ScopeExclusion>, ApiError> {
    let resources: Vec<Resource<ExclusionAttributes>> =
        client.get_all(client.endpoint(&["programs", handle, "scope_exclusions"]), &Vec::new(), Bucket::Read).await?;
    Ok(resources
        .into_iter()
        .map(|resource| ScopeExclusion {
            id: resource.id,
            category: resource.attributes.category,
            details: resource.attributes.details,
            created_at: resource.attributes.created_at,
            updated_at: resource.attributes.updated_at,
        })
        .collect())
}

pub(crate) async fn weaknesses(client: &ApiClient, handle: &str) -> Result<Vec<Weakness>, ApiError> {
    let resources: Vec<Resource<WeaknessAttributes>> =
        client.get_all(client.endpoint(&["programs", handle, "weaknesses"]), &paged(), Bucket::Read).await?;
    Ok(resources.into_iter().map(Weakness::from).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::client::testing::{assert_maps_error_statuses, client_for};
    use serde_json::json;
    use wiremock::matchers::{method, path, query_param, query_param_is_missing};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn program_json() -> serde_json::Value {
        json!({
            "id": 9, "type": "program",
            "attributes": {
                "handle": "acme", "name": "Acme", "currency": "usd", "policy": "# Policy",
                "profile_picture": "https://p/x.png", "submission_state": "open", "triage_active": null,
                "state": "public_mode", "started_accepting_at": null, "number_of_reports_for_user": 2,
                "number_of_valid_reports_for_user": 1, "bounty_earned_for_user": 150.0,
                "last_invitation_accepted_at_for_user": null, "bookmarked": false,
                "allows_bounty_splitting": true, "offers_bounties": true, "open_scope": false,
                "fast_payments": true, "gold_standard_safe_harbor": false
            },
            "relationships": { "structured_scopes": { "data": [] } }
        })
    }

    fn scope_json(id: usize) -> serde_json::Value {
        json!({
            "id": id.to_string(), "type": "structured-scope",
            "attributes": {
                "asset_identifier": format!("{id}.acme.com"), "asset_type": "URL",
                "eligible_for_bounty": true, "eligible_for_submission": id.is_multiple_of(2),
                "instruction": null, "max_severity": "critical",
                "confidentiality_requirement": "high", "integrity_requirement": "high",
                "availability_requirement": "low",
                "created_at": "2026-01-01T00:00:00.000Z", "updated_at": "2026-02-01T00:00:00.000Z"
            }
        })
    }

    #[tokio::test]
    async fn lists_programs() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v1/hackers/programs"))
            .and(query_param("page[size]", "100"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "data": [program_json()], "links": {} })))
            .mount(&server)
            .await;
        let programs = list(&client_for(&server)).await.unwrap();
        assert_eq!(programs.len(), 1);
        assert_eq!(programs[0].id, "9");
        assert_eq!(programs[0].handle, "acme");
        assert_eq!(programs[0].offers_bounties, Some(true));
    }

    #[tokio::test]
    async fn gets_bare_program() {
        let server = MockServer::start().await;
        Mock::given(path("/v1/hackers/programs/acme"))
            .respond_with(ResponseTemplate::new(200).set_body_json(program_json()))
            .mount(&server)
            .await;
        let program = get(&client_for(&server), "acme").await.unwrap();
        assert_eq!(program.policy.as_deref(), Some("# Policy"));
    }

    #[tokio::test]
    async fn gets_enveloped_program() {
        let server = MockServer::start().await;
        Mock::given(path("/v1/hackers/programs/acme"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "data": program_json() })))
            .mount(&server)
            .await;
        let program = get(&client_for(&server), "acme").await.unwrap();
        assert_eq!(program.policy.as_deref(), Some("# Policy"));
    }

    #[tokio::test]
    async fn passes_scope_filters() {
        let server = MockServer::start().await;
        Mock::given(path("/v1/hackers/programs/acme/structured_scopes"))
            .and(query_param("filter[updated_at__gt]", "2026-03-01T00:00:00Z"))
            .and(query_param_is_missing("filter[id__gt]"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "data": [scope_json(2)], "links": {} })))
            .expect(1)
            .mount(&server)
            .await;
        let filter = ScopeFilter { updated_after: Some("2026-03-01T00:00:00Z".into()), created_after: None };
        let scopes = structured_scopes(&client_for(&server), "acme", &filter).await.unwrap();
        assert_eq!(scopes[0].asset_identifier, "2.acme.com");
        assert!(scopes[0].eligible_for_submission);
    }

    #[tokio::test]
    async fn cursors_past_the_pagination_cap() {
        let server = MockServer::start().await;
        let first: Vec<_> = (1..=SCOPE_PAGINATION_CAP).map(scope_json).collect();
        Mock::given(path("/v1/hackers/programs/big/structured_scopes"))
            .and(query_param("filter[id__gt]", SCOPE_PAGINATION_CAP.to_string()))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "data": [scope_json(10_001)] })))
            .expect(1)
            .mount(&server)
            .await;
        Mock::given(path("/v1/hackers/programs/big/structured_scopes"))
            .and(query_param_is_missing("filter[id__gt]"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "data": first })))
            .expect(1)
            .mount(&server)
            .await;
        let scopes = structured_scopes(&client_for(&server), "big", &ScopeFilter::default()).await.unwrap();
        assert_eq!(scopes.len(), SCOPE_PAGINATION_CAP + 1);
        assert_eq!(scopes.last().unwrap().id, "10001");
    }

    #[tokio::test]
    async fn lists_exclusions_and_weaknesses() {
        let server = MockServer::start().await;
        Mock::given(path("/v1/hackers/programs/acme/scope_exclusions"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "data": [{
                "id": "1", "type": "scope-exclusion",
                "attributes": { "category": "Clickjacking", "details": "No sensitive actions", "created_at": null, "updated_at": null }
            }] })))
            .mount(&server)
            .await;
        Mock::given(path("/v1/hackers/programs/acme/weaknesses"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "data": [{
                "id": "2", "type": "weakness",
                "attributes": { "name": "Cross-Site Request Forgery (CSRF)", "description": "d", "external_id": "cwe-352", "created_at": "2026-01-01T00:00:00Z" }
            }] })))
            .mount(&server)
            .await;
        let client = client_for(&server);
        let exclusions = scope_exclusions(&client, "acme").await.unwrap();
        let weaknesses = weaknesses(&client, "acme").await.unwrap();
        assert_eq!(exclusions[0].category.as_deref(), Some("Clickjacking"));
        assert_eq!(weaknesses[0].external_id.as_deref(), Some("cwe-352"));
    }

    #[tokio::test]
    async fn every_program_endpoint_maps_error_statuses() {
        assert_maps_error_statuses("GET", "/v1/hackers/programs", |c| async move { list(&c).await }).await;
        assert_maps_error_statuses("GET", "/v1/hackers/programs", |c| async move { verify_access(&c).await }).await;
        assert_maps_error_statuses("GET", "/v1/hackers/programs/acme", |c| async move { get(&c, "acme").await }).await;
        assert_maps_error_statuses("GET", "/v1/hackers/programs/acme/structured_scopes", |c| async move {
            structured_scopes(&c, "acme", &ScopeFilter::default()).await
        })
        .await;
        assert_maps_error_statuses("GET", "/v1/hackers/programs/acme/scope_exclusions", |c| async move {
            scope_exclusions(&c, "acme").await
        })
        .await;
        assert_maps_error_statuses("GET", "/v1/hackers/programs/acme/weaknesses", |c| async move {
            weaknesses(&c, "acme").await
        })
        .await;
    }
}
