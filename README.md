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
  <a href="#tools-reference-69-tools">Tools</a> •
  <a href="#documentation">Docs</a> •
  <a href="#support">Support</a>
</p>

<p><strong>Free tier: 5,000 requests per month.</strong> No credit card required. Renews monthly.</p>

</div>

---

## Overview

The Bright Data MCP server gives AI agents real-time access to public web data. It exposes **75 tools** covering:

- **Web search** — Google, Bing, and Yandex results as structured data
- **Page scraping** — any URL as Markdown or HTML, with proxy rotation, geo-routing, and retries handled automatically on every request
- **Structured data extraction** — clean JSON from Amazon, LinkedIn, Instagram, TikTok, YouTube, X, Reddit, Facebook, Crunchbase, Zillow, and other major platforms, without parsing HTML
- **Browser automation** — navigate, click, type, screenshot, and read pages in a remote browser session
- **LLM response collection** — send prompts to ChatGPT, Grok, and Perplexity and get their answers back as structured data
- **Package registry data** — npm and PyPI package versions, READMEs, dependencies, and metadata
- **Web Scraper API** — search and run any of 1,200+ pre-built scrapers (reviews, profiles, products, jobs, listings) from one set of tools

Every request is routed through Bright Data's unblocking infrastructure, so pages that ordinary HTTP clients cannot read return normally. No proxy setup, no headless browser maintenance, no retry logic to write.

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
| `groups=<ids>` | Enable specific tool groups | `...&groups=social,ecommerce` |
| `tools=<names>` | Enable specific tools only | `...&tools=search_engine,scrape_as_markdown` |

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
- Web unlocking (proxy rotation, geo-routing, retries)
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
| Find the most relevant sources for a research question, ranked by AI relevance score | `discover` |

Example prompts: "What's Tesla's current stock price?", "Get today's weather forecast for New York", "Find the most cited sources on EU AI regulation from the last 6 months".

### E-commerce intelligence

Read product data as structured JSON: price, availability, rating, review count, seller, images.

| Task | Tools |
|------|-------|
| Amazon product details, reviews, search results | `web_data_amazon_product`, `web_data_amazon_product_reviews`, `web_data_amazon_product_search` |
| Walmart, eBay, Best Buy, Etsy, Home Depot, Zara products | `web_data_walmart_product`, `web_data_ebay_product`, `web_data_bestbuy_products`, `web_data_etsy_products`, `web_data_homedepot_products`, `web_data_zara_products` |
| Cross-retailer price view | `web_data_google_shopping` |
| Seller profiles | `web_data_walmart_seller` |

Example prompts: "Compare this laptop's price on Amazon vs Walmart vs Best Buy", "Get the rating and review count for ASIN B0D2Q9397Y", "Is this product in stock?".

### Market and competitor analysis

Build competitor profiles from live data: funding, headcount, hiring, customer reviews, pricing pages.

| Task | Tools |
|------|-------|
| Company funding, investors, size | `web_data_crunchbase_company`, `web_data_zoominfo_company_profile` |
| Company pages, employees, job postings | `web_data_linkedin_company_profile`, `web_data_linkedin_job_listings` |
| Customer sentiment | `web_data_google_maps_reviews`, `web_data_facebook_company_reviews`, app store review tools |
| Competitor pricing pages | `scrape_as_markdown`, `scrape_batch` |
| Market discovery | `search_engine_batch`, `discover` |

Example prompt: "Analyze Notion as a competitor: pricing, funding, hiring focus, and what customers complain about".

### AI agents with reliable web access

Replace built-in fetch/search tools that cannot read many sites. Every request goes through unblocking infrastructure with proxy rotation, geo-routing, and retries.

| Task | Tools |
|------|-------|
| Drop-in replacement for built-in web search | `search_engine` |
| Drop-in replacement for built-in URL fetch | `scrape_as_markdown` |
| Parallel data collection (10 at a time) | `search_engine_batch`, `scrape_batch` |
| Interactive sites (login walls, infinite scroll, dynamic content) | `scraping_browser_*` (13 tools) |
| Structured JSON from any page, no schema needed | `extract` |

### Coding agents

Package registry data on demand — no scraping, no stale caches.

| Task | Tools |
|------|-------|
| npm package version, README, dependencies, metadata | `web_data_npm_package` |
| PyPI package version, README, dependencies, metadata | `web_data_pypi_package` |
| Read files from GitHub repositories | `web_data_github_repository_file` |

Example prompts: "What's the latest version of express on npm?", "Get the README for the langchain-brightdata PyPI package".

### GEO and brand visibility

Send prompts to major LLMs and get their answers back as structured data. Measure how AI assistants describe your brand, which sources they cite, and what they recommend — the feedback loop for Generative Engine Optimization.

