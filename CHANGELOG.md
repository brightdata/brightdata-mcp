# Changelog

All notable changes to this project will be documented in this file.

## [4.7.0] - 2026-11-09

### Changed
- `search_engine` returns a timeout error after 55 s, like
  `search_engine_batch`.
- `search_engine` and `search_engine_batch` reject an empty `query`.
- Bing searches no longer send the `cc` URL parameter; `country` is
  passed only as the request country.
- `scrape_as_markdown` and `scrape_batch` cut page content at 40,000
  characters (was 200,000 and 100,000).
- `scrape_as_markdown` and `scrape_batch` no longer return `final_url`.
- `Search failed` errors no longer end with a misleading
  `Details: the search engine answer was not JSON`.
- Clearer `search_engine`, `scrape_as_markdown` and `scrape_batch`
  descriptions.

## [4.6.0] - 2026-11-05

### Removed
- `scrape_as_html`. Use `scrape_as_markdown` with `format: 'html'`.
- `extract`.
- `WEB_UNLOCKER_ZONE`. The server no longer uses or creates a Web
  Unlocker zone. The variable is ignored if set.

### Changed
- A usage limit (`client_10100`) always returns `Usage limit reached`,
  naming both causes: free credits or funds used up, or a zone limit.
  It no longer guesses `Free credits used up` from the zone name.

## [4.5.0] - 2026-11-05

### Changed
- `search_engine_batch` waits up to 55 s (was 45 s) before returning a
  timeout for the searches that haven't finished.
- Scraper tools have their own errors: `Scraper not found` (call
  `search_scrapers`), `Method not found`, `Scraper input rejected` (call
  `get_scraper_details`), `Snapshot not found`, `Collection failed`.
- `chatgpt_ai_insights` and `perplexity_ai_insights` report
  `Collection timed out` with the snapshot_id after 10 minutes without
  data, and `Collection failed` when the run fails, instead of
  `Tool error`.
- Browser tools use the common error format: `Element not found` /
  `Element ambiguous` (take a new snapshot), `Browser timed out`,
  `Site not found`, `Zone not found`, `Browser action failed`.
- `ask_brightdata_assistant` reports `Assistant timed out` with the
  dialog_id to retry with.
- Reaching the `RATE_LIMIT` cap returns `Call limit reached` instead of
  `Tool '...' execution failed: Rate limit exceeded`.

### Fixed
- `scraping_browser_navigate` accepts only http and https URLs.

## [4.4.0] - 2026-11-04

### Changed
- One error format for every tool: `<Title>: <what happened>. <what to
  do> Details: <details>`, e.g. `Zone not found: ...` or `Rate limited:
  ...`. Titles replace the old codes (`invalid_input`, `rate_limited`,
  ...). Details carry the API's message, the HTTP status, or the error
  text, on every error.
- Search errors name the query, fetch errors name the URL.
- A missing zone, a usage limit and a failed sign-in are reported as
  such, never as a bad input.
- `scrape_batch` returns one error per URL even when every URL fails. A
  batch that fails as a whole (job failed, timed out, rejected) is one
  error.
- `search_engine_batch` returns one error when every query fails the same
  way (e.g. a bad token), instead of a copy per query.

### Fixed
- `scrape_as_html` and `extract` report a failed page (unknown domain,
  site error, empty page) as an error instead of empty content.
- An unknown domain is reported as `Site not found` on fetch tools too.
- `search_dataset` with an unsupported filter says `Filter rejected`
  instead of reporting a service outage.
- Browser tools with a bad token report `Sign-in failed`.
- Bright Data's own error messages are no longer marked as untrusted web
  content; only site error pages from `scrape_as_html` and `extract` are.
- A page in a misread character encoding (e.g. Shift_JIS) is returned
  with a note instead of being called a PDF or binary file.
- URLs with a Unicode domain (e.g. `https://münchen.de/`) work: the host
  is sent as punycode, results keep the URL as given.

## [4.3.0] - 2026-11-02

### Changed
- `search_engine` and `search_engine_batch` use a SERP API zone instead
  of Web Unlocker. New `SERP_ZONE` env var (default `mcp_serp`); the
  zone is created on startup if missing.
- Bing is the default engine. Both engines return JSON:
  `{organic: [{link, title, description}]}`.
