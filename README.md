<div align="center">
  <a href="https://brightdata.com/ai/mcp-server">
    <img src="https://github.com/user-attachments/assets/c21b3f7b-7ff1-40c3-b3d8-66706913d62f" alt="Bright Data Logo">
  </a>

<h1>Bright Data MCP</h1>

<p><strong>Web search, page scraping, structured data extraction, and browser automation for AI agents and LLMs over the Model Context Protocol.</strong></p>
<p>Works with AI agents, coding agents, chat assistants, and any MCP-compatible client.</p>

<p>
  <a href="https://www.npmjs.com/package/@brightdata/mcp"><img src="https://img.shields.io/npm/v/@brightdata/mcp?style=flat-square" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@brightdata/mcp"><img src="https://img.shields.io/npm/dw/@brightdata/mcp?style=flat-square" alt="npm downloads"></a>
  <a href="https://github.com/brightdata-com/brightdata-mcp/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License"></a>
</p>

<p>
  <a href="#quick-start">Quick Start</a> •
  <a href="#pricing-and-free-tier">Pricing</a> •
  <a href="#use-cases">Use Cases</a> •
  <a href="#tools-reference-32-tools">Tools</a> •
  <a href="#agent-skills">Agent Skills</a> •
  <a href="#documentation">Docs</a> •
  <a href="#support">Support</a>
</p>

<p><strong>Free tier: 5,000 requests per month.</strong> No credit card required. Renews monthly.</p>

</div>

---

## Overview

The Bright Data MCP server gives AI agents real-time access to public web data. It exposes **32 tools** covering:

- **Web search** — Google, Bing, and Yandex results as structured data
- **Page scraping** — any URL as Markdown or HTML, with bot detection, CAPTCHA solving, and proxy rotation handled automatically on every request
- **Structured data (Web Scraper API)** — clean JSON from 1,200+ pre-built scrapers: Amazon, LinkedIn, Instagram, TikTok, YouTube, X, Reddit, Facebook, Crunchbase, Zillow, npm, PyPI and more, without parsing HTML. Six tools find and run any of them
- **Browser automation** — navigate, click, type, screenshot, and read pages in a remote browser session
- **LLM response collection** — send prompts to ChatGPT and Perplexity and get their answers back as structured data

Every request is routed through Bright Data's unblocking infrastructure, so pages that block ordinary HTTP clients (bot detection, CAPTCHAs, rate limits, geo-restrictions) return normally. No proxy setup, no headless browser maintenance, no retry logic to write.

Two deployment options: a hosted remote server (one URL, no installation) or a local instance via `npx @brightdata/mcp`.

---

## Quick Start

**Hosted server — no installation.** Add this URL to your MCP client:

```
https://mcp.brightdata.com/mcp?token=YOUR_API_TOKEN_HERE
```

Get your API token from your [Bright Data account settings](https://brightdata.com/cp/setting/users). New accounts get 5,000 free requests per month.

Optional URL parameters:

| Parameter | Description | Example |
|-----------|-------------|---------|
| `groups=<ids>` | Limit to specific tool groups (default: all tools) | `...&groups=scrapers,browser` |
| `tools=<names>` | Limit to specific tools | `...&tools=search_engine,scrape_as_markdown` |

<details>
<summary><b>Claude Desktop</b></summary>

1. Go to: Settings → Connectors → Add custom connector
2. Name: `Bright Data`
3. URL: `https://mcp.brightdata.com/mcp?token=YOUR_API_TOKEN`
4. Click "Add"

Or run locally:

```json
{
  "mcpServers": {
    "Bright Data": {
      "command": "npx",
      "args": ["@brightdata/mcp"],
      "env": {
        "API_TOKEN": "<your-api-token-here>"
      }
    }
  }
}
```

</details>

<details>
<summary><b>Claude Code</b></summary>

```bash
claude mcp add --transport http brightdata "https://mcp.brightdata.com/mcp?token=YOUR_API_TOKEN"
```

</details>

<details>
<summary><b>Cursor</b></summary>

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "brightdata": {
      "url": "https://mcp.brightdata.com/mcp?token=YOUR_API_TOKEN"
    }
  }
}
```

</details>

<details>
<summary><b>VS Code</b></summary>

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "brightdata": {
      "type": "http",
      "url": "https://mcp.brightdata.com/mcp?token=YOUR_API_TOKEN"
    }
  }
}
```

