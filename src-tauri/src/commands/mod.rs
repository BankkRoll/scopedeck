#![allow(
    clippy::needless_pass_by_value,
    reason = "Tauri deserializes command arguments into owned values, and State must be taken by value"
)]

pub(crate) mod ai;
pub(crate) mod auth;
pub(crate) mod hacktivity;
pub(crate) mod intents;
pub(crate) mod payments;
pub(crate) mod programs;
pub(crate) mod reports;
pub(crate) mod system;
pub(crate) mod workspace;