- `geo_location` is renamed to `country`, and `cursor` to `page` (a
  number from 0, 10 results per page). The old names return an
  `invalid_input` error.
- New `time_range`: `hour`, `day`, `week`, `month`, `year`, `any`
  (default). Bing supports only `day`, `week` and `year`.
- A search that returns no data gives a `service_unavailable` error.
- `search_engine_batch` stops at 45 s and returns the searches that
  finished; the rest get a `timeout` error.
- Each zone is created on its own, so one failed zone no longer skips
  the others.
- Fetch API (`scrape_as_markdown`, `scrape_batch`) request errors use
  the same codes and texts as the hosted server: `rate_limited` (was
  `busy`), `service_unavailable` (was `service_error`), `invalid_input`
  (was `invalid_url`), `quota_exceeded` (new, usage limit reached) and a
  generic `auth_failed` (also on 407). A site limiting requests is now
  `site_rate_limited`.

### Removed
- Yandex.

## [4.2.0] - 2026-11-01

### Changed
- `scrape_as_markdown` and `scrape_batch` use Bright Data's Fetch API
  instead of Web Unlocker. There is no JavaScript rendering.
- Both tools return JSON: `url`, `title`, `format`, `content`, plus
  `final_url` after a redirect and a `note` when relevant.
  `scrape_batch` returns an array in input order; a failed URL is
  `{url, error}`.
- New `format` param: `markdown` (default), `text`, `html` or
  `ld_json`. If the page has no data in that format, markdown is
  returned with a note.
- `scrape_as_markdown` stops at 45 s with a `timeout` error.
  `scrape_batch` sends all URLs in one request, cancels at 35 s and
  returns the pages that finished; the rest get a `timeout` error.
- Clear one-line errors: `page_not_found`, `fetch_failed`,
  `invalid_url`, `rate_limited`, `empty_page`, `unsupported_content`
  (PDF/binary), `no_data`, `timeout`, `auth_failed`, `busy` (429, never
  retried), `service_error` (one retry on 5xx), `network_error`.
- Page content is cut at 200,000 characters (`scrape_as_markdown`) or
  100,000 per page (`scrape_batch`), with a note.
- Markdown is no longer stripped of headings.

### Removed
- `remark` and `strip-markdown` dependencies.

## [4.1.1] - 2026-10-29

### Fixed
- Browser element refs stay unique across repeated snapshots, so a
  click or type can no longer act on a different element than the one
  it names. Ambiguous matches are rejected instead of picking the first.

### Changed
- Free-tier message, `fill_form` hint and tool descriptions updated
  for OpenAI store compliance.
- `ask_brightdata_assistant` polls every 2s and waits up to 60s for a
  reply (was 30s).
- CI installs the packed npm package and runs tests before publishing.

## [4.1.0] - 2026-10-20

### Added
- The server sends MCP `instructions` telling the model which tool to
  use when: a pre-built scraper first for known sites, then
  `scrape_as_markdown` / `scrape_batch`, and the browser tools only for
  clicks, typing or screenshots.

### Changed
- Every tool sets `readOnlyHint`, `destructiveHint` and `openWorldHint`
  explicitly, following OpenAI's plugin rules. `run_scraper` and the AI
  insights tools are no longer read-only (they start a collection job),
  browser navigation and scrolling are no longer destructive, and
  `scraping_browser_click_ref` / `scraping_browser_type_ref` are
  destructive. Clients may ask for confirmation before those tools.
- Tool errors are token-redacted, stripped of stack traces and capped
  at 500 characters, including browser tool errors and upstream error
  pages.
- Tool descriptions no longer claim to unlock any page "even if it uses
  bot detection or CAPTCHA".
- `scraping_browser_screenshot` describes the `full_page` option.

### Fixed
- sophie_assistant.js file was missing from the npm package.
- Passwords in URLs (`user:pass@`), such as the browser zone password,
  are redacted from every tool error and from the server's error logs,
  not only when the browser fails to connect.
- `search_dataset` accepts `is_null` and `is_not_null` filters without
  a `value`. They were listed as operators but rejected by the schema.
- The startup zone check times out (`BASE_TIMEOUT`, default 10s)
  instead of hanging the server when the API does not answer.

## [4.0.0] - 2026-10-18