| Task | Tools |
|------|-------|
| ChatGPT answers with citations and recommendations | `web_data_chatgpt_ai_insights` |
| Grok answers | `web_data_grok_ai_insights` |
| Perplexity answers with sources | `web_data_perplexity_ai_insights` |

Example prompt: "Ask ChatGPT, Grok, and Perplexity 'what is the best proxy provider' and compare how each one ranks us".

### Social media monitoring

Structured data from seven platforms: profiles, posts, comments, engagement metrics.

| Platform | Tools |
|----------|-------|
| LinkedIn | person profiles, company profiles, job listings, posts, people search (5 tools) |
| Instagram | profiles, posts, reels, comments (4 tools) |
| TikTok | profiles, posts, shop, comments (4 tools) |
| Facebook | posts, marketplace listings, company reviews, events (4 tools) |
| YouTube | videos, channel profiles, comments (3 tools) |
| X (Twitter) | posts, profile posts (2 tools) |
| Reddit | posts (1 tool) |

Example prompt: "Get the last 10 posts from this TikTok profile and summarize the engagement".

### Content creation and academic research

Gather source material from many pages at once, filtered by recency and relevance.

| Task | Tools |
|------|-------|
| Collect multiple sources in one call | `scrape_batch` (up to 10 URLs) |
| Find sources by topic with date filtering | `discover` with `start_date` / `end_date` |
| News and finance data | `web_data_yahoo_finance_business`, `search_engine` with news queries |

---

## How It Compares

| Capability | Bright Data MCP | Typical web MCP servers |
|------------|-----------------|------------------------|
| Total tools | 75 | 2–10 |
| Platform-specific structured JSON extractors | 45 tools across e-commerce, social, business, finance, travel, app stores | Rare; generic scraping only |
| Unblocking (proxy rotation, geo-routing, retries) | Built into every request | Usually none |
| Search engines | Google, Bing, Yandex | Usually one |
| AI-relevance-ranked search with intent | Yes (`discover`) | Not offered |
| Browser automation | 13 tools, remote browser, no local setup | Limited or none |
| LLM response collection (ChatGPT, Grok, Perplexity) | Yes | Not offered |
| Package registry data (npm, PyPI) | Yes | Not offered |
| Batch operations | 10 searches or 10 scrapes per call | Usually single-request only |
| Geo-targeting | Yes | Limited or none |
| Free tier | 5,000 requests/month, browser automation included, no credit card | Varies; often rate-limited keyless access |

---

## Tool Selection: Groups

Tools are organized into groups so you only load what you need. Fewer tools means less context for your agent to process.

- `GROUPS` enables tool bundles. Comma-separated: `GROUPS="ecommerce,browser"` (local) or `&groups=ecommerce,browser` (hosted URL)
- `TOOLS` adds individual tools on top: `TOOLS="extract,scrape_as_html"`
- Base tools are always enabled: `search_engine`, `search_engine_batch`, `scrape_as_markdown`, `scrape_batch`, `discover`
- Group ID `custom` is reserved; use `TOOLS` for individual picks

| Group ID | Contents | Tool count |
|----------|----------|-----------|
| `ecommerce` | Amazon, Walmart, eBay, Best Buy, Etsy, Home Depot, Zara, Google Shopping | 11 |
| `social` | LinkedIn, Instagram, Facebook, TikTok, YouTube, X, Reddit | 23 |
| `browser` | Remote browser automation | 13 |
| `business` | Crunchbase, ZoomInfo, Google Maps reviews, Zillow | 4 |
| `finance` | Yahoo Finance | 1 |
| `research` | GitHub repository files | 1 |
| `app_stores` | Google Play, Apple App Store | 2 |
| `travel` | Booking.com | 1 |
| `geo` | ChatGPT, Grok, Perplexity response collection | 3 |
| `code` | npm, PyPI package data | 2 |
| `advanced_scraping` | Batch tools, HTML scraping, AI extraction, session stats | 5 |
| `scrapers` | Search and run any pre-built Web Scraper API scraper | 6 |

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

Coding agent setup (Claude Code / Cursor / Windsurf) — npm and PyPI package data:

```json
{
  "mcpServers": {
    "Bright Data": {
      "command": "npx",
      "args": ["@brightdata/mcp"],
      "env": {
        "API_TOKEN": "<your-api-token-here>",
        "GROUPS": "code"
      }
    }
  }
}
```

---

## Tools Reference (75 Tools)

### Which tool to use

