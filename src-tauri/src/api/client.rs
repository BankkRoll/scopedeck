use reqwest::header::{ACCEPT, RETRY_AFTER};
use reqwest::{Method, StatusCode};
use serde::de::DeserializeOwned;
use std::sync::Arc;
use std::time::Duration;
use time::OffsetDateTime;
use url::Url;

use super::error::ApiError;
use super::jsonapi::Document;
use super::rate_limit::{Bucket, RateLimits};
use super::retry::{Idempotency, RetryPolicy, jitter_sample, parse_retry_after};
use crate::credentials::Credentials;

pub(crate) const PRODUCTION_BASE_URL: &str = "https://api.hackerone.com/";
const MAX_PAGES: usize = 2_000;
const USER_AGENT: &str = concat!("Scopedeck/", env!("CARGO_PKG_VERSION"));

pub(crate) type Query = Vec<(&'static str, String)>;

#[derive(Debug, Clone)]
pub(crate) struct UploadFile {
    pub file_name: String,
    pub content_type: String,
    pub bytes: Vec<u8>,
}

enum Body<'a> {
    Empty,
    Json(&'a serde_json::Value),
    Files(&'a [UploadFile]),
}

#[derive(Clone)]
pub(crate) struct ApiClient {
    http: reqwest::Client,
    base_url: Url,
    credentials: Credentials,
    limits: Arc<RateLimits>,
    retry: RetryPolicy,
}

impl ApiClient {
    pub(crate) fn new(base_url: &Url, credentials: Credentials) -> Result<Self, ApiError> {
        let http = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(45))
            .https_only(base_url.scheme() == "https")
            .build()
            .map_err(ApiError::network)?;
        Ok(Self {
            http,
            base_url: base_url.clone(),
            credentials,
            limits: Arc::new(RateLimits::default()),
            retry: RetryPolicy::default(),
        })
    }

    #[cfg(test)]
    pub(crate) fn with_retry_policy(mut self, retry: RetryPolicy) -> Self {
        self.retry = retry;
        self
    }

    pub(crate) fn endpoint(&self, segments: &[&str]) -> Url {
        let mut url = self.base_url.clone();
        if let Ok(mut path) = url.path_segments_mut() {
            path.pop_if_empty().extend(["v1", "hackers"]).extend(segments);
        }
        url
    }

    pub(crate) async fn get<T: DeserializeOwned>(
        &self,
        url: Url,
        query: &Query,
        bucket: Bucket,
    ) -> Result<T, ApiError> {
        let bytes = self.send(Method::GET, url, query, Body::Empty, bucket).await?;
        decode(&bytes)
    }

    pub(crate) async fn get_all<T: DeserializeOwned>(
        &self,
        url: Url,
        query: &Query,
        bucket: Bucket,
    ) -> Result<Vec<T>, ApiError> {
        let mut items = Vec::new();
        let mut next = Some((url, query.clone()));
        let mut pages = 0;
        while let Some((page_url, page_query)) = next.take() {
            let page: Document<Vec<T>> = self.get(page_url, &page_query, bucket).await?;
            items.extend(page.data);
            pages += 1;
            if pages >= MAX_PAGES {
                break;
            }
            if let Some(link) = page.links.next {
                next = Some((self.same_origin_link(&link)?, Vec::new()));
            }
        }
        Ok(items)
    }

    pub(crate) async fn send_json<T: DeserializeOwned>(
        &self,
        method: Method,
        url: Url,
        body: Option<&serde_json::Value>,
    ) -> Result<T, ApiError> {
        let body = body.map_or(Body::Empty, Body::Json);
        let bytes = self.send(method, url, &Vec::new(), body, Bucket::Write).await?;
        decode(&bytes)
    }

    pub(crate) async fn upload<T: DeserializeOwned>(&self, url: Url, files: &[UploadFile]) -> Result<T, ApiError> {
        let bytes = self.send(Method::POST, url, &Vec::new(), Body::Files(files), Bucket::Write).await?;
        decode(&bytes)
    }

    // SECURITY: `links.next` comes from the response body. Credentials are attached to every
    // request, so a link pointing anywhere but the configured API origin is refused.
    fn same_origin_link(&self, link: &str) -> Result<Url, ApiError> {
        let url = self.base_url.join(link).map_err(|_| ApiError::ForeignLink)?;
        if url.origin() == self.base_url.origin() { Ok(url) } else { Err(ApiError::ForeignLink) }
    }

    #[tracing::instrument(skip_all, fields(method = %method, path = %url.path()))]
    async fn send(
        &self,
        method: Method,
        url: Url,
        query: &Query,
        body: Body<'_>,
        bucket: Bucket,
    ) -> Result<Vec<u8>, ApiError> {
        let idempotency = if method == Method::POST { Idempotency::Unsafe } else { Idempotency::Safe };
        let mut attempt = 0;
        loop {
            self.limits.acquire(bucket).await;
            let request = self.build(&method, &url, query, &body)?;
            match request.send().await {
                Ok(response) => {
                    let status = response.status();
                    let retry_after = response
                        .headers()
                        .get(RETRY_AFTER)
                        .and_then(|value| value.to_str().ok())
                        .and_then(|value| parse_retry_after(value, OffsetDateTime::now_utc()));
                    let bytes = response.bytes().await.map_err(ApiError::network)?;
                    tracing::debug!(status = status.as_u16(), attempt, "response");
                    if status.is_success() {
                        return Ok(bytes.to_vec());
                    }
                    if self.retry.should_retry_status(status.as_u16(), attempt, idempotency) {
                        self.pause(attempt, retry_after, status).await;
                        attempt += 1;
                        continue;
                    }
                    return Err(ApiError::from_status(status.as_u16(), &bytes, retry_after));
                }
                Err(error) => {
                    if self.retry.should_retry_network(&error, attempt, idempotency) {
                        self.pause(attempt, None, StatusCode::SERVICE_UNAVAILABLE).await;
                        attempt += 1;
                        continue;
                    }
                    return Err(ApiError::network(error));
                }
            }
        }
    }

    async fn pause(&self, attempt: u32, retry_after: Option<Duration>, status: StatusCode) {
        let delay = self.retry.delay(attempt, retry_after, jitter_sample());
        tracing::info!(status = status.as_u16(), attempt, delay_ms = delay.as_millis(), "retrying");
        tokio::time::sleep(delay).await;
    }

    fn build(
        &self,
        method: &Method,
        url: &Url,
        query: &Query,
        body: &Body<'_>,
    ) -> Result<reqwest::RequestBuilder, ApiError> {
        let request = self
            .http
            .request(method.clone(), url.clone())
            .basic_auth(&self.credentials.username, Some(self.credentials.token.expose()))
            .header(ACCEPT, "application/json")
            .query(query);
        Ok(match body {
            Body::Empty => request,
            Body::Json(value) => request.json(value),
            Body::Files(files) => request.timeout(Duration::from_secs(300)).multipart(multipart_form(files)?),
        })
    }
}

fn multipart_form(files: &[UploadFile]) -> Result<reqwest::multipart::Form, ApiError> {
    files.iter().try_fold(reqwest::multipart::Form::new(), |form, file| {
        let part = reqwest::multipart::Part::bytes(file.bytes.clone())
            .file_name(file.file_name.clone())
            .mime_str(&file.content_type)
            .map_err(|_| ApiError::Decode { message: format!("{} has an invalid content type", file.file_name) })?;
        Ok(form.part("files[]", part))
    })
}

fn decode<T: DeserializeOwned>(bytes: &[u8]) -> Result<T, ApiError> {
    serde_json::from_slice(bytes).map_err(|error| ApiError::decode(&error))
}

#[cfg(test)]
pub(crate) mod testing {
    use super::*;
    use wiremock::MockServer;

    pub(crate) const TEST_USERNAME: &str = "researcher";
    pub(crate) const TEST_TOKEN: &str = "tok_live_9f8e7d6c5b4a";

    pub(crate) fn client_for(server: &MockServer) -> ApiClient {
        let base = Url::parse(&server.uri()).unwrap();
        ApiClient::new(&base, Credentials::new(TEST_USERNAME, TEST_TOKEN).unwrap()).unwrap().with_retry_policy(
            RetryPolicy { max_attempts: 3, base_delay: Duration::from_millis(1), max_delay: Duration::from_millis(5) },
        )
    }

    pub(crate) fn error_body(status: u16, detail: &str) -> serde_json::Value {
        serde_json::json!({ "errors": [{ "status": status, "detail": detail }] })
    }

    type ErrorCheck = fn(&ApiError) -> bool;

    pub(crate) async fn assert_maps_error_statuses<F, Fut, T>(http_method: &str, route: &str, call: F)
    where
        F: Fn(ApiClient) -> Fut,
        Fut: std::future::Future<Output = Result<T, ApiError>>,
        T: std::fmt::Debug,
    {
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, ResponseTemplate};

        let cases: [(u16, ErrorCheck); 6] = [
            (401, |e| matches!(e, ApiError::Unauthorized { .. })),
            (403, |e| matches!(e, ApiError::Forbidden { .. })),
            (404, |e| matches!(e, ApiError::NotFound { .. })),
            (422, |e| matches!(e, ApiError::Unprocessable { messages } if messages == &["rejected"])),
            (429, |e| matches!(e, ApiError::RateLimited { .. })),
            (502, |e| matches!(e, ApiError::Server { status: 502 })),
        ];
        for (status, check) in cases {
            let server = MockServer::start().await;
            Mock::given(method(http_method))
                .and(path(route))
                .respond_with(ResponseTemplate::new(status).set_body_json(error_body(status, "rejected")))
                .mount(&server)
                .await;
            let error = call(client_for(&server)).await.unwrap_err();
            assert!(check(&error), "{http_method} {route}: status {status} mapped to {error:?}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::testing::*;
    use super::*;
    use base64::Engine;
    use serde::Deserialize;
    use wiremock::matchers::{header, method, path, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[derive(Debug, Deserialize)]
    struct Named {
        name: String,
    }

    type Item = crate::api::jsonapi::Resource<Named>;

    fn item(id: u32) -> serde_json::Value {
        serde_json::json!({ "id": id.to_string(), "type": "thing", "attributes": { "name": format!("n{id}") } })
    }

    #[tokio::test]
    async fn sends_basic_auth_and_accept_header() {
        let server = MockServer::start().await;
        let expected = base64::engine::general_purpose::STANDARD.encode(format!("{TEST_USERNAME}:{TEST_TOKEN}"));
        Mock::given(method("GET"))
            .and(path("/v1/hackers/things"))
            .and(header("authorization", format!("Basic {expected}").as_str()))
            .and(header("accept", "application/json"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({ "data": [item(1)] })))
            .expect(1)
            .mount(&server)
            .await;
        let client = client_for(&server);
        let items: Vec<Item> = client.get_all(client.endpoint(&["things"]), &Vec::new(), Bucket::Read).await.unwrap();
        assert_eq!(items[0].attributes.name, "n1");
    }

    #[tokio::test]
    async fn paginator_follows_next_links_until_exhausted() {
        let server = MockServer::start().await;
        let page2 = format!("{}/v1/hackers/things?page%5Bnumber%5D=2&page%5Bsize%5D=100", server.uri());
        Mock::given(path("/v1/hackers/things"))
            .and(query_param("page[number]", "2"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!({ "data": [item(3)], "links": {} })),
            )
            .mount(&server)
            .await;
        Mock::given(path("/v1/hackers/things"))
            .and(query_param("page[size]", "100"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(serde_json::json!({ "data": [item(1), item(2)], "links": { "next": page2 } })),
            )
            .up_to_n_times(1)
            .mount(&server)
            .await;
        let client = client_for(&server);
        let items: Vec<Item> = client
            .get_all(client.endpoint(&["things"]), &vec![("page[size]", "100".into())], Bucket::Read)
            .await
            .unwrap();
        let ids: Vec<_> = items.iter().map(|item| item.id.as_str()).collect();
        assert_eq!(ids, ["1", "2", "3"]);
    }

    #[tokio::test]
    async fn refuses_next_links_to_other_origins() {
        let server = MockServer::start().await;
        Mock::given(path("/v1/hackers/things"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(
                    serde_json::json!({ "data": [], "links": { "next": "https://evil.example/steal" } }),
                ),
            )
            .mount(&server)
            .await;
        let client = client_for(&server);
        let result: Result<Vec<Item>, _> =
            client.get_all(client.endpoint(&["things"]), &Vec::new(), Bucket::Read).await;
        assert_eq!(result.unwrap_err(), ApiError::ForeignLink);
    }

    #[tokio::test]
    async fn retries_rate_limits_then_succeeds() {
        let server = MockServer::start().await;
        Mock::given(path("/v1/hackers/things"))
            .respond_with(ResponseTemplate::new(429).insert_header("retry-after", "0"))
            .up_to_n_times(1)
            .mount(&server)
            .await;
        Mock::given(path("/v1/hackers/things"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({ "data": [item(1)] })))
            .mount(&server)
            .await;
        let client = client_for(&server);
        let items: Vec<Item> = client.get_all(client.endpoint(&["things"]), &Vec::new(), Bucket::Read).await.unwrap();
        assert_eq!(items.len(), 1);
    }

    #[tokio::test]
    async fn gives_up_after_max_attempts_on_server_errors() {
        let server = MockServer::start().await;
        Mock::given(path("/v1/hackers/things")).respond_with(ResponseTemplate::new(503)).expect(3).mount(&server).await;
        let client = client_for(&server);
        let result: Result<Vec<Item>, _> =
            client.get_all(client.endpoint(&["things"]), &Vec::new(), Bucket::Read).await;
        assert_eq!(result.unwrap_err(), ApiError::Server { status: 503 });
    }

    #[tokio::test]
    async fn never_retries_a_post_on_server_error() {
        let server = MockServer::start().await;
        Mock::given(method("POST")).respond_with(ResponseTemplate::new(500)).expect(1).mount(&server).await;
        let client = client_for(&server);
        let result: Result<serde_json::Value, _> =
            client.send_json(Method::POST, client.endpoint(&["things"]), Some(&serde_json::json!({}))).await;
        assert_eq!(result.unwrap_err(), ApiError::Server { status: 500 });
    }

    #[tokio::test]
    async fn encodes_path_segments() {
        let server = MockServer::start().await;
        let client = client_for(&server);
        let url = client.endpoint(&["programs", "a/b c"]);
        assert_eq!(url.path(), "/v1/hackers/programs/a%2Fb%20c");
    }
}