### Added
- `ask_brightdata_assistant`: ask Sophie, Bright Data's support
  assistant, about products, zones, errors or setup. Pass the returned
  `dialog_id` to ask a follow-up. On by default and in every group, as
  on the hosted server.

### Changed
- Playwright is pinned to 1.64.1, the same version as the hosted server.

### Removed
- **BREAKING**: The `discover` tool and its Discover API integration.
  It was in every tool group and on by default, so it is no longer
  served in any config. Use `search_engine` or `search_engine_batch` to
  find sources and `scrape_as_markdown` or `scrape_batch` to read them.
- `POLLING_TIMEOUT`. The AI insights tools wait up to 600 seconds, as
  before. Configs that set it keep working; it is ignored.

## [3.1.0] - 2026-10-15

### Changed
- All tools are on by default, including the browser tools,
  `scrape_as_html`, `search_dataset` and `session_stats`. Set `GROUPS`
  or `TOOLS` to limit the server to those tools only.
- Results from search, scrape, scraper, dataset and browser tools are
  marked as untrusted web content, so the model treats text inside them
  as data, not instructions. Error bodies from scraped sites are marked
  too.
- The `web_scraping_strategy` and `diagnose_scraping_approach` prompts
  are reformatted, and no longer describe tools by cost.
- The Docker image runs on Node.js 24.

### Removed
- `PRO_MODE`. Existing configs that set it keep working; it is ignored.

## [3.0.0] - 2026-10-11

### Removed
- 46 `web_data_*` tools (Amazon, LinkedIn, Instagram, TikTok, YouTube,
  npm, PyPI and others). The scraper tools cover the same scrapers and
  1,200+ more: `search_scrapers` → `get_scraper_details` →
  `run_scraper`.
- `web_data_grok_ai_insights` and `web_data_reuter_news`. Their
  scrapers no longer exist, so these tools always failed.

### Changed
- `web_data_chatgpt_ai_insights` and `web_data_perplexity_ai_insights`
  are renamed to `chatgpt_ai_insights` and `perplexity_ai_insights`.
- Existing configs keep working. Old group IDs (`ecommerce`, `social`,
  `business`, `finance`, `research`, `app_stores`, `travel`, `code`)
  now enable the scraper tools, and old `web_data_*` names in `TOOLS`
  enable the scraper tools or the renamed AI tools.
- Scraper tool requests send the scraper's dataset ID and method in
  `x-mcp-dataset-id` and `x-mcp-method` headers, so failed runs can be
  traced to a scraper.
- If you installed the `bright-data-mcp`, `competitive-intel` or
  `price-comparison` skills, update them: older versions tell the agent
  to use the removed tools.

## [2.12.0] - 2026-10-08

### Added
- Web Scraper API tools: `search_scrapers`, `get_scraper_details`,
  `run_scraper`, `get_scraper_progress`, `get_scraper_results` and
  `refresh_scrapers`. They give access to all 1,200+ pre-built scrapers
  from a catalog that updates itself, with no hardcoded list. On by
  default, or select them with the new `scrapers` group.
- `run_scraper` waits up to 45 seconds. If the data is not ready by
  then, it returns a snapshot ID for `get_scraper_progress` and
  `get_scraper_results`.
