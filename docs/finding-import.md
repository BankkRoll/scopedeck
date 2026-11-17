# Finding import format

Scopedeck can start a report draft from a JSON file, so scanners, notes tooling or scripts can
hand findings to the composer. Open the composer, choose **Import JSON**, then drop or paste the
file.

The machine-readable contract is [`finding-schema.json`](finding-schema.json) (JSON Schema
2020-12). It is generated from the validator the app runs, and a test fails if the two disagree,
so a file that validates against the schema will parse in the app.

## Example

```json
{
  "schemaVersion": 1,
  "title": "SSRF via webhook URL",
  "asset": "https://hooks.example.com",
  "weakness": { "cwe": "CWE-918", "name": "Server-Side Request Forgery (SSRF)" },
  "severity": { "rating": "high", "cvss": "CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:N/A:N" },
  "summary": "The webhook URL is fetched server-side without an allowlist.",
  "steps": [
    "Set the webhook URL to http://169.254.169.254/latest/meta-data/",
    "Trigger a test delivery",
    "Read the metadata response in the delivery log"
  ],
  "impact": "An attacker can read cloud instance credentials.",
  "poc": "curl -X POST https://hooks.example.com/test -d 'url=http://169.254.169.254/'",
  "references": ["https://cwe.mitre.org/data/definitions/918.html"]
}
```

## Fields

| Field           | Required | Type                                       | Notes                                                                                            |
| --------------- | -------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `schemaVersion` | yes      | `1`                                        | Bumped only on a breaking change.                                                                |
| `title`         | yes      | string, 1 to 250 characters                |                                                                                                  |
| `asset`         | no       | string                                     | A URL, host or identifier. Matched against the program's scope, including wildcards.             |
| `weakness`      | no       | string, positive integer, or `{cwe, name}` | Matched by CWE number first (`"CWE-79"`, `"79"` or `79`), then by exact name.                    |
| `severity`      | no       | rating, or `{rating, cvss}`                | Rating is one of `none`, `low`, `medium`, `high`, `critical`. A CVSS vector is kept in the body. |
| `summary`       | no       | string                                     |                                                                                                  |
| `steps`         | yes      | non-empty array of strings, or one string  | An array becomes a numbered list.                                                                |
| `impact`        | yes      | string                                     | Fills the report's impact field.                                                                 |
| `poc`           | no       | string                                     | Wrapped in a code fence unless it already contains one.                                          |
| `references`    | no       | array of URLs                              |                                                                                                  |

Unknown fields are ignored.

## How it maps to a draft

The importer builds the vulnerability information as Markdown with these sections, skipping any
that are empty: Summary, Asset, Steps to reproduce, Proof of concept, CVSS, References.

Fields that cannot be resolved against the selected program are left empty in the draft and
listed for review before you confirm the import:

- the asset is not in scope, or matches an asset that does not accept submissions;
- the weakness is not one of the program's weaknesses;
- no asset or severity was given.

Nothing is submitted by an import. The result is an ordinary draft that goes through the same
review and confirmation as one written by hand.