</details>

<details>
<summary><b>Windsurf</b></summary>

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "brightdata": {
      "serverUrl": "https://mcp.brightdata.com/mcp?token=YOUR_API_TOKEN"
    }
  }
}
```

</details>

<details>
<summary><b>Gemini CLI</b></summary>

Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "brightdata": {
      "httpUrl": "https://mcp.brightdata.com/mcp?token=YOUR_API_TOKEN"
    }
  }
}
```

</details>

<details>
<summary><b>Zed</b></summary>

Add to your Zed settings:

```json
{
  "context_servers": {
    "brightdata": {
      "url": "https://mcp.brightdata.com/mcp?token=YOUR_API_TOKEN"
    }
  }
}
```

</details>

<details>
<summary><b>Warp</b></summary>

Go to Settings > MCP Servers > Add MCP Server and add:

```json
{
  "brightdata": {
    "url": "https://mcp.brightdata.com/mcp?token=YOUR_API_TOKEN"
  }
}
```

</details>

<details>
<summary><b>Other clients (local npx)</b></summary>

For any client that supports local MCP servers:

```json
{
  "mcpServers": {
    "Bright Data": {
      "command": "npx",
      "args": ["@brightdata/mcp"],
      "env": {
        "API_TOKEN": "<your-api-token-here>"
      }
    }
  }
}
```

</details>

---

## Pricing and Free Tier

Every account includes a recurring monthly free tier. **No credit card or commitment required to start.**

**5,000 free requests per month**, renewing on the 1st of each month. Unused requests don't roll over. For team accounts, the free tier is shared across all users in the account.

What's included free:

- Fetch any webpage and extract as Markdown
- Access to 60+ pre-built scrapers for popular domains
- Web search (Google, Bing, Yandex)
- Web unlocking (bot detection bypass, CAPTCHA solving, proxy rotation)
- Browser automation
- Geo-targeting

Beyond the free tier — pay as you go, no commitment:

| | Search, Scrape & Extract | Browser Navigation |
|---|---|---|
| **Pay as you go** | $1.50 / 1K results | $8 / GB |