- Content gate: when page content from `scrape_as_markdown`,
  `search_engine`, `extract` or their batch variants looks like
  instructions to change the MCP configuration, the server asks the
  user (via MCP elicitation) before returning it. Configure it with
  `CONTENT_GATE` and `CONTENT_GATE_TIMEOUT` (PR #190).

## [2.11.3] - 2026-09-15

### Security
- Credentials embedded in URLs (`scheme://user:pass@host`) are now
  redacted from error output.

## [2.11.2] - 2026-09-10

### Security
- Hardened `scrape_batch` error handling to always report failed requests
  as sanitized error strings instead of raw error objects.

### Changed
- Errors thrown from tools are now re-thrown as sanitized `Error`
  instances. Messages for HTTP and network failures are unchanged;
  non-`Error` throws are now reported as `Tool execution failed`.

### Fixed
- Fixed a broken string concatenation in the usage-limit error message
  that caused a `TypeError` instead of the intended error.

## [2.11.1] - 2026-07-27

### Fixed
- Fixed compatibility with updated Playwright API: replaced deprecated `page._snapshotForAI()` with `page.ariaSnapshot({ mode: 'ai' })`, restoring correct functionality of `scraping_browser_snapshot` and all ref-based browser automation tools

## [2.11.0] - 2026-07-26

### Added
- Added `reddit_comments` tool to collect Reddit post comments

## [2.10.0] - 2026-06-04

### Added
- `search_dataset` tool to search supported datasets by a filter and get matching records back directly via the fast search API (PR #142)
- `list_dataset_fields` tool to discover a dataset's filterable fields (name, type, description) before building a filter (PR #142)

## [2.6.0] - 2025-10-27

### Added
- Client name logging and header passthrough for improved observability (PR #75)
- ARIA ref-based browser automation for more reliable element interactions (PR #65)
- ARIA snapshot filtering for better element targeting
- Network request tracking in browser sessions
- MCP Registry support (PR #71)
- `scraping_browser_snapshot` tool to capture ARIA snapshots
- `scraping_browser_click_ref`, `scraping_browser_type_ref`, `scraping_browser_wait_for_ref` tools using ref-based selectors
- `scraping_browser_network_requests` tool to track HTTP requests

### Changed
- Enhanced search engine tool to return JSON with only relevant fields (PR #57)
- Added `fixed_values` parameter to reduce token usage (PR #60)
- Browser tools now use ARIA refs instead of CSS selectors for better reliability

### Fixed
- Stop polling on HTTP 400 errors in web data tools (PR #64)

### Deprecated
- Legacy selector-based tools (`scraping_browser_click`, `scraping_browser_type`, `scraping_browser_wait_for`) replaced by ref-based equivalents
- `scraping_browser_links` tool deprecated in favor of snapshot-based approach


## [2.0.0] - 2025-05-26

### Changed
- Updated browser authentication to use API_TOKEN instead of previous authentication method
- BROWSER_ZONE is now an optional parameter, the deafult zone is `mcp_browser`
- Removed duplicate web_data_ tools

## [1.9.2] - 2025-05-23

### Fixed
- Fixed GitHub references and repository settings

## [1.9.1] - 2025-05-21

### Fixed
- Fixed spelling errors and improved coding conventions
- Converted files back to Unix line endings for consistency

## [1.9.0] - 2025-05-21

### Added
- Added 23 new web data tools for enhanced data collection capabilities
- Added progress reporting functionality for better user feedback
- Added default parameter handling for improved tool usability

### Changed
- Improved coding conventions and file formatting
- Enhanced web data API endpoints integration

## [1.8.3] - 2025-05-21

### Added
- Added Bright Data MCP with Claude demo video to README.md

### Changed
- Updated documentation with video demonstrations

## [1.8.2] - 2025-05-13

### Changed
- Bumped FastMCP version for improved performance
- Updated README.md with additional documentation

## [1.8.1] - 2025-05-05

### Added
- Added 12 new WSAPI endpoints for enhanced functionality
- Changed to polling mechanism for better reliability

### Changed
- Applied dos2unix formatting for consistency
- Updated Docker configuration
- Updated smithery.yaml configuration

## [1.8.0] - 2025-05-03

### Added
- Added domain-based browser sessions to avoid navigation limit issues
- Added automatic creation of required unlocker zone when not present

### Fixed
- Fixed browser context maintenance across tool calls with current domain tracking
- Minor lint fixes

## [1.0.0] - 2025-04-29

### Added
- Initial release of Bright Data MCP server
- Browser automation capabilities with Bright Data integration
- Core web scraping and data collection tools
- Smithery.yaml configuration for deployment in Smithery.ai
- MIT License
- Demo materials and documentation

### Documentation
- Created comprehensive README.md
- Added demo.md with usage examples
- Created examples/README.md for sample implementations
- Added Tools.md documentation for available tools

---

## Release Notes

### Version 1.9.x Series
The 1.9.x series focuses on expanding web data collection capabilities and improving authentication mechanisms. Key highlights include the addition of 23 new web data tools.

### Version 1.8.x Series  
The 1.8.x series introduced significant improvements to browser session management, WSAPI endpoints, and overall system reliability. Notable features include domain-based sessions and automatic zone creation.

### Version 1.0.0
Initial stable release providing core MCP server functionality for Bright Data integration with comprehensive browser automation and web scraping capabilities.

