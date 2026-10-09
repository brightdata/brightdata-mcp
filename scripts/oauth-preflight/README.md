# OAuth pre-flight (C11) — how to run the rest

Implements `devdocs/archaeology/scoped/5/step_by_step_impl_plan.md` (revision 2). Everything lives
here, outside the repository and outside `devdocs/`, because these are working scripts rather than
notes. `node_modules` is a symlink to the repo's so the MCP SDK resolves.

## What has already run (no side effects, nothing created)

| Script | Step | Result |
|---|---|---|
| `01-discovery.mjs` | 2 | 13/14 assertions passed; found that the two authorization-server metadata documents disagree |
| `05-usage.mjs` | 6 | API-token row of the 2×2 filled: 5 tools plain, 74 with `?pro=1` |
| `06-failures.mjs` | 7 | Three of four cases; the missing-challenge asymmetry confirmed |

Re-running any of these is free and idempotent.

## Rehearsed before production

`mock/` holds a local stand-in for Bright Data's authorization server and MCP endpoint. It implements
RFC 8414 discovery, RFC 7591 registration (with and without the RFC 7592 management half), PKCE-
verified code exchange, refresh, and an MCP endpoint that reproduces the bare `401` for an invalid
token.

```bash
node mock/rehearse.mjs      # runs steps 3-7 against the mock, simulating the login
```

10 of 10 checks pass. Run it after editing any script — it takes seconds and it has already caught
one defect that would have produced a wrong answer against production (the SDK dropping the
registration-management fields).

**It overwrites `evidence/`, `clients.json` and the draft with mock data.** Afterwards, re-run
`01-discovery.mjs`, `05-usage.mjs` and `06-failures.mjs` against the real endpoints to restore them.

## The gate

`02-registration.mjs` creates **real records on Bright Data's production authorization server**. It
refuses to run until two things are true:

1. **The R&D owner has been told.** Pass the date as `PREFLIGHT_NOTIFIED`. A draft message is in
   `notification-draft.md`.
2. **Cleanup is understood.** Phase A registers one disposable client and tries to delete it. If the
   server implements creation but not management, the script stops and asks for
   `PREFLIGHT_OWNER_CONFIRMED=yes` before creating the clients that matter.

```bash
cd "$(dirname "$0")"
PREFLIGHT_NOTIFIED=2026-09-10 node 02-registration.mjs
# if it stops at the cleanup gate and the owner has accepted it:
PREFLIGHT_NOTIFIED=2026-09-10 PREFLIGHT_OWNER_CONFIRMED=yes node 02-registration.mjs
```

## Then the login

```bash
node 03-authorize-and-token.mjs
```

It prints one URL and waits on `127.0.0.1:8765`.

- Open the URL in a **private window with no existing Bright Data session**. That exercises the
  first-time path a reviewer's fresh account will face, and keeps your identity out of any screenshot.
- Sign in. The browser returns to localhost and the script captures the code automatically — you
  never copy, paste or see it.
- While you are there, note what the page asks for (password only? MFA? email confirmation? a bot
  check?), whether a signed-out visitor could create an account, and what the consent screen says.
  Screenshots go in `evidence/`, cropped to the form.

Steps 4 and 5 run in one process because an authorization code is valid for under a minute and
exactly once.

## Then finish the measurements

```bash
node 05-usage.mjs     # fills the OAuth row of the 2x2 and makes one search_engine call
node 06-failures.mjs  # re-run once the token has aged past expires_in
```

## Assembling the deliverable

`oauth_preflight_draft.md` accumulates as each script runs. When the run is complete, that draft plus
a verdict becomes `oauth_preflight.md` for the dossier folder.

## Cleanup when finished

`clients.json` lists every `client_id` created. If `cleanup_is_self_service` is true, the `.rat-*`
files hold the management tokens needed to delete them; if false, the ids go to the R&D owner with a
request to remove them. Also revoke the authorization grant from the Bright Data account page.

## Secrets

Nothing secret is printed, pasted, or written outside this folder. `tokens.json` and `.rat-*` never
leave it. Everything recorded to `evidence/` passes through `redact()` first.
