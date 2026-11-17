use std::time::Duration;
use time::OffsetDateTime;
use time::format_description::well_known::Rfc2822;

#[derive(Debug, Clone, Copy)]
pub(crate) struct RetryPolicy {
    pub max_attempts: u32,
    pub base_delay: Duration,
    pub max_delay: Duration,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self { max_attempts: 5, base_delay: Duration::from_millis(500), max_delay: Duration::from_secs(30) }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Idempotency {
    Safe,
    Unsafe,
}

impl RetryPolicy {
    /// Full-jitter exponential backoff. `jitter` is a sample in `[0, 1]`; a server-provided
    /// `Retry-After` takes precedence because the server knows when the window resets.
    pub(crate) fn delay(&self, attempt: u32, retry_after: Option<Duration>, jitter: f64) -> Duration {
        if let Some(server_delay) = retry_after {
            return server_delay.min(self.max_delay.saturating_mul(4));
        }
        let exponential = self.base_delay.saturating_mul(2_u32.saturating_pow(attempt.min(16))).min(self.max_delay);
        exponential.mul_f64(jitter.clamp(0.0, 1.0))
    }

    pub(crate) fn should_retry_status(&self, status: u16, attempt: u32, idempotency: Idempotency) -> bool {
        if attempt + 1 >= self.max_attempts {
            return false;
        }
        match status {
            429 => true,
            // A 5xx on a POST may mean the report was created before the failure; retrying could
            // submit the same vulnerability twice, so only idempotent requests retry on 5xx.
            500 | 502 | 503 | 504 => idempotency == Idempotency::Safe,
            _ => false,
        }
    }

    pub(crate) fn should_retry_network(&self, error: &reqwest::Error, attempt: u32, idempotency: Idempotency) -> bool {
        if attempt + 1 >= self.max_attempts {
            return false;
        }
        error.is_connect() || (idempotency == Idempotency::Safe && error.is_timeout())
    }
}

pub(crate) fn parse_retry_after(value: &str, now: OffsetDateTime) -> Option<Duration> {
    let trimmed = value.trim();
    if let Ok(seconds) = trimmed.parse::<u64>() {
        return Some(Duration::from_secs(seconds));
    }
    let at = OffsetDateTime::parse(trimmed, &Rfc2822).ok()?;
    let remaining = at - now;
    Some(Duration::try_from(remaining).unwrap_or(Duration::ZERO))
}

pub(crate) fn jitter_sample() -> f64 {
    rand::random_range(0.0..=1.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::macros::datetime;

    fn policy() -> RetryPolicy {
        RetryPolicy { max_attempts: 4, base_delay: Duration::from_millis(100), max_delay: Duration::from_secs(2) }
    }

    #[test]
    fn backoff_grows_exponentially_and_caps() {
        let p = policy();
        assert_eq!(p.delay(0, None, 1.0), Duration::from_millis(100));
        assert_eq!(p.delay(1, None, 1.0), Duration::from_millis(200));
        assert_eq!(p.delay(3, None, 1.0), Duration::from_millis(800));
        assert_eq!(p.delay(10, None, 1.0), Duration::from_secs(2));
        assert_eq!(p.delay(40, None, 1.0), Duration::from_secs(2));
    }

    #[test]
    fn jitter_scales_delay_within_bounds() {
        let p = policy();
        assert_eq!(p.delay(2, None, 0.0), Duration::ZERO);
        assert_eq!(p.delay(2, None, 0.5), Duration::from_millis(200));
        assert_eq!(p.delay(2, None, 7.0), Duration::from_millis(400));
        let sample = jitter_sample();
        assert!((0.0..=1.0).contains(&sample));
    }

    #[test]
    fn retry_after_overrides_backoff_but_is_bounded() {
        let p = policy();
        assert_eq!(p.delay(0, Some(Duration::from_secs(3)), 0.1), Duration::from_secs(3));
        assert_eq!(p.delay(0, Some(Duration::from_secs(600)), 0.1), Duration::from_secs(8));
    }

    #[test]
    fn retries_only_transient_statuses_and_respects_idempotency() {
        let p = policy();
        assert!(p.should_retry_status(429, 0, Idempotency::Unsafe));
        assert!(p.should_retry_status(503, 0, Idempotency::Safe));
        assert!(!p.should_retry_status(503, 0, Idempotency::Unsafe));
        assert!(!p.should_retry_status(404, 0, Idempotency::Safe));
        assert!(!p.should_retry_status(422, 0, Idempotency::Safe));
        assert!(!p.should_retry_status(429, 3, Idempotency::Safe));
    }

    #[test]
    fn parses_retry_after_seconds_and_http_dates() {
        let now = datetime!(2026-11-17 12:00:00 UTC);
        assert_eq!(parse_retry_after("12", now), Some(Duration::from_secs(12)));
        assert_eq!(parse_retry_after("Tue, 17 Nov 2026 12:00:30 GMT", now), Some(Duration::from_secs(30)));
        assert_eq!(parse_retry_after("Tue, 17 Nov 2026 11:00:00 GMT", now), Some(Duration::ZERO));
        assert_eq!(parse_retry_after("soon", now), None);
    }
}
