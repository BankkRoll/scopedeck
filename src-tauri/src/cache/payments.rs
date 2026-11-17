use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};

use super::{CacheError, from_json, read_bodies, to_json};
use crate::api::payments::{Balance, Earning, Payout};

const BALANCE_KEY: &str = "payments.balance";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EarningsSnapshot {
    pub balance: Option<Balance>,
    pub earnings: Vec<Earning>,
    pub payouts: Vec<Payout>,
}

pub(crate) fn store(
    conn: &mut Connection,
    balance: Balance,
    earnings: &[Earning],
    payouts: &[Payout],
) -> Result<(), CacheError> {
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO kv (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![BALANCE_KEY, to_json(&balance)?],
    )?;
    tx.execute("DELETE FROM earnings", [])?;
    tx.execute("DELETE FROM payouts", [])?;
    for (position, earning) in earnings.iter().enumerate() {
        tx.execute(
            "INSERT INTO earnings (id, body, position) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET body = excluded.body",
            params![earning.id, to_json(earning)?, super::sql_int(position)],
        )?;
    }
    for (position, payout) in payouts.iter().enumerate() {
        tx.execute(
            "INSERT INTO payouts (position, body) VALUES (?1, ?2)",
            params![super::sql_int(position), to_json(payout)?],
        )?;
    }
    tx.commit()?;
    Ok(())
}

pub(crate) fn snapshot(conn: &Connection) -> Result<EarningsSnapshot, CacheError> {
    let balance: Option<String> =
        conn.query_row("SELECT value FROM kv WHERE key = ?1", [BALANCE_KEY], |row| row.get(0)).optional()?;
    Ok(EarningsSnapshot {
        balance: balance.as_deref().map(from_json).transpose()?,
        earnings: read_bodies(conn, "SELECT body FROM earnings ORDER BY position", [])?,
        payouts: read_bodies(conn, "SELECT body FROM payouts ORDER BY position", [])?,
    })
}
