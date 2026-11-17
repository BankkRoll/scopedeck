use std::collections::VecDeque;
use std::time::Duration;
use tokio::sync::Mutex;
use tokio::time::Instant;

#[derive(Debug)]
pub(crate) struct SlidingWindow {
    capacity: usize,
    window: Duration,
    hits: Mutex<VecDeque<Instant>>,
}

impl SlidingWindow {
    pub(crate) fn new(capacity: usize, window: Duration) -> Self {
        Self { capacity, window, hits: Mutex::new(VecDeque::with_capacity(capacity)) }
    }

    pub(crate) async fn acquire(&self) {
        loop {
            let wait = {
                let mut hits = self.hits.lock().await;
                let now = Instant::now();
                while hits.front().is_some_and(|hit| now.duration_since(*hit) >= self.window) {
                    hits.pop_front();
                }
                if hits.len() < self.capacity {
                    hits.push_back(now);
                    return;
                }
                hits.front().map_or(Duration::ZERO, |oldest| self.window.saturating_sub(now.duration_since(*oldest)))
            };
            tokio::time::sleep(wait).await;
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Bucket {
    Read,
    Write,
    StructuredScopes,
}

/// Limits published at <https://api.hackerone.com/getting-started-hacker-api/#rate-limits>:
/// reads 600/min, writes 25/20s, and structured scopes 50/min on top of the read limit.
#[derive(Debug)]
pub(crate) struct RateLimits {
    read: SlidingWindow,
    write: SlidingWindow,
    structured_scopes: SlidingWindow,
}

impl Default for RateLimits {
    fn default() -> Self {
        Self {
            read: SlidingWindow::new(600, Duration::from_secs(60)),
            write: SlidingWindow::new(25, Duration::from_secs(20)),
            structured_scopes: SlidingWindow::new(50, Duration::from_secs(60)),
        }
    }
}

impl RateLimits {
    pub(crate) async fn acquire(&self, bucket: Bucket) {
        match bucket {
            Bucket::Read => self.read.acquire().await,
            Bucket::Write => self.write.acquire().await,
            Bucket::StructuredScopes => {
                self.structured_scopes.acquire().await;
                self.read.acquire().await;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test(start_paused = true)]
    async fn blocks_once_capacity_is_used_until_window_slides() {
        let limiter = SlidingWindow::new(2, Duration::from_secs(10));
        let start = Instant::now();
        limiter.acquire().await;
        limiter.acquire().await;
        assert_eq!(start.elapsed(), Duration::ZERO);
        limiter.acquire().await;
        assert_eq!(start.elapsed(), Duration::from_secs(10));
    }

    #[tokio::test(start_paused = true)]
    async fn scope_bucket_counts_against_read_limit() {
        let limits = RateLimits {
            read: SlidingWindow::new(1, Duration::from_secs(5)),
            write: SlidingWindow::new(1, Duration::from_secs(5)),
            structured_scopes: SlidingWindow::new(5, Duration::from_secs(5)),
        };
        let start = Instant::now();
        limits.acquire(Bucket::StructuredScopes).await;
        limits.acquire(Bucket::Read).await;
        assert_eq!(start.elapsed(), Duration::from_secs(5));
        limits.acquire(Bucket::Write).await;
        assert_eq!(start.elapsed(), Duration::from_secs(5));
    }
}
