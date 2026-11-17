use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;

use crate::api::client::ApiClient;
use crate::api::programs::{self, ScopeFilter};
use crate::api::{payments, reports};
use crate::cache::payments::EarningsSnapshot;
use crate::cache::programs::{ProgramDetail, ProgramRow, ScopeSync, scope_resource};
use crate::cache::reports::ReportChange;
use crate::cache::{self, Cache, Cached, mark_synced, now, synced_at};
use crate::error::CommandResult;

pub(crate) const PROGRAMS: &str = "programs";
pub(crate) const REPORTS: &str = "reports";
pub(crate) const EARNINGS: &str = "earnings";

/// Structured scopes are rate limited to 50 requests a minute, so most refreshes only ask for
/// scopes updated since the last sync. A periodic full fetch still catches removed assets.
const FULL_SCOPE_REFRESH_SECS: i64 = 6 * 60 * 60;

fn full_scope_resource(handle: &str) -> String {
    format!("program-full:{handle}")
}

fn age_secs(timestamp: Option<&str>, now: OffsetDateTime) -> Option<i64> {
    let parsed = OffsetDateTime::parse(timestamp?, &Rfc3339).ok()?;
    Some((now - parsed).whole_seconds())
}

pub(crate) fn cached_programs(cache: &Cache) -> CommandResult<Cached<Vec<ProgramRow>>> {
    Ok(cache.with(|conn| Ok(Cached { data: cache::programs::list(conn)?, synced_at: synced_at(conn, PROGRAMS)? }))?)
}

pub(crate) async fn programs(client: &ApiClient, cache: &Cache) -> CommandResult<Cached<Vec<ProgramRow>>> {
    let started = now();
    let fetched = programs::list(client).await?;
    cache.with(|conn| {
        cache::programs::replace_all(conn, &fetched)?;
        mark_synced(conn, PROGRAMS, &started)
    })?;
    cached_programs(cache)
}

pub(crate) fn cached_program(cache: &Cache, handle: &str) -> CommandResult<Cached<ProgramDetail>> {
    Ok(cache.with(|conn| {
        Ok(Cached {
            data: cache::programs::detail(conn, handle)?,
            synced_at: synced_at(conn, &scope_resource(handle))?,
        })
    })?)
}

pub(crate) async fn program(client: &ApiClient, cache: &Cache, handle: &str) -> CommandResult<Cached<ProgramDetail>> {
    let started = now();
    let (previous, last_full) = cache
        .with(|conn| Ok((synced_at(conn, &scope_resource(handle))?, synced_at(conn, &full_scope_resource(handle))?)))?;
    let needs_full =
        age_secs(last_full.as_deref(), OffsetDateTime::now_utc()).is_none_or(|age| age >= FULL_SCOPE_REFRESH_SECS);
    let filter = ScopeFilter { updated_after: if needs_full { None } else { previous.clone() }, created_after: None };
    let (program, scopes, exclusions, weaknesses) = tokio::try_join!(
        programs::get(client, handle),
        programs::structured_scopes(client, handle, &filter),
        programs::scope_exclusions(client, handle),
        programs::weaknesses(client, handle),
    )?;
    cache.with(|conn| {
        cache::programs::upsert(conn, &program)?;
        let sync = if needs_full {
            ScopeSync::Full { scopes: &scopes, changed_after: previous.as_deref() }
        } else {
            ScopeSync::Incremental { changed: &scopes }
        };
        cache::programs::store_scopes(conn, handle, &sync, &started)?;
        cache::programs::store_exclusions_and_weaknesses(conn, handle, &exclusions, &weaknesses)?;
        mark_synced(conn, &scope_resource(handle), &started)?;
        if needs_full {
            mark_synced(conn, &full_scope_resource(handle), &started)?;
        }
        Ok(())
    })?;
    cached_program(cache, handle)
}

pub(crate) fn cached_reports(cache: &Cache) -> CommandResult<Cached<Vec<reports::Report>>> {
    Ok(cache.with(|conn| Ok(Cached { data: cache::reports::list(conn)?, synced_at: synced_at(conn, REPORTS)? }))?)
}

pub(crate) async fn reports(
    client: &ApiClient,
    cache: &Cache,
) -> CommandResult<(Cached<Vec<reports::Report>>, Vec<ReportChange>)> {
    let started = now();
    let fetched = reports::mine(client).await?;
    let changes = cache.with(|conn| {
        let first_sync = synced_at(conn, REPORTS)?.is_none();
        let changes = cache::reports::replace_list(conn, &fetched)?;
        mark_synced(conn, REPORTS, &started)?;
        Ok(if first_sync { Vec::new() } else { changes })
    })?;
    Ok((cached_reports(cache)?, changes))
}

pub(crate) fn cached_earnings(cache: &Cache) -> CommandResult<Cached<EarningsSnapshot>> {
    Ok(cache
        .with(|conn| Ok(Cached { data: cache::payments::snapshot(conn)?, synced_at: synced_at(conn, EARNINGS)? }))?)
}

pub(crate) async fn earnings(client: &ApiClient, cache: &Cache) -> CommandResult<Cached<EarningsSnapshot>> {
    let started = now();
    let (balance, earnings, payouts) =
        tokio::try_join!(payments::balance(client), payments::earnings(client), payments::payouts(client))?;
    cache.with(|conn| {
        cache::payments::store(conn, balance, &earnings, &payouts)?;
        mark_synced(conn, EARNINGS, &started)
    })?;
    cached_earnings(cache)
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::macros::datetime;

    #[test]
    fn computes_age_of_rfc3339_timestamps() {
        let now = datetime!(2026-11-17 12:00:00 UTC);
        assert_eq!(age_secs(Some("2026-11-17T11:00:00Z"), now), Some(3600));
        assert_eq!(age_secs(Some("garbage"), now), None);
        assert_eq!(age_secs(None, now), None);
    }
}