- **Known URL, need the content:** `scrape_as_markdown`. Multiple URLs (up to 10): `scrape_batch`
- **Need to find information:** `search_engine`. Multiple queries (up to 10): `search_engine_batch`
- **Deep research or RAG, need relevance-ranked sources:** `discover` with an `intent`
- **Page is on a supported platform (Amazon, LinkedIn, TikTok, etc.):** use the matching `web_data_*` tool — returns clean JSON, faster and more reliable than scraping the same page
- **Structured data from a site with no `web_data_*` tool:** `search_scrapers` → `get_scraper_details` → `run_scraper`
- **Structured JSON from an unsupported page:** `extract`
- **Raw HTML:** `scrape_as_html`
- **Page requires interaction (click, type, scroll, login):** `scraping_browser_*` tools
- **npm/PyPI package info:** `web_data_npm_package` / `web_data_pypi_package` — never scrape package registries
- **How ChatGPT/Grok/Perplexity answer a prompt:** `web_data_chatgpt_ai_insights` / `web_data_grok_ai_insights` / `web_data_perplexity_ai_insights`

Notes that apply to all `web_data_*` tools:

- Return structured JSON, billed per record returned
- Each tool validates its URL pattern; a wrong URL type fails (exact requirements in the tables below)
- Results can be large. Use built-in limits where available (`num_of_comments`, `days_limit`) and run bulk collection in a subagent where your framework supports it, so records don't flood the main context window
- If a `web_data_*` call fails, `scrape_as_markdown` works on the same URL as a fallback

<details>
<summary><b>Search and Scraping — 8 tools</b></summary>

| Tool | Description | Group |
|------|-------------|-------|
| `search_engine` | Search Google, Bing, or Yandex. Google returns JSON (URL, title, description); Bing and Yandex return Markdown. Paginate with the `cursor` parameter | always enabled |
| `search_engine_batch` | Up to 10 search queries in one call | always enabled |
| `scrape_as_markdown` | Any URL as Markdown | always enabled |
| `scrape_batch` | Up to 10 URLs in one call; returns an array of URL/content pairs in Markdown | always enabled |
| `discover` | AI-relevance-ranked web search. Returns scored results (title, description, URL, relevance score). Supports intent-based ranking, geo-targeting, date filtering, keyword filtering | always enabled |
| `scrape_as_html` | Any URL as raw HTML | `advanced_scraping` |
| `extract` | Scrape a page and convert it to structured JSON using AI, with an optional custom extraction prompt | `advanced_scraping` |
| `session_stats` | Tool usage counts for the current session | `advanced_scraping` |

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
<summary><b>E-commerce — 11 tools</b></summary>

| Tool | Input requirement | Returns |
|------|-------------------|---------|
| `web_data_amazon_product` | Product URL containing `/dp/` | Price, title, availability, rating, review count, ASIN, seller, images |
| `web_data_amazon_product_reviews` | Product URL containing `/dp/` | Review data |
| `web_data_amazon_product_search` | Search keyword + Amazon domain URL | First page of search results |
| `web_data_walmart_product` | Product URL containing `/ip/` | Product data |
| `web_data_walmart_seller` | Walmart seller URL | Seller data |
| `web_data_ebay_product` | eBay product URL | Listing data |
| `web_data_homedepot_products` | homedepot.com product URL | Product data |
| `web_data_zara_products` | Zara product URL | Product data |
| `web_data_etsy_products` | Etsy product URL | Listing data |
| `web_data_bestbuy_products` | Best Buy product URL | Product data |
| `web_data_google_shopping` | Google Shopping product URL | Multi-seller product data |

</details>

<details>
<summary><b>Social Media — 23 tools</b></summary>

| Tool | Input requirement | Returns |
|------|-------------------|---------|
| `web_data_linkedin_person_profile` | LinkedIn profile URL | Profile, experience, skills |
| `web_data_linkedin_company_profile` | LinkedIn company URL | Company data |
| `web_data_linkedin_job_listings` | LinkedIn jobs URL | Job listing data |
| `web_data_linkedin_posts` | LinkedIn post URL | Post data |
| `web_data_linkedin_people_search` | LinkedIn people search URL | Search results |
| `web_data_instagram_profiles` | Instagram profile URL | Profile data |
| `web_data_instagram_posts` | Instagram post URL | Post data |
| `web_data_instagram_reels` | Instagram reel URL | Reel data |
| `web_data_instagram_comments` | Instagram URL | Comments |
| `web_data_facebook_posts` | Facebook post URL | Post data |
| `web_data_facebook_marketplace_listings` | Marketplace listing URL | Listing data |
| `web_data_facebook_company_reviews` | Facebook company URL + review count | Reviews |
| `web_data_facebook_events` | Facebook event URL | Event data |
| `web_data_tiktok_profiles` | TikTok profile URL | Profile data |
| `web_data_tiktok_posts` | TikTok post URL | Post data |
| `web_data_tiktok_shop` | TikTok Shop product URL | Product data |
| `web_data_tiktok_comments` | TikTok video URL | Comments |
| `web_data_x_posts` | X post URL | Post data |
| `web_data_x_profile_posts` | X profile URL | Recent posts, optional date range filter |
| `web_data_youtube_videos` | YouTube video URL | Video metadata |
| `web_data_youtube_profiles` | YouTube channel URL | Channel data |
| `web_data_youtube_comments` | YouTube video URL, optional `num_of_comments` (default 10) | Comments |
| `web_data_reddit_posts` | Reddit post URL | Post data |

