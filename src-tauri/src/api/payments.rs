use serde::{Deserialize, Serialize};

use super::client::ApiClient;
use super::error::ApiError;
use super::jsonapi::{Document, One, Resource, ResourceRef};
use super::rate_limit::Bucket;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Balance {
    pub balance: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum EarningKind {
    Bounty,
    Retest,
    Pentest,
    Other,
}

impl EarningKind {
    fn from_type(kind: &str) -> Self {
        match kind {
            "earning-bounty-earned" => Self::Bounty,
            "earning-retest-completed" => Self::Retest,
            "earning-pentest-completed" => Self::Pentest,
            _ => Self::Other,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Earning {
    pub id: String,
    pub kind: EarningKind,
    pub amount: f64,
    pub created_at: Option<String>,
    pub program_handle: Option<String>,
    pub program_name: Option<String>,
    pub report_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(clippy::struct_field_names, reason = "mirrors the payout_provider attribute in the API")]
pub(crate) struct Payout {
    pub amount: Option<f64>,
    pub paid_out_at: Option<String>,
    pub reference: Option<String>,
    pub payout_provider: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
struct EarningAttributes {
    amount: f64,
    created_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TeamAttributes {
    handle: Option<String>,
    name: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct BountyRelationships {
    report: Option<One<ResourceRef>>,
}

#[derive(Debug, Deserialize)]
struct BountyRef {
    #[serde(default)]
    relationships: BountyRelationships,
}

#[derive(Debug, Default, Deserialize)]
struct EarningRelationships {
    team: Option<One<Resource<TeamAttributes>>>,
    program: Option<One<Resource<TeamAttributes>>>,
    bounty: Option<One<BountyRef>>,
}

#[derive(Debug, Deserialize)]
struct PayoutWire {
    #[serde(default)]
    attributes: Option<PayoutAttributes>,
    #[serde(flatten)]
    inline: PayoutAttributes,
}

#[derive(Debug, Default, Deserialize)]
struct PayoutAttributes {
    amount: Option<f64>,
    paid_out_at: Option<String>,
    reference: Option<String>,
    payout_provider: Option<String>,
    status: Option<String>,
}

impl From<Resource<EarningAttributes, EarningRelationships>> for Earning {
    fn from(resource: Resource<EarningAttributes, EarningRelationships>) -> Self {
        let r = resource.relationships;
        let team = One::into_inner(r.team).or_else(|| One::into_inner(r.program));
        Self {
            id: resource.id,
            kind: EarningKind::from_type(&resource.kind),
            amount: resource.attributes.amount,
            created_at: resource.attributes.created_at,
            program_handle: team.as_ref().and_then(|t| t.attributes.handle.clone()),
            program_name: team.and_then(|t| t.attributes.name),
            report_id: One::into_inner(r.bounty)
                .and_then(|bounty| One::into_inner(bounty.relationships.report))
                .map(|report| report.id),
        }
    }
}

// Payout objects are documented without `id`/`type`, and the reference is ambiguous on whether
// fields sit under `attributes`; both layouts are accepted.
impl From<PayoutWire> for Payout {
    fn from(wire: PayoutWire) -> Self {
        let a = wire.attributes.unwrap_or(wire.inline);
        Self {
            amount: a.amount,
            paid_out_at: a.paid_out_at,
            reference: a.reference,
            payout_provider: a.payout_provider,
            status: a.status,
        }
    }
}

pub(crate) async fn balance(client: &ApiClient) -> Result<Balance, ApiError> {
    let document: Document<Balance> =
        client.get(client.endpoint(&["payments", "balance"]), &Vec::new(), Bucket::Read).await?;
    Ok(document.data)
}

pub(crate) async fn earnings(client: &ApiClient) -> Result<Vec<Earning>, ApiError> {
    let resources: Vec<Resource<EarningAttributes, EarningRelationships>> = client
        .get_all(client.endpoint(&["payments", "earnings"]), &vec![("page[size]", "100".to_owned())], Bucket::Read)
        .await?;
    Ok(resources.into_iter().map(Earning::from).collect())
}

pub(crate) async fn payouts(client: &ApiClient) -> Result<Vec<Payout>, ApiError> {
    let wires: Vec<PayoutWire> = client
        .get_all(client.endpoint(&["payments", "payouts"]), &vec![("page[size]", "100".to_owned())], Bucket::Read)
        .await?;
    Ok(wires.into_iter().map(Payout::from).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::client::testing::{assert_maps_error_statuses, client_for};
    use serde_json::json;
    use wiremock::matchers::path;
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn reads_balance_earnings_and_payouts() {
        let server = MockServer::start().await;
        Mock::given(path("/v1/hackers/payments/balance"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "data": { "balance": 105 } })))
            .mount(&server)
            .await;
        Mock::given(path("/v1/hackers/payments/earnings"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "data": [{
                "id": "1", "type": "earning-bounty-earned",
                "attributes": { "amount": 150, "created_at": "2026-03-01T00:00:00Z" },
                "relationships": {
                    "team": { "data": { "id": "9", "type": "program", "attributes": { "handle": "acme", "name": "Acme" } } },
                    "bounty": { "data": { "id": "4", "type": "bounty", "attributes": { "amount": "150.00" },
                        "relationships": { "report": { "data": { "id": "1337", "type": "report" } } } } }
                }
            }, {
                "id": "2", "type": "earning-retest-completed",
                "attributes": { "amount": 50 }
            }], "links": {} })))
            .mount(&server)
            .await;
        Mock::given(path("/v1/hackers/payments/payouts"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "data": [
                { "amount": 105, "paid_out_at": "2026-04-01T00:00:00Z", "reference": "ref", "payout_provider": "PayPal", "status": "sent" },
                { "attributes": { "amount": 20, "status": "pending" } }
            ] })))
            .mount(&server)
            .await;
        let client = client_for(&server);
        assert!((balance(&client).await.unwrap().balance - 105.0).abs() < f64::EPSILON);
        let earnings = earnings(&client).await.unwrap();
        assert_eq!(earnings[0].kind, EarningKind::Bounty);
        assert_eq!(earnings[0].program_handle.as_deref(), Some("acme"));
        assert_eq!(earnings[0].report_id.as_deref(), Some("1337"));
        assert_eq!(earnings[1].kind, EarningKind::Retest);
        let payouts = payouts(&client).await.unwrap();
        assert_eq!(payouts[0].payout_provider.as_deref(), Some("PayPal"));
        assert_eq!(payouts[1].status.as_deref(), Some("pending"));
    }

    #[tokio::test]
    async fn every_payment_endpoint_maps_error_statuses() {
        assert_maps_error_statuses("GET", "/v1/hackers/payments/balance", |c| async move { balance(&c).await }).await;
        assert_maps_error_statuses("GET", "/v1/hackers/payments/earnings", |c| async move { earnings(&c).await }).await;
        assert_maps_error_statuses("GET", "/v1/hackers/payments/payouts", |c| async move { payouts(&c).await }).await;
    }
}
