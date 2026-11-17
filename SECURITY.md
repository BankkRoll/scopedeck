# Security policy

Scopedeck handles API tokens that can submit reports on your behalf, so security issues in the app
are taken seriously.

## Reporting a vulnerability

Report privately through
[GitHub private vulnerability reporting](https://github.com/BankkRoll/scopedeck/security/advisories/new).
Do not open a public issue, pull request or discussion for a security problem.

Include:

- the version and platform;
- what an attacker can do and what they need (for example, a malicious program policy or a
  hostile network);
- steps to reproduce or a proof of concept.

You can expect an acknowledgement within three working days and an assessment within ten. Fixes
ship in a patch release, and you will be credited in the advisory unless you ask not to be.

## Scope

In scope:

- the token, or the `Authorization` header derived from it, leaving the keychain other than in a
  request to `api.hackerone.com`, including through logs, errors, the cache or the web view;
- script execution in the web view, for example through Markdown from a report or program policy;
- the web view reaching a Tauri command, plugin or file path it should not;
- opening a URL outside the hackerone.com allowlist;
- an update being installed without a valid signature.

Out of scope:

- vulnerabilities in HackerOne itself. Report those to
  [HackerOne's own program](https://hackerone.com/security);
- attacks that need an attacker to already control your user account or unlock your keychain;
- issues in upstream dependencies with no demonstrated impact on Scopedeck.

## Supported versions

Only the latest release receives security fixes.