- When free requests run out, requests stop. No surprise charges — unless you have deposited funds
- Adding a credit card is a verification step only; you are not charged unless your free tier is exhausted **and** you have funds deposited
- Set a spend cap in the [control panel](https://brightdata.com/cp) so pay-as-you-go usage never exceeds your budget

[Full pricing, volume plans and enterprise →](https://brightdata.com/pricing/mcp-server)

---

## Use Cases

### Real-time research

Answer questions using live web data instead of training data. Search, then read the sources.

| Task | Tools |
|------|-------|
| Search the web for current information | `search_engine`, `search_engine_batch` |
| Read a specific page as clean Markdown | `scrape_as_markdown`, `scrape_batch` |

Example prompts: "What's Tesla's current stock price?", "Get today's weather forecast for New York", "Find the most cited sources on EU AI regulation from the last 6 months".

### E-commerce intelligence

Read product data as structured JSON: price, availability, rating, review count, seller, images.

| Task | Tools |
|------|-------|
| Products, reviews and search results from Amazon, Walmart, eBay, Best Buy, Etsy, Home Depot, Zara and other stores | `search_scrapers` → `get_scraper_details` → `run_scraper` |
| Cross-retailer price view | the same flow with the Google Shopping scraper |

Example prompts: "Compare this laptop's price on Amazon vs Walmart vs Best Buy", "Get the rating and review count for ASIN B0D2Q9397Y", "Is this product in stock?".

### Market and competitor analysis

Build competitor profiles from live data: funding, headcount, hiring, customer reviews, pricing pages.

| Task | Tools |
|------|-------|
| Company funding, size, employees, job postings (Crunchbase, ZoomInfo, LinkedIn) | `search_scrapers` → `run_scraper` |
| Customer sentiment (Google Maps, Facebook, app store reviews) | `search_scrapers` → `run_scraper` |
| Competitor pricing pages | `scrape_as_markdown`, `scrape_batch` |
| Market discovery | `search_engine_batch` |

Example prompt: "Analyze Notion as a competitor: pricing, funding, hiring focus, and what customers complain about".

### AI agents with reliable web access

Replace built-in fetch/search tools that get blocked on protected sites. Every request goes through unblocking infrastructure, so agents don't fail on bot detection, CAPTCHAs, or geo-restrictions.

| Task | Tools |
|------|-------|
| Drop-in replacement for built-in web search | `search_engine` |
| Drop-in replacement for built-in URL fetch | `scrape_as_markdown` |
| Parallel data collection (10 at a time) | `search_engine_batch`, `scrape_batch` |
| Interactive sites (login walls, infinite scroll, dynamic content) | `scraping_browser_*` (14 tools) |
| Structured JSON from any page, no schema needed | `extract` |

### Coding agents

Package registry data on demand — no scraping, no stale caches.

| Task | Tools |
|------|-------|
| npm and PyPI package version, README, metadata | `run_scraper` with the npmjs or pypi scraper (find them with `search_scrapers`) |
| Read files from GitHub repositories | `run_scraper` with the GitHub repository scraper |

Example prompts: "What's the latest version of express on npm?", "Get the README for the langchain-brightdata PyPI package".

### GEO and brand visibility

Send prompts to major LLMs and get their answers back as structured data. Measure how AI assistants describe your brand, which sources they cite, and what they recommend — the feedback loop for Generative Engine Optimization.

| Task | Tools |
|------|-------|
| ChatGPT answers with citations and recommendations | `chatgpt_ai_insights` |
| Perplexity answers with sources | `perplexity_ai_insights` |

Example prompt: "Ask ChatGPT and Perplexity 'what is the best proxy provider' and compare how each one ranks us".

### Social media monitoring

Structured data from every major platform: profiles, posts, comments, engagement metrics. Each platform has scrapers per data type (LinkedIn profiles, Instagram reels, TikTok comments, ...); find them with `search_scrapers` and run them with `run_scraper`.

| Platform | Examples of scrapers |
|----------|----------------------|
| LinkedIn | person profiles, company profiles, job listings, posts, people search |
| Instagram | profiles, posts, reels, comments |
| TikTok | profiles, posts, shop, comments |
| Facebook | profiles, posts, marketplace listings, company reviews, events |
| YouTube | videos, channels, comments |
| X (Twitter) | posts, posts by profile |
| Reddit | posts, comments |

Example prompt: "Get the last 10 posts from this TikTok profile and summarize the engagement".

### Content creation and academic research

Gather source material from many pages at once, filtered by recency and relevance.

| Task | Tools |
|------|-------|
| Collect multiple sources in one call | `scrape_batch` (up to 10 URLs) |
| News and finance data | `search_engine` with news queries, `run_scraper` with the Yahoo Finance scraper |

---

## How It Compares

| Capability | Bright Data MCP | Typical web MCP servers |
|------------|-----------------|------------------------|
| Total tools | 32 | 2–10 |
| Platform-specific structured JSON extractors | 1,200+ pre-built scrapers across e-commerce, social, business, finance, travel, app stores, through 6 tools | Rare; generic scraping only |
| Unblocking (bot detection bypass, CAPTCHA solving, proxy rotation) | Built into every request | Usually none; blocked on protected sites |
| Search engines | Google, Bing, Yandex | Usually one |
| Browser automation | 14 tools, remote browser, no local setup | Limited or none |
| LLM response collection (ChatGPT, Perplexity) | Yes | Not offered |
| Package registry data (npm, PyPI) | Yes | Not offered |
| Batch operations | 10 searches or 10 scrapes per call | Usually single-request only |
| Geo-targeting | Yes | Limited or none |
| Free tier | 5,000 requests/month, browser automation included, no credit card | Varies; often rate-limited keyless access |

---

## Tool Selection: Groups

Tools are organized into groups so you only load what you need. Fewer tools means less context for your agent to process.

- With no `GROUPS` or `TOOLS`, all 32 tools are enabled. Setting either one limits the server to those tools only
- `GROUPS` enables tool bundles. Comma-separated: `GROUPS="scrapers,browser"` (local) or `&groups=scrapers,browser` (hosted URL)
- `TOOLS` adds individual tools on top: `TOOLS="extract,scrape_as_html"`. On its own, it enables only the tools you list
- Every group also includes `search_engine`, `scrape_as_markdown` and `ask_brightdata_assistant`
- Group ID `custom` is reserved; use `TOOLS` for individual picks

| Group ID | Contents | Tool count |
|----------|----------|-----------|
| `scrapers` | Search and run any pre-built Web Scraper API scraper (Amazon, LinkedIn, TikTok, npm, ...) | 6 |
| `browser` | Remote browser automation | 14 |
| `geo` | ChatGPT and Perplexity response collection | 2 |
| `advanced_scraping` | Batch tools, HTML scraping, AI extraction, session stats | 5 |

Older group IDs (`ecommerce`, `social`, `business`, `finance`, `research`, `app_stores`, `travel`, `code`) still work and enable the `scrapers` tools; `social` and `business` also add `search_dataset` and `list_dataset_fields`. Old `web_data_*` names in `TOOLS` enable the `scrapers` tools too.

### Configuration examples

Local server with browser automation and AI extraction:

```json
{
  "mcpServers": {
    "Bright Data": {
      "command": "npx",
      "args": ["@brightdata/mcp"],
      "env": {
        "API_TOKEN": "<your-api-token-here>",
        "GROUPS": "browser,advanced_scraping",
        "TOOLS": "extract"
      }
    }
  }
}
```

Coding agent setup (Claude Code / Cursor / Windsurf) — npm, PyPI and GitHub data through the pre-built scrapers:

```json
{
  "mcpServers": {
    "Bright Data": {
      "command": "npx",
      "args": ["@brightdata/mcp"],
      "env": {
        "API_TOKEN": "<your-api-token-here>",
        "GROUPS": "scrapers"
      }
    }
  }
}
```

For [Autohand Code](https://github.com/autohandai/code-cli/) on macOS, Linux, WSL, or Git Bash, add the same `code` tool group with:

```bash
autohand mcp add bright-data env API_TOKEN=your-token-here GROUPS=code npx @brightdata/mcp
```

Add `--scope project` before `bright-data` to save the server in the current project's `.autohand` configuration instead of your user configuration.

---

## Tools Reference (32 Tools)

### Which tool to use

- **Known URL, need the content:** `scrape_as_markdown`. Multiple URLs (up to 10): `scrape_batch`
- **Need to find information:** `search_engine`. Multiple queries (up to 10): `search_engine_batch`
- **Structured data from a known platform (Amazon, LinkedIn, TikTok, npm, PyPI, etc.):** `search_scrapers` → `get_scraper_details` → `run_scraper` — returns clean JSON, faster and more reliable than scraping the same page
- **Structured JSON from a page no scraper covers:** `extract`
- **Raw HTML:** `scrape_as_html`
- **Page requires interaction (click, type, scroll, login):** `scraping_browser_*` tools
- **How ChatGPT/Perplexity answer a prompt:** `chatgpt_ai_insights` / `perplexity_ai_insights`
- **Question about Bright Data itself (products, zones, errors, setup):** `ask_brightdata_assistant`

Notes on scraper runs:

- Return structured JSON, billed per record returned
- Records with an `error` field explain inputs that failed, e.g. a URL of the wrong type
- Results can be large. Keep `limit_per_input` low for `discover_by_*` methods and run bulk collection in a subagent where your framework supports it, so records don't flood the main context window
- If a run fails, `scrape_as_markdown` works on the same URL as a fallback

<details>
<summary><b>Search and Scraping — 7 tools</b></summary>

| Tool | Description | Group |
|------|-------------|-------|
| `search_engine` | Search Google, Bing, or Yandex. Google returns JSON (URL, title, description); Bing and Yandex return Markdown. Paginate with the `cursor` parameter | default / every group |
| `search_engine_batch` | Up to 10 search queries in one call | default / `advanced_scraping` |
| `scrape_as_markdown` | Any URL as Markdown. Bot protection and CAPTCHA handled automatically | default / every group |
| `scrape_batch` | Up to 10 URLs in one call; returns an array of URL/content pairs in Markdown | default / `advanced_scraping` |
| `scrape_as_html` | Any URL as raw HTML | default / `advanced_scraping` |
| `extract` | Scrape a page and convert it to structured JSON using AI, with an optional custom extraction prompt | default / `advanced_scraping` |
| `session_stats` | Tool usage counts for the current session | default / `advanced_scraping` |

</details>

<details>
<summary><b>Web Scraper API — 6 tools</b></summary>

Search and run any of Bright Data's 1,200+ pre-built scrapers. The scraper list is loaded from `docs.brightdata.com/scrapers.json` and refreshed daily. Available on both the hosted and the local server. Enabled by default when no tools or groups are selected; otherwise add the `scrapers` group (`&groups=scrapers` on the hosted URL, `GROUPS=scrapers` locally).

Typical flow: `search_scrapers` → `get_scraper_details` → `run_scraper`. Runs are billed per record; `discover_by_*` methods collect up to `limit_per_input` records per input (default 10).

| Tool | Description | Group |
|------|-------------|-------|
| `search_scrapers` | Find scrapers by site or data type (e.g. "amazon reviews", "linkedin.com"). Returns dataset ID, name, domain and collection methods | default / `scrapers` |
| `get_scraper_details` | Description, input fields, example input and main output fields for one scraper method | default / `scrapers` |
| `run_scraper` | Run a scraper method. Waits up to 45 seconds; if still running, returns a `snapshot_id` to check later | default / `scrapers` |
| `get_scraper_progress` | Status of a run: starting, running, ready, failed or canceled | default / `scrapers` |
| `get_scraper_results` | Records of a finished run | default / `scrapers` |
| `refresh_scrapers` | Reload the scraper list now instead of waiting for the daily refresh | default / `scrapers` |

</details>

<details>
<summary><b>Browser Automation — 14 tools</b></summary>

Remote browser session. Typical sequence: navigate → snapshot → interact by ref → extract or screenshot.

| Tool | Description |
|------|-------------|
| `scraping_browser_navigate` | Open or reuse a browser session and navigate to a URL |
| `scraping_browser_go_back` | Navigate back |
| `scraping_browser_go_forward` | Navigate forward |
| `scraping_browser_snapshot` | ARIA snapshot of the page listing interactive elements with refs. Required before ref-based actions |
| `scraping_browser_click_ref` | Click an element by ref from the latest snapshot |
| `scraping_browser_type_ref` | Type into an element by ref; optionally press Enter to submit |
| `scraping_browser_fill_form` | Fill several form fields by ref in one call |
| `scraping_browser_screenshot` | Screenshot of the current page; optional `full_page` |
| `scraping_browser_get_text` | Text content of the page body |
| `scraping_browser_get_html` | HTML of the current page |
| `scraping_browser_scroll` | Scroll to the bottom of the page |
| `scraping_browser_scroll_to_ref` | Scroll an element into view |
| `scraping_browser_wait_for_ref` | Wait for an element to become visible, with optional timeout |
| `scraping_browser_network_requests` | Network requests since page load: method, URL, status |

Refs come from the latest snapshot. If the page changes after a click or navigation, take a new snapshot before the next ref-based action. For static pages, `scrape_as_markdown` is faster and cheaper than a browser session.

</details>

<details>
<summary><b>GEO and LLM Visibility — 2 tools</b></summary>

| Tool | Input | Returns |
|------|-------|---------|
| `chatgpt_ai_insights` | Prompt | ChatGPT's answer as Markdown |
| `perplexity_ai_insights` | Prompt | Perplexity's answer as Markdown |

Use for Generative Engine Optimization (tracking how LLMs describe your brand) and LLM-as-a-judge workflows.

</details>

<details>
<summary><b>Dataset Search — 2 tools</b></summary>

Filter search over stored LinkedIn datasets; returns matching records at once, with no scraper run.

| Tool | Description | Group |
|------|-------------|-------|
| `list_dataset_fields` | Filterable fields of a dataset (name, type, description). Call before `search_dataset` | default / `social`, `business` |
| `search_dataset` | Records matching a filter, up to 10 per call, with a cursor for more | default / `social`, `business` |

</details>

<details>
<summary><b>Bright Data Assistant — 1 tool</b></summary>

| Tool | Description | Group |
|------|-------------|-------|
| `ask_brightdata_assistant` | Ask Sophie, Bright Data's support assistant, about products, APIs, zones, errors or account setup. Pass the returned `dialog_id` to ask a follow-up in the same thread | default / every group |

</details>

[Full tool reference in the docs →](https://docs.brightdata.com/ai/mcp-server/tools)

---

## Agent Skills

Ready-to-use skills that teach your agent how to use this MCP server correctly. The full collection lives at [github.com/brightdata/skills](https://github.com/brightdata/skills) — 21 skills covering MCP orchestration, competitive intelligence, price comparison, brand listening, SEO audits, scraper building, RAG pipelines, and more.

Three of the highest-impact skills:

| Skill | What it does |
|-------|--------------|
| [bright-data-mcp](https://github.com/brightdata/skills/tree/main/skills/bright-data-mcp) | Makes Bright Data MCP the default for all web data operations, replacing WebFetch, WebSearch, and other built-in web tools that fail on bot detection |
| [competitive-intel](https://github.com/brightdata/skills/tree/main/skills/competitive-intel) | Competitor snapshots, pricing comparison, review mining, hiring signals, content/SEO analysis, and market landscape maps from live web data |
| [price-comparison](https://github.com/brightdata/skills/tree/main/skills/price-comparison) | Resolves a product across Amazon, Walmart, eBay, Best Buy, and Google Shopping and names the cheapest in-stock option |

[Browse all 21 skills →](https://github.com/brightdata/skills)

---

## Configuration

### Basic setup (local)

```json
{
  "mcpServers": {
    "Bright Data": {
      "command": "npx",
      "args": ["@brightdata/mcp"],
      "env": {
        "API_TOKEN": "your-token-here"
      }
    }
  }
}
```

### Advanced configuration

```json
{
  "mcpServers": {
    "Bright Data": {
      "command": "npx",
      "args": ["@brightdata/mcp"],
      "env": {
        "API_TOKEN": "your-token-here",
        "RATE_LIMIT": "100/1h",
        "WEB_UNLOCKER_ZONE": "custom",
        "BROWSER_ZONE": "custom_browser"
      }
    }
  }
}
```

### Environment variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `API_TOKEN` | Your Bright Data API token (required) | - | `your-token-here` |
| `RATE_LIMIT` | Custom rate limiting | unlimited | `100/1h`, `50/30m` |
| `WEB_UNLOCKER_ZONE` | Custom Web Unlocker zone name | `mcp_unlocker` | `my_custom_zone` |
| `BROWSER_ZONE` | Custom Browser zone name | `mcp_browser` | `my_browser_zone` |
| `CONTENT_GATE` | When page content returned by a data tool looks like instructions to change the MCP configuration, the server asks the user (via MCP elicitation) before returning it. Set to `off` to disable | `on` | `off` |
| `CONTENT_GATE_TIMEOUT` | Seconds to wait for the user's answer before withholding the content | `120` | `60`, `300` |
| `BROWSER_FILTERED_SNAPSHOT` | `scraping_browser_snapshot` always lists only buttons, links and fields. Saves tokens, and stops page text posing as a clickable element (for sensitive tasks). If necessary, Page text can then be read with `scraping_browser_get_text` | `off` | `on` |
| `BASE_TIMEOUT` | Request timeout for base tools in seconds (search and scrape) | No limit | `60`, `120` |
| `BASE_MAX_RETRIES` | Max retries for base tools on transient errors (0-3) | `0` | `1`, `3` |
| `GROUPS` | Comma-separated tool group IDs. Limits the server to these groups | All tools | `scrapers,browser` |
| `TOOLS` | Comma-separated individual tool names. Limits the server to these tools | All tools | `extract,scrape_as_html` |

### Content gate

`scrape_as_markdown`, `search_engine`, `extract` and their batch variants return whatever a web
page says. If that content contains text that reads like instructions to change your MCP
configuration — register a server, run an `npx -y` package, edit the MCP config file — the server
pauses and asks you, through your MCP client, before returning it. Approve and the content is
returned unchanged; decline and it is withheld with a short explanation to the assistant. Pages that
do not contain such text are returned exactly as before, with no prompt. For a batch call, only the
matching items are withheld.

Pages that are *about* MCP configuration (documentation, READMEs) will naturally prompt. Clients that
do not support MCP elicitation get the matching content withheld; set `CONTENT_GATE=off` if you
accept the risk. While the server waits for your answer it reports progress; clients that do not
extend their tool timeout on progress will cap the wait at their own limit — `CONTENT_GATE_TIMEOUT`
is the knob on the server side. Browser tools are not covered.

---

## Documentation

| Resource | Link |
|----------|------|
| API documentation | [docs.brightdata.com/ai/mcp-server/overview](https://docs.brightdata.com/ai/mcp-server/overview) |
| Full tools reference | [docs.brightdata.com/ai/mcp-server/tools](https://docs.brightdata.com/ai/mcp-server/tools) |
| Agent skills | [github.com/brightdata/skills](https://github.com/brightdata/skills) |
| Usage examples | [examples](https://github.com/brightdata-com/brightdata-mcp/blob/main/examples) |
| Changelog | [CHANGELOG.md](https://github.com/brightdata-com/brightdata-mcp/blob/main/CHANGELOG.md) |

---

## Troubleshooting

<details>
<summary><b>Common issues and solutions</b></summary>

### "spawn npx ENOENT" error

Install Node.js, or use the full path to node:

```json
"command": "/usr/local/bin/node"  // macOS/Linux
"command": "C:\\Program Files\\nodejs\\node.exe"  // Windows
```

### Timeouts on complex sites

Increase the timeout in your client settings to 180s.

### Authentication issues

Verify your API token is valid and has the required permissions. Tokens are managed in [account settings](https://brightdata.com/cp/setting/users).

### run_scraper returns errors or no data

Records with an `error` field explain inputs that failed. Compare your input with `sample_input` from `get_scraper_details` (e.g., Amazon product URLs contain `/dp/`, Walmart ones `/ip/`) and check the page is publicly accessible. `scrape_as_markdown` works on the same URL as a fallback.

### Remote server connection fails

Check your internet connection and firewall settings.

</details>

---

## Contributing

- [Report bugs](https://github.com/brightdata-com/brightdata-mcp/issues)
- [Suggest features](https://github.com/brightdata-com/brightdata-mcp/issues)
- [Submit PRs](https://github.com/brightdata-com/brightdata-mcp/pulls)

Please follow [Bright Data's coding standards](https://brightdata.com/dna/js_code).

---

## Support

| Channel | Link |
|---------|------|
| GitHub issues | [github.com/brightdata-com/brightdata-mcp/issues](https://github.com/brightdata-com/brightdata-mcp/issues) |
| Documentation | [docs.brightdata.com/ai/mcp-server/overview](https://docs.brightdata.com/ai/mcp-server/overview) |
| Email | [support@brightdata.com](mailto:support@brightdata.com) |

---

## License

MIT © [Bright Data Ltd.](https://brightdata.com)
