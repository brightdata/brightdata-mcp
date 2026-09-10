# Draft message to the R&D owner (send before running 02-registration.mjs)

Short version, for Slack or email. Adjust the tone; the content is what matters.

---

Hi — before I run something against production, a heads-up so it doesn't surprise anyone.

For the OpenAI plugin submission, ChatGPT can only connect over OAuth (they don't accept API keys).
`mcp.brightdata.com` already advertises everything needed — S256 PKCE, dynamic client registration,
refresh tokens — but nobody has run the flow end to end, so we don't know whether ChatGPT can
actually get in.

I'd like to test it this week. That means creating a handful of OAuth client registrations on
`brightdata.com/users/auth/mcp/register`, all named `openai-preflight-<date>` so they're easy to
find, and completing one login with my own account. Concretely: one throwaway client to check
whether registrations can be deleted at all, then three real ones — the per-connector redirect URL
ChatGPT is forced to use, the stable one it would use if we advertised issuer identification, and a
localhost one to carry the actual login.

Two things I need from you:

1. **Is that fine to do against production?** If there's a staging tenant of the auth server, I'd
   rather use it.
2. **If the registration endpoint doesn't support deletion** (it implements creation for sure; the
   management half of the spec is a separate feature many servers skip), someone with admin access
   will need to remove the test clients afterwards. I'll send you the exact ids. I'm checking that
   first, with a single throwaway registration, before creating anything else.

Two findings already, from read-only checks that needed no credentials:

- **The authorization-server metadata is served in two places and the copies disagree.** The one on
  `brightdata.com` advertises `resource_parameter_supported: true` and an `agent_auth` block; the copy
  on `mcp.brightdata.com` has neither. Clients follow the first, so nothing is broken today, but one
  of them is stale and will drift.
- **A request carrying an invalid token gets a bare `401` with no `WWW-Authenticate` header**, while a
  request with no credentials at all gets the full challenge. Expired tokens take the first path, and
  that's the ordinary case in production — it's how a client learns it should log in again. Worth a
  look from whoever owns the auth server.

I'll send the full write-up once the flow has run.
