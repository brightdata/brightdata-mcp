<div align="center">
  <a href="https://brightdata.com/ai/mcp-server">
    <img src="https://github.com/user-attachments/assets/c21b3f7b-7ff1-40c3-b3d8-66706913d62f" alt="Bright Data Logo">
  </a>

  <h1>The Web MCP</h1>
  
  <p>
    <strong>🌐 Give your AI real-time web superpowers</strong><br/>
    <i>Seamlessly connect LLMs to the live web without getting blocked</i>
  </p>

  <p>
    <a href="https://www.npmjs.com/package/@brightdata/mcp">
      <img src="https://img.shields.io/npm/v/@brightdata/mcp?style=for-the-badge&color=blue" alt="npm version"/>
    </a>
    <a href="https://www.npmjs.com/package/@brightdata/mcp">
      <img src="https://img.shields.io/npm/dw/@brightdata/mcp?style=for-the-badge&color=green" alt="npm downloads"/>
    </a>
    <a href="https://github.com/brightdata-com/brightdata-mcp/blob/main/LICENSE">
      <img src="https://img.shields.io/badge/license-MIT-purple?style=for-the-badge" alt="License"/>
    </a>
  </p>

  <p>
    <a href="#-quick-start">Quick Start</a> •
    <a href="#-features">Features</a> •
    <a href="#-pricing--modes">Pricing</a> •
    <a href="#-demos">Demos</a> •
    <a href="#-documentation">Docs</a> •
    <a href="#-support">Support</a>
  </p>

  <div>
    <h3>🎉 <strong>Free Tier Available!</strong> 🎉</h3>
    <p><strong>5,000 requests/month FREE</strong> <br/>
    <sub>Perfect for prototyping and everyday AI workflows</sub></p>
  </div>
</div>

  <br/>

  <div align="center">
    <h3>NEW: Code Tool group - Your Coding Agent's Best Friend</h3>
    <p><strong>Instant access to npm and PyPI package data, right from your AI agent.</strong></p>
    <p>
      Need the latest version of a package? Want to read its README without leaving your workflow?<br/>
      The <b>Code</b> tool group gives coding agents structured, reliable package metadata on demand —<br/>
      no scraping, no stale caches, just the data your agent needs to make smart dependency decisions.
    </p>
    <table>
      <tr>
        <td align="center"><b>npm</b><br/><sub>Package versions, READMEs, metadata &amp; dependencies</sub></td>
        <td align="center"><b>PyPI</b><br/><sub>Python package info, versions &amp; project details</sub></td>
      </tr>
    </table>
    <p><code>GROUPS="code"</code> &nbsp;·&nbsp; The go-to tool for Claude Code, Cursor, Windsurf &amp; any MCP-powered coding agent</p>
  </div>

  <div align="center">
    <h3>GEO & AI Brand Visibility Tools</h3>
    <p><strong>See how ChatGPT, Grok, and Perplexity talk about your brand.</strong></p>
    <p>
      Query leading LLMs directly from your agent and get back structured, markdown-formatted answers.<br/>
      The ultimate feedback loop for <b>Generative Engine Optimization (GEO)</b> — monitor AI-generated
      recommendations, track brand mentions across LLMs, and understand how AI perceives your products.
    </p>
    <table>
      <tr>
        <td align="center"><b>ChatGPT</b><br/><sub>AI-generated insights, citations &amp; recommendations</sub></td>
        <td align="center"><b>Grok</b><br/><sub>Real-time AI analysis powered by X data</sub></td>
        <td align="center"><b>Perplexity</b><br/><sub>Search-augmented AI answers with sources</sub></td>
      </tr>
    </table>
    <p><code>GROUPS="geo"</code> &nbsp;·&nbsp; Works with any MCP-compatible agent</p>
  </div>



---

## 🌟 Overview

**The Web MCP** is your gateway to giving AI assistants true web capabilities. No more outdated responses, no more "I can't access real-time information" - just seamless, reliable web access that actually works.

