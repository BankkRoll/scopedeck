use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use super::{CacheError, from_json, new_id, now, to_json};
use crate::api::reports::SeverityRating;

const SETTINGS_KEY: &str = "settings";

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DraftContent {
    pub program_handle: Option<String>,
    pub title: String,
    pub structured_scope_id: Option<String>,
    pub weakness_id: Option<String>,
    pub severity_rating: Option<SeverityRating>,
    pub vulnerability_information: String,
    pub impact: String,
    #[serde(default)]
    pub acknowledged_exclusions: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DraftAttachment {
    pub id: String,
    pub file_name: String,
    pub size: u64,
    pub content_type: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Draft {
    pub id: String,
    #[serde(flatten)]
    pub content: DraftContent,
    pub attachments: Vec<DraftAttachment>,
    pub intent_id: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub(crate) struct StoredAttachment {
    pub path: PathBuf,
    pub file_name: String,
    pub content_type: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TemplateContent {
    pub name: String,
    pub title: String,
    pub vulnerability_information: String,
    pub impact: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Template {
    pub id: String,
    #[serde(flatten)]
    pub content: TemplateContent,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SavedSearch {
    pub id: String,
    pub name: String,
    /// Owned by the frontend query builder; validated there with Zod on every read.
    pub builder: serde_json::Value,
    pub created_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Theme {
    #[default]
    Dark,
    Light,
    System,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Settings {
    pub theme: Theme,
    pub sync_interval_minutes: u32,
    pub notifications: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self { theme: Theme::Dark, sync_interval_minutes: 15, notifications: false }
    }
}

impl Settings {
    pub(crate) fn normalized(mut self) -> Self {
        self.sync_interval_minutes = self.sync_interval_minutes.clamp(5, 24 * 60);
        self
    }
}

fn draft_attachments(conn: &Connection, draft_id: &str) -> Result<Vec<DraftAttachment>, CacheError> {
    let mut statement = conn.prepare_cached(
        "SELECT id, file_name, size, content_type FROM draft_attachments WHERE draft_id = ?1 ORDER BY rowid",
    )?;
    let rows = statement.query_map([draft_id], |row| {
        Ok(DraftAttachment {
            id: row.get(0)?,
            file_name: row.get(1)?,
            size: u64::try_from(row.get::<_, i64>(2)?).unwrap_or(0),
            content_type: row.get(3)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn draft_from_row(
    conn: &Connection,
    id: String,
    body: &str,
    intent_id: Option<String>,
    updated_at: String,
) -> Result<Draft, CacheError> {
    Ok(Draft { attachments: draft_attachments(conn, &id)?, content: from_json(body)?, id, intent_id, updated_at })
}

pub(crate) fn drafts(conn: &Connection) -> Result<Vec<Draft>, CacheError> {
    let mut statement = conn.prepare("SELECT id, body, intent_id, updated_at FROM drafts ORDER BY updated_at DESC")?;
    let rows = statement
        .query_map([], |row| Ok((row.get(0)?, row.get::<_, String>(1)?, row.get(2)?, row.get(3)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    rows.into_iter().map(|(id, body, intent, updated)| draft_from_row(conn, id, &body, intent, updated)).collect()
}

pub(crate) fn draft(conn: &Connection, id: &str) -> Result<Option<Draft>, CacheError> {
    let row: Option<(String, String, Option<String>, String)> = conn
        .query_row("SELECT id, body, intent_id, updated_at FROM drafts WHERE id = ?1", [id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .optional()?;
    row.map(|(id, body, intent, updated)| draft_from_row(conn, id, &body, intent, updated)).transpose()
}

pub(crate) fn save_draft(conn: &Connection, id: Option<&str>, content: &DraftContent) -> Result<Draft, CacheError> {
    let id = id.map_or_else(new_id, str::to_owned);
    let updated_at = now();
    conn.execute(
        "INSERT INTO drafts (id, body, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at",
        params![id, to_json(content)?, updated_at],
    )?;
    draft(conn, &id)?.ok_or(CacheError::Sqlite(rusqlite::Error::QueryReturnedNoRows))
}

pub(crate) fn set_draft_intent(conn: &Connection, draft_id: &str, intent_id: Option<&str>) -> Result<(), CacheError> {
    conn.execute("UPDATE drafts SET intent_id = ?2 WHERE id = ?1", params![draft_id, intent_id])?;
    Ok(())
}

pub(crate) fn forget_intent(conn: &Connection, intent_id: &str) -> Result<(), CacheError> {
    conn.execute("UPDATE drafts SET intent_id = NULL WHERE intent_id = ?1", [intent_id])?;
    Ok(())
}

pub(crate) fn delete_draft(conn: &Connection, id: &str) -> Result<(), CacheError> {
    conn.execute("DELETE FROM drafts WHERE id = ?1", [id])?;
    Ok(())
}

pub(crate) fn add_draft_attachment(
    conn: &Connection,
    draft_id: &str,
    path: &str,
    file_name: &str,
    size: u64,
    content_type: &str,
) -> Result<(), CacheError> {
    conn.execute(
        "INSERT INTO draft_attachments (id, draft_id, path, file_name, size, content_type) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![new_id(), draft_id, path, file_name, i64::try_from(size).unwrap_or(i64::MAX), content_type],
    )?;
    Ok(())
}

pub(crate) fn remove_draft_attachment(
    conn: &Connection,
    draft_id: &str,
    attachment_id: &str,
) -> Result<(), CacheError> {
    conn.execute("DELETE FROM draft_attachments WHERE draft_id = ?1 AND id = ?2", params![draft_id, attachment_id])?;
    Ok(())
}

pub(crate) fn stored_attachments(conn: &Connection, draft_id: &str) -> Result<Vec<StoredAttachment>, CacheError> {
    let mut statement =
        conn.prepare("SELECT path, file_name, content_type FROM draft_attachments WHERE draft_id = ?1 ORDER BY rowid")?;
    let rows = statement.query_map([draft_id], |row| {
        Ok(StoredAttachment {
            path: PathBuf::from(row.get::<_, String>(0)?),
            file_name: row.get(1)?,
            content_type: row.get(2)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub(crate) fn templates(conn: &Connection) -> Result<Vec<Template>, CacheError> {
    let mut statement = conn.prepare("SELECT id, body, updated_at FROM templates ORDER BY name COLLATE NOCASE")?;
    let rows = statement
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    rows.into_iter().map(|(id, body, updated_at)| Ok(Template { id, content: from_json(&body)?, updated_at })).collect()
}

pub(crate) fn save_template(
    conn: &Connection,
    id: Option<&str>,
    content: &TemplateContent,
) -> Result<Template, CacheError> {
    let id = id.map_or_else(new_id, str::to_owned);
    let updated_at = now();
    conn.execute(
        "INSERT INTO templates (id, name, body, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, body = excluded.body, updated_at = excluded.updated_at",
        params![id, content.name, to_json(content)?, updated_at],
    )?;
    Ok(Template { id, content: content.clone(), updated_at })
}

pub(crate) fn delete_template(conn: &Connection, id: &str) -> Result<(), CacheError> {
    conn.execute("DELETE FROM templates WHERE id = ?1", [id])?;
    Ok(())
}

pub(crate) fn saved_searches(conn: &Connection) -> Result<Vec<SavedSearch>, CacheError> {
    super::read_bodies(conn, "SELECT body FROM saved_searches ORDER BY created_at DESC", [])
}

pub(crate) fn save_search(
    conn: &Connection,
    name: &str,
    builder: serde_json::Value,
) -> Result<SavedSearch, CacheError> {
    let search = SavedSearch { id: new_id(), name: name.trim().to_owned(), builder, created_at: now() };
    conn.execute(
        "INSERT INTO saved_searches (id, name, body, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![search.id, search.name, to_json(&search)?, search.created_at],
    )?;
    Ok(search)
}

pub(crate) fn delete_search(conn: &Connection, id: &str) -> Result<(), CacheError> {
    conn.execute("DELETE FROM saved_searches WHERE id = ?1", [id])?;
    Ok(())
}

pub(crate) fn settings(conn: &Connection) -> Result<Settings, CacheError> {
    let raw: Option<String> =
        conn.query_row("SELECT value FROM kv WHERE key = ?1", [SETTINGS_KEY], |row| row.get(0)).optional()?;
    Ok(raw.as_deref().map(from_json::<Settings>).transpose()?.unwrap_or_default().normalized())
}

pub(crate) fn save_settings(conn: &Connection, settings: Settings) -> Result<Settings, CacheError> {
    let settings = settings.normalized();
    conn.execute(
        "INSERT INTO kv (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![SETTINGS_KEY, to_json(&settings)?],
    )?;
    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::Cache;

    #[test]
    fn drafts_round_trip_with_attachments_that_cascade_on_delete() {
        let cache = Cache::in_memory().unwrap();
        let content = DraftContent {
            title: "IDOR".into(),
            severity_rating: Some(SeverityRating::High),
            ..DraftContent::default()
        };
        let saved = cache.with(|conn| save_draft(conn, None, &content)).unwrap();
        cache.with(|conn| add_draft_attachment(conn, &saved.id, "/tmp/poc.png", "poc.png", 10, "image/png")).unwrap();
        let loaded = cache.with(|conn| draft(conn, &saved.id)).unwrap().unwrap();
        assert_eq!(loaded.content, content);
        assert_eq!(loaded.attachments[0].file_name, "poc.png");
        let serialized = serde_json::to_value(&loaded).unwrap();
        assert!(serialized.get("path").is_none());
        assert!(!serialized.to_string().contains("/tmp/poc.png"));
        cache.with(|conn| delete_draft(conn, &saved.id)).unwrap();
        assert!(cache.with(|conn| stored_attachments(conn, &saved.id)).unwrap().is_empty());
    }

    #[test]
    fn settings_default_and_clamp() {
        let cache = Cache::in_memory().unwrap();
        assert_eq!(cache.with(|conn| settings(conn)).unwrap(), Settings::default());
        let saved = cache
            .with(|conn| {
                save_settings(conn, Settings { theme: Theme::Light, sync_interval_minutes: 1, notifications: true })
            })
            .unwrap();
        assert_eq!(saved.sync_interval_minutes, 5);
        assert_eq!(cache.with(|conn| settings(conn)).unwrap().theme, Theme::Light);
    }

    #[test]
    fn templates_and_saved_searches_persist() {
        let cache = Cache::in_memory().unwrap();
        let template = cache
            .with(|conn| {
                save_template(
                    conn,
                    None,
                    &TemplateContent {
                        name: "XSS".into(),
                        title: "t".into(),
                        vulnerability_information: "v".into(),
                        impact: "i".into(),
                    },
                )
            })
            .unwrap();
        assert_eq!(cache.with(|conn| templates(conn)).unwrap()[0].id, template.id);
        cache.with(|conn| save_search(conn, " crit ", serde_json::json!({ "mode": "raw" }))).unwrap();
        assert_eq!(cache.with(|conn| saved_searches(conn)).unwrap()[0].name, "crit");
    }
}
