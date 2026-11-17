use serde::{Deserialize, Serialize};

use super::client::{ApiClient, Query};
use super::error::ApiError;
use super::jsonapi::{Document, Embedded, One, Resource, null_as_empty};
use super::rate_limit::Bucket;

pub(crate) const MAX_PAGE_SIZE: u8 = 100;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub(crate) enum HacktivitySort {
    #[default]
    #[serde(rename = "-latest_disclosable_activity_at")]
    LatestActivityDesc,
    #[serde(rename = "latest_disclosable_activity_at")]
    LatestActivityAsc,
    #[serde(rename = "-disclosed_at")]
    DisclosedDesc,
    #[serde(rename = "disclosed_at")]
    DisclosedAsc,
    #[serde(rename = "-total_awarded_amount")]
    AwardDesc,
    #[serde(rename = "total_awarded_amount")]
    AwardAsc,
    #[serde(rename = "-votes")]
    VotesDesc,
    #[serde(rename = "votes")]
    VotesAsc,
}

impl HacktivitySort {
    fn as_param(self) -> &'static str {
        match self {
            Self::LatestActivityDesc => "-latest_disclosable_activity_at",
            Self::LatestActivityAsc => "latest_disclosable_activity_at",
            Self::DisclosedDesc => "-disclosed_at",
            Self::DisclosedAsc => "disclosed_at",
            Self::AwardDesc => "-total_awarded_amount",
            Self::AwardAsc => "total_awarded_amount",
            Self::VotesDesc => "-votes",
            Self::VotesAsc => "votes",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HacktivityQuery {
    pub query_string: String,
    #[serde(default)]
    pub sort: HacktivitySort,
    pub page_number: u32,
    pub page_size: u8,
}

impl HacktivityQuery {
    pub(crate) fn cache_key(&self) -> String {
        format!("{}|{}|{}", self.sort.as_param(), self.page_size.clamp(1, MAX_PAGE_SIZE), self.query_string.trim())
    }

    fn params(&self) -> Query {
        let mut query = vec![
            ("sort", self.sort.as_param().to_owned()),
            ("page[number]", self.page_number.max(1).to_string()),
            ("page[size]", self.page_size.clamp(1, MAX_PAGE_SIZE).to_string()),
        ];
        let trimmed = self.query_string.trim();
        if !trimmed.is_empty() {
            query.push(("queryString", trimmed.to_owned()));
        }
        query
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HacktivityItem {
    pub id: String,
    pub title: Option<String>,
    pub substate: Option<String>,
    pub url: Option<String>,
    pub disclosed: bool,
    pub disclosed_at: Option<String>,
    pub submitted_at: Option<String>,
    pub cve_ids: Vec<String>,
    pub cwe: Option<String>,
    pub severity_rating: Option<String>,
    pub votes: Option<i64>,
    pub total_awarded_amount: Option<f64>,
    pub latest_disclosable_action: Option<String>,
    pub latest_disclosable_activity_at: Option<String>,
    pub summary: Option<String>,
    pub reporter_username: Option<String>,
    pub program_handle: Option<String>,
    pub program_name: Option<String>,
    pub program_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HacktivityPage {
    pub items: Vec<HacktivityItem>,
    pub page_number: u32,
    pub has_next_page: bool,
}

#[derive(Debug, Deserialize)]
struct ItemAttributes {
    title: Option<String>,
    substate: Option<String>,
    url: Option<String>,
    #[serde(default)]
    disclosed: bool,
    disclosed_at: Option<String>,
    submitted_at: Option<String>,
    #[serde(default, deserialize_with = "null_as_empty")]
    cve_ids: Vec<String>,
    cwe: Option<String>,
    severity_rating: Option<String>,
    votes: Option<i64>,
    total_awarded_amount: Option<f64>,
    latest_disclosable_action: Option<String>,
    latest_disclosable_activity_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GeneratedContent {
    hacktivity_summary: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Reporter {
    username: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ProgramSummary {
    handle: Option<String>,
    name: Option<String>,
    url: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct ItemRelationships {
    report_generated_content: Option<One<Embedded<GeneratedContent>>>,
    reporter: Option<One<Embedded<Reporter>>>,
    program: Option<One<Embedded<ProgramSummary>>>,
}

impl From<Resource<ItemAttributes, ItemRelationships>> for HacktivityItem {
    fn from(resource: Resource<ItemAttributes, ItemRelationships>) -> Self {
        let a = resource.attributes;
        let r = resource.relationships;
        let program = One::into_inner(r.program).map(|program| program.attributes);
        Self {
            id: resource.id,
            title: a.title,
            substate: a.substate,
            url: a.url,
            disclosed: a.disclosed,
            disclosed_at: a.disclosed_at,
            submitted_at: a.submitted_at,
            cve_ids: a.cve_ids,
            cwe: a.cwe,
            severity_rating: a.severity_rating,
            votes: a.votes,
            total_awarded_amount: a.total_awarded_amount,
            latest_disclosable_action: a.latest_disclosable_action,
            latest_disclosable_activity_at: a.latest_disclosable_activity_at,
            summary: One::into_inner(r.report_generated_content)
                .and_then(|content| content.attributes.hacktivity_summary),
            reporter_username: One::into_inner(r.reporter).and_then(|reporter| reporter.attributes.username),
            program_handle: program.as_ref().and_then(|p| p.handle.clone()),
            program_name: program.as_ref().and_then(|p| p.name.clone()),
            program_url: program.and_then(|p| p.url),
        }
    }
}

pub(crate) async fn search(client: &ApiClient, query: &HacktivityQuery) -> Result<HacktivityPage, ApiError> {
    let document: Document<Vec<Resource<ItemAttributes, ItemRelationships>>> =
        client.get(client.endpoint(&["hacktivity"]), &query.params(), Bucket::Read).await?;
    let page_size = usize::from(query.page_size.clamp(1, MAX_PAGE_SIZE));
    // Hacktivity responses do not document pagination links, so a full page is also treated as a
    // signal that another page may exist.
    let has_next_page = document.links.next.is_some() || document.data.len() >= page_size;
    Ok(HacktivityPage {
        items: document.data.into_iter().map(HacktivityItem::from).collect(),
        page_number: query.page_number.max(1),
        has_next_page,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::client::testing::{assert_maps_error_statuses, client_for};
    use serde_json::json;
    use wiremock::matchers::{path, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn query() -> HacktivityQuery {
        HacktivityQuery {
            query_string: "severity_rating:critical AND disclosed:true".into(),
            sort: HacktivitySort::AwardDesc,
            page_number: 2,
            page_size: 25,
        }
    }

    #[tokio::test]
    async fn sends_query_and_maps_items() {
        let server = MockServer::start().await;
        Mock::given(path("/v1/hackers/hacktivity"))
            .and(query_param("queryString", "severity_rating:critical AND disclosed:true"))
            .and(query_param("sort", "-total_awarded_amount"))
            .and(query_param("page[number]", "2"))
            .and(query_param("page[size]", "25"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "data": [{
                "id": 689_314, "type": "report",
                "attributes": {
                    "title": "SSRF", "substate": "Resolved", "url": "https://hackerone.com/reports/689314",
                    "disclosed": true, "disclosed_at": "2026-01-01T00:00:00Z", "cve_ids": ["CVE-2026-1"],
                    "cwe": "Server-Side Request Forgery (SSRF)", "severity_rating": "Critical", "votes": 12,
                    "total_awarded_amount": 5000, "latest_disclosable_action": "Activities::ReportBecamePublic",
                    "latest_disclosable_activity_at": "2026-01-01T00:00:00Z", "submitted_at": null
                },
                "relationships": {
                    "report_generated_content": { "data": { "type": "report_generated_content", "attributes": { "hacktivity_summary": "Summary" } } },
                    "reporter": { "data": { "type": "user", "attributes": { "name": null, "username": "finder" } } },
                    "program": { "data": { "type": "program", "attributes": { "handle": "acme", "name": "Acme", "url": "https://hackerone.com/acme" } } }
                }
            }] })))
            .mount(&server)
            .await;
        let page = search(&client_for(&server), &query()).await.unwrap();
        let item = &page.items[0];
        assert_eq!(item.id, "689314");
        assert_eq!(item.reporter_username.as_deref(), Some("finder"));
        assert_eq!(item.program_handle.as_deref(), Some("acme"));
        assert_eq!(item.summary.as_deref(), Some("Summary"));
        assert_eq!(item.total_awarded_amount, Some(5000.0));
        assert!(!page.has_next_page);
    }

    #[test]
    fn omits_blank_query_string_and_clamps_paging() {
        let blank = HacktivityQuery {
            query_string: "  ".into(),
            sort: HacktivitySort::default(),
            page_number: 0,
            page_size: 250,
        };
        let params = blank.params();
        assert!(params.iter().all(|(key, _)| *key != "queryString"));
        assert!(params.contains(&("page[number]", "1".into())));
        assert!(params.contains(&("page[size]", "100".into())));
        assert!(params.contains(&("sort", "-latest_disclosable_activity_at".into())));
    }

    #[tokio::test]
    async fn maps_error_statuses() {
        assert_maps_error_statuses("GET", "/v1/hackers/hacktivity", |c| async move { search(&c, &query()).await })
            .await;
    }
}