Built by [Bright Data](https://brightdata.com), the world's #1 web data platform, this MCP server ensures your AI never gets blocked, rate-limited, or served CAPTCHAs.

<div align="center">
  <table>
    <tr>
      <td align="center">✅ <strong>Works with Any LLM</strong><br/><sub>Claude, GPT, Gemini, Llama</sub></td>
      <td align="center">🛡️ <strong>Never Gets Blocked</strong><br/><sub>Enterprise-grade unblocking</sub></td>
      <td align="center">🚀 <strong>5,000 Free Requests</strong><br/><sub>Monthly</sub></td>
      <td align="center">⚡ <strong>Zero Config</strong><br/><sub>Works out of the box</sub></td>
    </tr>
  </table>
</div>

---

## 🎯 Perfect For

- 🔍 **Real-time Research** - Get current prices, news, and live data
- 🛍️ **E-commerce Intelligence** - Monitor products, prices, and availability  
- 📊 **Market Analysis** - Track competitors and industry trends
- 🤖 **AI Agents** - Build agents that can actually browse the web
- 💻 **Coding Agents** - Look up npm/PyPI packages, versions, and READMEs in real time
- 🧠 **GEO & Brand Visibility** - See how ChatGPT, Grok, and Perplexity perceive your brand
- 📝 **Content Creation** - Access up-to-date information for writing
- 🎓 **Academic Research** - Gather data from multiple sources efficiently

---

## ⚡ Quick Start

**Use the configuration wizard:** 

![GIF for day2](https://github.com/user-attachments/assets/b3917553-6cf9-4264-bc7a-9b8b74df0a17)


<summary><b>📡 Use our hosted server - No installation needed!</b></summary>

Perfect for users who want zero setup. Just add this URL to your MCP client:

```
https://mcp.brightdata.com/mcp?token=YOUR_API_TOKEN_HERE
```

**Setup in Claude Desktop:**
1. Go to: Settings → Connectors → Add custom connector
2. Name: `Bright Data Web`
3. URL: `https://mcp.brightdata.com/mcp?token=YOUR_API_TOKEN`
4. Click "Add" and you're done! ✨


<summary><b>Run locally on your machine</b></summary>

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


---

## 🚀 Pricing & Modes

<div align="center">
  <table>
    <tr>
      <th width="33%">⚡ Rapid Mode (Free tier)</th>
      <th width="33%">💎 Pro Mode</th>
      <th width="34%">🔧 Custom Mode</th>
    </tr>
    <tr>
      <td align="center">
        <h3>$0/month</h3>
        <p><strong>5,000 requests</strong></p>
        <hr/>
        <p>✅ Web Search<br/>
        ✅ Scraping with Web unlocker<br/>
        ❌ Browser Automation<br/>
        ❌ Web data tools</p>
        <br/>
        <code>Default Mode</code>
      </td>
      <td align="center">
        <h3>Pay-as-you-go</h3>
        <p><strong>Everything in rapid plus 60+ tools</strong></p>
        <hr/>
        <p>✅ Browser Control<br/>
        ✅ Web Data APIs<br/>
        <br/>
        <br/>
        <br/>
        <code>PRO_MODE=true</code>
      </td>
      <td align="center">
        <h3>Usage-based</h3>
        <p><strong>Pick the tools you need</strong></p>
        <hr/>
        <p>✅ Combine tool groups<br/>
        ✅ Add individual tools<br/>
        ❌ Overrides Pro eligibility</p>
        <br/>
        <code>GROUPS="browser"</code><br/>
        <code>TOOLS="scrape_as_html"</code>
      </td>
    </tr>
  </table>
</div>

> **💡 Note:** Pro mode is **not included** in the free tier and incurs
> additional charges based on usage.

---

## 🧠 Advanced Tool Selection

- `GROUPS` lets you enable curated tool bundles. Use comma-separated group
  IDs such as `ecommerce,browser`.
- `TOOLS` adds explicit tool names on top of the selected groups.
- Mode priority: `PRO_MODE=true` (all tools) → `GROUPS` / `TOOLS`
  (whitelist) → default rapid mode (base toolkit).
- Base tools always enabled: `search_engine`, `search_engine_batch`,
  `scrape_as_markdown`, `scrape_batch`.
- Group ID `custom` is reserved; use `TOOLS` for bespoke picks.


<table>
  <tr>
    <th align="left">Group ID</th>
    <th align="left">Description</th>
    <th align="left">Featured tools</th>
  </tr>
  <tr>
    <td><code>ecommerce</code></td>
    <td>Retail and marketplace datasets</td>
    <td><code>web_data_amazon_product</code>,
    <code>web_data_walmart_product</code>,
    <code>web_data_google_shopping</code></td>
  </tr>
  <tr>
    <td><code>social</code></td>
    <td>Social, community, and creator insights</td>
    <td><code>web_data_linkedin_posts</code>,
    <code>web_data_tiktok_posts</code>,
    <code>web_data_youtube_videos</code></td>
  </tr>
  <tr>
    <td><code>browser</code></td>
    <td>Bright Data Scraping Browser automation tools</td>
    <td><code>scraping_browser_snapshot</code>,
    <code>scraping_browser_click_ref</code>,
    <code>scraping_browser_screenshot</code></td>
  </tr>
  <tr>
    <td><code>finance</code></td>
    <td>Financial intelligence datasets</td>
    <td><code>web_data_yahoo_finance_business</code></td>
  </tr>
  <tr>
    <td><code>business</code></td>
    <td>Company and location intelligence datasets</td>
    <td><code>web_data_crunchbase_company</code>,
    <code>web_data_zoominfo_company_profile</code>,
    <code>web_data_zillow_properties_listing</code></td>
  </tr>
  <tr>
    <td><code>research</code></td>
    <td>News and developer data feeds</td>
    <td><code>web_data_github_repository_file</code>,
    <code>web_data_reuter_news</code></td>
  </tr>
  <tr>
    <td><code>app_stores</code></td>
    <td>App store data</td>
    <td><code>web_data_google_play_store</code>,
    <code>web_data_apple_app_store</code></td>
  </tr>
  <tr>
    <td><code>travel</code></td>
    <td>Travel information</td>
    <td><code>web_data_booking_hotel_listings</code></td>
  </tr>
  <tr>
    <td><code>geo</code></td>
    <td>GEO &amp; LLM brand visibility</td>
    <td><code>web_data_chatgpt_ai_insights</code>,
    <code>web_data_grok_ai_insights</code>,
    <code>web_data_perplexity_ai_insights</code></td>
  </tr>
  <tr>
    <td><code>code</code></td>
    <td>Package intelligence for coding agents</td>
    <td><code>web_data_npm_package</code>,
    <code>web_data_pypi_package</code></td>
  </tr>
  <tr>
    <td><code>advanced_scraping</code></td>
    <td>Batch and AI-assisted extraction helpers</td>
    <td><code>search_engine_batch</code>,
    <code>scrape_batch</code>,
    <code>extract</code></td>
  </tr>
</table>

### Claude Desktop example

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

### Coding agent example (Claude Code / Cursor / Windsurf)

Give your coding agent real-time package intelligence — latest versions, READMEs,
dependencies, and metadata from npm and PyPI without scraping:

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

## ✨ Features

### 🔥 Core Capabilities

<table>
  <tr>
    <td>🔍 <b>Smart Web Search</b><br/>Google-quality results optimized for AI</td>
    <td>📄 <b>Clean Markdown</b><br/>AI-ready content extraction</td>
  </tr>
  <tr>
    <td>🌍 <b>Global Access</b><br/>Bypass geo-restrictions automatically</td>
    <td>🛡️ <b>Anti-Bot Protection</b><br/>Never get blocked or rate-limited</td>
  </tr>
  <tr>
    <td>🤖 <b>Browser Automation</b><br/>Control real browsers remotely (Pro)</td>
    <td>⚡ <b>Lightning Fast</b><br/>Optimized for minimal latency</td>
  </tr>
</table>

### 🎯 Example Queries That Just Work

```yaml
✅ "What's Tesla's current stock price?"
✅ "Find the best-rated restaurants in Tokyo right now"
✅ "Get today's weather forecast for New York"
✅ "What movies are releasing this week?"
✅ "What are the trending topics on Twitter today?"
✅ "What's the latest version of express on npm?"
✅ "Get the README for the langchain-brightdata PyPI package"
```

---

## 🎬 Demos

> **Note:** These videos show earlier versions. New demos coming soon! 🎥

<details>
<summary><b>View Demo Videos</b></summary>

### Basic Web Search Demo
https://github.com/user-attachments/assets/59f6ebba-801a-49ab-8278-1b2120912e33

### Advanced Scraping Demo
https://github.com/user-attachments/assets/61ab0bee-fdfa-4d50-b0de-5fab96b4b91d

[📺 More tutorials on YouTube →](https://github.com/brightdata-com/brightdata-mcp/blob/main/examples/README.md)

</details>

---

## 🔧 Available Tools

### ⚡ Rapid Mode Tools (Default - Free)

| Tool | Description | Use Case |
|------|-------------|----------|
| 🔍 `search_engine` | Web search with AI-optimized results | Research, fact-checking, current events |
| 📄 `scrape_as_markdown` | Convert any webpage to clean markdown | Content extraction, documentation |

### 💎 Pro Mode Tools (60+ Tools)

<details>
<summary><b>Click to see all Pro tools</b></summary>

| Category | Tools | Description |
|----------|-------|-------------|
| **Browser Control** | `scraping_browser.*` | Full browser automation |
| **Web Data APIs** | `web_data_*` | Structured data extraction |
| **E-commerce** | Product scrapers | Amazon, eBay, Walmart data |
| **Social Media** | Social scrapers | Twitter, LinkedIn, Instagram |
| **Maps & Local** | Location tools | Google Maps, business data |

[📚 View complete tool documentation →](https://github.com/brightdata-com/brightdata-mcp/blob/main/assets/Tools.md)

</details>

---

## 🎮 Try It Now!

### 🧪 Online Playground
Try the Web MCP without any setup:

<div align="center">
  <a href="https://brightdata.com/ai/playground-chat">
    <img src="https://img.shields.io/badge/Try_on-Playground-00C7B7?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMyA3VjE3TDEyIDIyTDIxIDE3VjdMMTIgMloiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMiIvPgo8L3N2Zz4=" alt="Playground"/>
  </a>
</div>

---

## 🔧 Configuration

### Basic Setup
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

### Advanced Configuration
```json
{
  "mcpServers": {
    "Bright Data": {
      "command": "npx",
      "args": ["@brightdata/mcp"],
      "env": {
        "API_TOKEN": "your-token-here",
        "PRO_MODE": "true",              // Enable all 60+ tools
        "RATE_LIMIT": "100/1h",          // Custom rate limiting
        "WEB_UNLOCKER_ZONE": "custom",   // Custom unlocker zone
        "BROWSER_ZONE": "custom_browser", // Custom browser zone
        "POLLING_TIMEOUT": "600"         // Polling timeout in seconds (default: 600)
      }
    }
  }
}
```

### Environment Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `API_TOKEN` | Your Bright Data API token (required) | - | `your-token-here` |
| `PRO_MODE` | Enable all 60+ tools | `false` | `true` |
| `RATE_LIMIT` | Custom rate limiting | unlimited | `100/1h`, `50/30m` |
| `WEB_UNLOCKER_ZONE` | Custom Web Unlocker zone name | `mcp_unlocker` | `my_custom_zone` |
| `BROWSER_ZONE` | Custom Browser zone name | `mcp_browser` | `my_browser_zone` |
| `POLLING_TIMEOUT` | Timeout for web_data_* tools polling (seconds) | `600` | `300`, `1200` |
| `BASE_TIMEOUT` | Request timeout for base tools in seconds (search & scrape) | No limit | `60`, `120` |
| `BASE_MAX_RETRIES` | Max retries for base tools on transient errors (0-3) | `0` | `1`, `3` |
| `GROUPS` | Comma-separated tool group IDs | - | `ecommerce,browser` |
| `TOOLS` | Comma-separated individual tool names | - | `extract,scrape_as_html` |

**Notes:**
- `POLLING_TIMEOUT` controls how long web_data_* tools wait for results. Each second = 1 polling attempt.
- Lower values (e.g., 300) will fail faster on slow data collections.
- Higher values (e.g., 1200) allow more time for complex scraping tasks.

---

## 📚 Documentation

<div align="center">
  <table>
    <tr>
      <td align="center">
        <a href="https://docs.brightdata.com/mcp-server/overview">
          <img src="https://img.shields.io/badge/📖-API_Docs-blue?style=for-the-badge" alt="API Docs"/>
        </a>
      </td>
      <td align="center">
        <a href="https://github.com/brightdata-com/brightdata-mcp/blob/main/examples">
          <img src="https://img.shields.io/badge/💡-Examples-green?style=for-the-badge" alt="Examples"/>
        </a>
      </td>
      <td align="center">
        <a href="https://github.com/brightdata-com/brightdata-mcp/blob/main/CHANGELOG.md">
          <img src="https://img.shields.io/badge/📝-Changelog-orange?style=for-the-badge" alt="Changelog"/>
        </a>
      </td>
      <td align="center">
        <a href="https://brightdata.com/blog/ai/web-scraping-with-mcp">
          <img src="https://img.shields.io/badge/📚-Tutorial-purple?style=for-the-badge" alt="Tutorial"/>
        </a>
      </td>
    </tr>
  </table>
</div>

---

## 🚨 Common Issues & Solutions

<details>
<summary><b>🔧 Troubleshooting Guide</b></summary>

### ❌ "spawn npx ENOENT" Error
**Solution:** Install Node.js or use the full path to node:
```json
"command": "/usr/local/bin/node"  // macOS/Linux
"command": "C:\\Program Files\\nodejs\\node.exe"  // Windows
```

### ⏱️ Timeouts on Complex Sites
**Solution:** Increase timeout in your client settings to 180s

### 🔑 Authentication Issues
**Solution:** Ensure your API token is valid and has proper permissions

### 📡 Remote Server Connection
**Solution:** Check your internet connection and firewall settings

[More troubleshooting →](https://github.com/brightdata-com/brightdata-mcp#troubleshooting)

</details>

---

## 🤝 Contributing

We love contributions! Here's how you can help:

- 🐛 [Report bugs](https://github.com/brightdata-com/brightdata-mcp/issues)
- 💡 [Suggest features](https://github.com/brightdata-com/brightdata-mcp/issues)
- 🔧 [Submit PRs](https://github.com/brightdata-com/brightdata-mcp/pulls)
- ⭐ Star this repo!

Please follow [Bright Data's coding standards](https://brightdata.com/dna/js_code).

---

## 📞 Support

<div align="center">
  <table>
    <tr>
      <td align="center">
        <a href="https://github.com/brightdata-com/brightdata-mcp/issues">
          <strong>🐛 GitHub Issues</strong><br/>
          <sub>Report bugs & features</sub>
        </a>
      </td>
      <td align="center">
        <a href="https://docs.brightdata.com/mcp-server/overview">
          <strong>📚 Documentation</strong><br/>
          <sub>Complete guides</sub>
        </a>
      </td>
      <td align="center">
        <a href="mailto:support@brightdata.com">
          <strong>✉️ Email</strong><br/>
          <sub>support@brightdata.com</sub>
        </a>
      </td>
    </tr>
  </table>
</div>

---

## 📜 License

MIT © [Bright Data Ltd.](https://brightdata.com)

---

<div align="center">
  <p>
    <strong>Built with ❤️ by</strong><br/>
    <a href="https://brightdata.com">
      <img src="https://idsai.net.technion.ac.il/files/2022/01/Logo-600.png" alt="Bright Data" height="120"/>
    </a>
  </p>
  <p>
    <sub>The world's #1 web data platform</sub>
  </p>
  
  <br/>
  
  <p>
    <a href="https://github.com/brightdata-com/brightdata-mcp">⭐ Star us on GitHub</a> • 
    <a href="https://brightdata.com/blog">Read our Blog</a>
  </p>
</div>

## Hosted deployment

A hosted deployment is available on [Fronteir AI](https://fronteir.ai/mcp/luminati-io-brightdata-mcp).