</details>

<details>
<summary><b>Browser Automation — 13 tools</b></summary>

Remote browser session. Typical sequence: navigate → snapshot → interact by ref → extract or screenshot.

| Tool | Description |
|------|-------------|
| `scraping_browser_navigate` | Open or reuse a browser session and navigate to a URL |
| `scraping_browser_go_back` | Navigate back |
| `scraping_browser_go_forward` | Navigate forward |
| `scraping_browser_snapshot` | ARIA snapshot of the page listing interactive elements with refs. Required before ref-based actions |
| `scraping_browser_click_ref` | Click an element by ref from the latest snapshot |
| `scraping_browser_type_ref` | Type into an element by ref; optionally press Enter to submit |
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
<summary><b>Business Intelligence — 4 tools</b></summary>

| Tool | Input requirement | Returns |
|------|-------------------|---------|
| `web_data_crunchbase_company` | Crunchbase company URL | Funding, investors, company data |
| `web_data_zoominfo_company_profile` | ZoomInfo company URL | Company profile |
| `web_data_google_maps_reviews` | Google Maps URL, optional `days_limit` (default 3) | Business reviews |
| `web_data_zillow_properties_listing` | Zillow listing URL | Property listing data |

</details>

<details>
<summary><b>GEO and LLM Visibility — 3 tools</b></summary>

| Tool | Input | Returns |
|------|-------|---------|
| `web_data_chatgpt_ai_insights` | Prompt | ChatGPT's answer: structured text, citations, recommendations, Markdown |
| `web_data_grok_ai_insights` | Prompt | Grok's answer as structured Markdown |
| `web_data_perplexity_ai_insights` | Prompt | Perplexity's answer with sources, as structured Markdown |

Use for Generative Engine Optimization (tracking how LLMs describe your brand) and LLM-as-a-judge workflows.

</details>

<details>
<summary><b>Code — 2 tools</b></summary>

| Tool | Input | Returns |
|------|-------|---------|
| `web_data_npm_package` | npm package name (e.g., `@brightdata/sdk`) | Latest version, README, dependencies, metadata |
| `web_data_pypi_package` | PyPI package name (e.g., `langchain-brightdata`) | Latest version, README, dependencies, metadata |

</details>

<details>
<summary><b>Finance, Research, App Stores, Travel — 5 tools</b></summary>

| Tool | Input requirement | Returns | Group |
|------|-------------------|---------|-------|
| `web_data_yahoo_finance_business` | Yahoo Finance business URL | Company financial data | `finance` |
| `web_data_github_repository_file` | GitHub file URL | File content and metadata | `research` |
| `web_data_google_play_store` | Play Store app URL | App details | `app_stores` |
| `web_data_apple_app_store` | App Store app URL | App details | `app_stores` |
| `web_data_booking_hotel_listings` | Booking.com listing URL | Hotel listing data | `travel` |

</details>

[Full tool reference in the docs →](https://docs.brightdata.com/ai/mcp-server/tools)

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
        "BROWSER_ZONE": "custom_browser",
        "POLLING_TIMEOUT": "600"
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
| `POLLING_TIMEOUT` | Timeout for `web_data_*` tools polling (seconds). Each second = 1 polling attempt | `600` | `300`, `1200` |
| `CONTENT_GATE` | When page content returned by a data tool looks like instructions to change the MCP configuration, the server asks the user (via MCP elicitation) before returning it. Set to `off` to disable | `on` | `off` |
| `CONTENT_GATE_TIMEOUT` | Seconds to wait for the user's answer before withholding the content | `120` | `60`, `300` |
| `BASE_TIMEOUT` | Request timeout for base tools in seconds (search and scrape) | No limit | `60`, `120` |
| `BASE_MAX_RETRIES` | Max retries for base tools on transient errors (0-3) | `0` | `1`, `3` |
| `GROUPS` | Comma-separated tool group IDs | - | `ecommerce,browser` |
| `TOOLS` | Comma-separated individual tool names | - | `extract,scrape_as_html` |

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

### web_data_* tool returns no data

Check the URL format matches the tool's requirement (e.g., Amazon needs `/dp/`, Walmart needs `/ip/`). Verify the page is publicly accessible. `scrape_as_markdown` works on the same URL as a fallback.

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
