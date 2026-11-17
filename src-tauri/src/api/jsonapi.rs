use serde::Deserialize;
use serde::de::{self, Deserializer};

#[derive(Debug, Deserialize)]
pub(crate) struct Document<D> {
    pub data: D,
    #[serde(default)]
    pub links: Links,
}

#[derive(Debug, Default, Deserialize)]
pub(crate) struct Links {
    pub next: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
pub(crate) struct NoRelationships {}

#[derive(Debug, Deserialize)]
#[serde(bound(deserialize = "A: Deserialize<'de>, R: Deserialize<'de> + Default"))]
pub(crate) struct Resource<A, R = NoRelationships> {
    #[serde(deserialize_with = "flexible_id")]
    pub id: String,
    #[serde(rename = "type", default)]
    pub kind: String,
    pub attributes: A,
    #[serde(default)]
    pub relationships: R,
}

#[derive(Debug, Deserialize)]
pub(crate) struct Embedded<A> {
    pub attributes: A,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ResourceRef {
    #[serde(deserialize_with = "flexible_id")]
    pub id: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct One<T> {
    pub data: Option<T>,
}

impl<T> One<T> {
    pub fn into_inner(this: Option<Self>) -> Option<T> {
        this.and_then(|one| one.data)
    }
}

#[derive(Debug, Deserialize)]
#[serde(bound(deserialize = "T: Deserialize<'de>"))]
pub(crate) struct Many<T> {
    #[serde(default = "Vec::new", deserialize_with = "null_as_empty")]
    pub data: Vec<T>,
}

impl<T> Default for Many<T> {
    fn default() -> Self {
        Self { data: Vec::new() }
    }
}

// The docs mix integer and string ids for the same resource (programs are `9` in examples and
// `"9"` in the reference), so ids are normalised to strings at the boundary.
pub(crate) fn flexible_id<'de, D: Deserializer<'de>>(deserializer: D) -> Result<String, D::Error> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum RawId {
        Text(String),
        Number(i64),
    }
    match RawId::deserialize(deserializer)? {
        RawId::Text(text) if text.is_empty() => Err(de::Error::custom("empty id")),
        RawId::Text(text) => Ok(text),
        RawId::Number(number) => Ok(number.to_string()),
    }
}

pub(crate) fn null_as_empty<'de, D, T>(deserializer: D) -> Result<Vec<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Ok(Option::<Vec<T>>::deserialize(deserializer)?.unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[derive(Debug, Deserialize)]
    struct Attrs {
        name: String,
    }

    #[derive(Debug, Default, Deserialize)]
    struct Rels {
        #[serde(default)]
        tags: Many<Resource<Attrs>>,
        owner: Option<One<ResourceRef>>,
    }

    #[test]
    fn parses_list_document_with_links() {
        let doc: Document<Vec<Resource<Attrs>>> = serde_json::from_value(json!({
            "data": [{ "id": 9, "type": "program", "attributes": { "name": "a" } }],
            "links": { "self": "https://x/1", "next": "https://x/2" }
        }))
        .unwrap();
        assert_eq!(doc.data[0].id, "9");
        assert_eq!(doc.data[0].kind, "program");
        assert_eq!(doc.data[0].attributes.name, "a");
        assert_eq!(doc.links.next.as_deref(), Some("https://x/2"));
    }

    #[test]
    fn missing_or_empty_links_have_no_next_page() {
        let missing: Document<Vec<Resource<Attrs>>> = serde_json::from_value(json!({ "data": [] })).unwrap();
        let empty: Document<Vec<Resource<Attrs>>> = serde_json::from_value(json!({ "data": [], "links": {} })).unwrap();
        assert!(missing.links.next.is_none());
        assert!(empty.links.next.is_none());
    }

    #[test]
    fn relationships_tolerate_null_and_absent_data() {
        let resource: Resource<Attrs, Rels> = serde_json::from_value(json!({
            "id": "1",
            "type": "report",
            "attributes": { "name": "r" },
            "relationships": { "tags": { "data": null }, "owner": { "data": null } }
        }))
        .unwrap();
        assert!(resource.relationships.tags.data.is_empty());
        assert!(One::into_inner(resource.relationships.owner).is_none());

        let bare: Resource<Attrs, Rels> = serde_json::from_value(json!({
            "id": "2",
            "attributes": { "name": "r" }
        }))
        .unwrap();
        assert!(bare.relationships.tags.data.is_empty());
    }

    #[test]
    fn rejects_empty_ids() {
        let result: Result<Resource<Attrs>, _> =
            serde_json::from_value(json!({ "id": "", "attributes": { "name": "x" } }));
        assert!(result.is_err());
    }
}
