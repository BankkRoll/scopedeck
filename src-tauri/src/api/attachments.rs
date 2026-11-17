use serde::{Deserialize, Serialize};

use super::jsonapi::Resource;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Attachment {
    pub id: String,
    pub file_name: String,
    pub content_type: Option<String>,
    pub file_size: Option<u64>,
    pub expiring_url: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct AttachmentAttributes {
    file_name: String,
    content_type: Option<String>,
    file_size: Option<u64>,
    expiring_url: Option<String>,
    created_at: Option<String>,
}

impl From<Resource<AttachmentAttributes>> for Attachment {
    fn from(resource: Resource<AttachmentAttributes>) -> Self {
        let a = resource.attributes;
        Self {
            id: resource.id,
            file_name: a.file_name,
            content_type: a.content_type,
            file_size: a.file_size,
            expiring_url: a.expiring_url,
            created_at: a.created_at,
        }
    }
}
