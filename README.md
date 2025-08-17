<p align="center">
  <a href="https://brightdata.com/ai/mcp-server">
    <img src="https://github.com/user-attachments/assets/c21b3f7b-7ff1-40c3-b3d8-66706913d62f" alt="Bright Data Logo">
  </a>


<h1 align="center">The Web MCP</h1>
<h3 align="center">Enhance your LLM and AI agents with real-time web access</h3>

<div align="center">
  
<p align="center">
  <img src="https://img.shields.io/npm/v/@brightdata/mcp?label=version"  
       alt="npm version"/>
</p>

<p align="center">
  <img src="https://img.shields.io/npm/dw/@brightdata/mcp"  
       alt="npm downloads"/>

[![Trust Score](https://archestra.ai/mcp-catalog/api/badge/quality/luminati-io/brightdata-mcp)](https://archestra.ai/mcp-catalog/luminati-io__brightdata-mcp)
  <a href="https://smithery.ai/server/@luminati-io/brightdata-mcp">
    <img src="https://smithery.ai/badge/@luminati-io/brightdata-mcp"  
         alt="Smithery score"/>
  </a>
</p>

</div>



## 🌟 Overview

Welcome to the official Bright Data's Web MCP server, solving web access for LLMs and AI agents by allowing them to effectively search, extract and navigate the web without getting blocked. The Web MCP supports all major LLMs, IDEs and agent frameworks (either locally hosted, SSE or Streamable HTTP), enabling your tools to seamlessly search the web, navigate websites, take action and retrieve data - without getting blocked.

🚀 The Web MCP includes **5,000 free requests each month** - ideal for your everyday use and for prototyping smart agentic workflows.

![MCP](https://github.com/user-attachments/assets/b949cb3e-c80a-4a43-b6a5-e0d6cec619a7)

> **Note**: The Web MCP free tier offers 5,000 requests per month for the first 3 months. After that, a credit card will be required, but there will be no extra charges unless premium features like **mcp_browser** or **Web Scrapers** are used.



## Table of Content
- [🎬 Demo](#-demo)
- [✨ Features](#-features)
- [💡 Usage Examples](#-usage-examples)
- [🚀 Quickstart with Claude Desktop](#-quickstart-with-claude-desktop)
- [🔧 Available Tools](#-available-tools)
- [⚠️ Security Best Practices](#%EF%B8%8F-security-best-practices)
- [🔧 Account Setup](#-account-setup)
- [🔌 Other MCP Clients](#-other-mcp-clients)
- [🎮 Try Bright Data MCP Playgrounds](#-try-bright-data-mcp-playgrounds)
- [⚠️ Troubleshooting](#%EF%B8%8F-troubleshooting)
- [👨‍💻 Contributing](#-contributing)
- [📞 Support](#-support)


## 🎬 Demo

The videos below demonstrate a minimal use case for Claude Desktop:

https://github.com/user-attachments/assets/59f6ebba-801a-49ab-8278-1b2120912e33

https://github.com/user-attachments/assets/61ab0bee-fdfa-4d50-b0de-5fab96b4b91d 

For more YouTube tutorials and demos: [Demo](https://github.com/brightdata-com/brightdata-mcp/blob/main/examples/README.md)

## ✨ Features

- **Real-time Web Access**: Access up-to-date information directly from the web
- **Bypass Geo-restrictions**: Access content regardless of location constraints
- **Web Unlocker**: Navigate websites with bot detection protection
- **Browser Control**: Remote browser automation capabilities
- **Seamless Integration**: Works with all MCP-compatible AI assistants

## 💡 Usage Examples

Some example queries that this MCP server will be able to help with:

- "Google some movies that are releasing soon in [your area]"
- "What's Tesla's current market cap?"
- "What's the Wikipedia article of the day?"
- "What's the 7-day weather forecast in [your location]?"
- "Of the 3 highest paid tech CEOs, how long have their careers been?" 

## Quickstart with Cursor

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=brightdata-remote-mcp&config=JTdCJTIyY29tbWFuZCUyMiUzQSUyMm5weCUyMC15JTIwbWNwLXJlbW90ZSUyMGh0dHBzJTNBJTJGJTJGbWNwLmJyaWdodGRhdGEuY29tJTJGc3NlJTNGdG9rZW4lM0QlM0N5b3VyLWFwaS1rZXklM0UlMjIlN0Q%3D)

## 🚀 Quickstart with hosted MCP on Claude Desktop

### Through Connectors:

1. Open Claude Desktop

2. Go to: Settings → Connectors → Add custom connector

3. Choose a Name, and in the “Remote MCP server URL” section, paste:

```
https://mcp.brightdata.com/mcp?token=YOUR_API_TOKEN_HERE
```

4. Replace YOUR_API_TOKEN_HERE with your actual API token from Step 1, and click “Add”

### Through Developer Settings:

1. Open Claude Desktop

2. Go to: Settings → Developer → Edit Config

3. Add this to your claude_desktop_config.json:

```json
{
  "mcpServers": {
    "Bright Data": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.brightdata.com/mcp?token=YOUR_API_TOKEN_HERE"
      ]
    }
  }
}
```

4. Replace YOUR_API_TOKEN_HERE with your actual API token from Step 1

5. Save and restart Claude Desktop

## 💻 Use with self hosted MCP on Claude Desktop

### Through [Claude Desktop Extension](https://support.anthropic.com/en/articles/10949351-getting-started-with-model-context-protocol-mcp-on-claude-for-desktop#h_4819d0d1b4):

1. **Download** the Claude Desktop Extension:  
   [📦 Bright Data's MCP Extension](https://github.com/brightdata/brightdata-mcp/raw/refs/heads/main/brightdata-mcp-extension.dxt)

2. **Open** Claude and go to:  
   `Settings` → `Extensions`

3. **Drag** the `.dtx` file from **Step 1** into the **dropping area**.

4. **Enable** the service and **restart** Claude.

5. Enjoy!

### Through `claude_desktop_config.json`:

1. Install `nodejs` to get the `npx` command (node.js module runner). Installation instructions can be found on the [node.js website](https://nodejs.org/en/download)

2. Go to Claude > Settings > Developer > Edit Config > Edit "claude_desktop_config.json" to include the following:

```json
{
  "mcpServers": {
    "Bright Data": {
      "command": "npx",
      "args": ["@brightdata/mcp"],
      "env": {
        "API_TOKEN": "<insert-your-api-token-here>"
      }
    }
  }
}
```

#### 🛸 Or for more advanced options: 

```json
{
  "mcpServers": {
    "Bright Data": {
      "command": "npx",
      "args": ["@brightdata/mcp"],
      "env": {
        "API_TOKEN": "<insert-your-api-token-here>",
        "RATE_LIMIT": "<optional if you want to change rate limit format: limit/time+unit, e.g., 100/1h, 50/30m, 10/5s>",
        "WEB_UNLOCKER_ZONE": "<optional if you want to override the web unlocker zone name - default is mcp_unlocker>",
        "BROWSER_ZONE": "<optional if you want to override the browser zone name - defaults is mcp_browser>",
        "PRO_MODE": "<optional boolean, defaults to false. Set to true to expose all tools including browser and web_data_* tools>"
      }
    }
  }
}
```

## 🔧 Available Tools

> **Important:** Pro mode **is not included in the free tier** and will incur additional charges. If you choose to use **Pro mode**, you’ll gain access to all 60 tools but please be aware of the associated costs.

To enable **Pro mode**, simply add `"PRO_MODE"=true` to your enviroment variables.

[List of Available Tools](https://github.com/brightdata-com/brightdata-mcp/blob/main/assets/Tools.md)

**Note**: By default, only basic tools (`search_engine` and `scrape_as_markdown`) are exposed. To access all tools including browser automation and web data extraction, enable `PRO_MODE` in your configuration (see Account Setup section).

## ⚠️ Security Best Practices

**Important:** Always treat scraped web content as untrusted data. Never use raw scraped content directly in LLM prompts to avoid potential prompt injection risks. 
Instead:
- Filter and validate all web data before processing
- Use structured data extraction rather than raw text (web_data tools)

## 🔧 Account Setup

1. Make sure you have an account on [brightdata.com](https://brightdata.com) (new users get free credit for testing, and pay as you go options are available)

2. Get your API key from the [user settings page](https://brightdata.com/cp/setting/users), or from the welcome email you received

####   Optional:

3. Enable Pro Mode (for access to all tools):
   - Set `PRO_MODE=true` in your environment configuration to access browser automation, structured data extraction, and all available tools
   - Default: `false` (only exposes `search_engine` and `scrape_as_markdown` tools)
   - See the advanced configuration example above for implementation details

4. Configure rate limiting:
   - Set the `RATE_LIMIT` environment variable to control API usage
   - Format: `limit/time+unit` (e.g., `100/1h` for 100 calls per hour)
   - Supported time units: seconds (s), minutes (m), hours (h)
   - Examples: `RATE_LIMIT=100/1h`, `RATE_LIMIT=50/30m`, `RATE_LIMIT=10/5s`
   - Rate limiting is session-based (resets when server restarts)

5. Create a custom Web Unlocker zone 
   - By default, we create a Web Unlocker zone automatically using your API token
   - For more control, you can create your own Web Unlocker zone in your [control panel](https://brightdata.com/cp/zones) and specify it with the `WEB_UNLOCKER_ZONE` environment variable

6. Create a custom  Browser API zone:
   - By default, we create a Browser API zone automatically using your API token.
   - For more control, you can create your own Browser API zone in your [control panel](https://brightdata.com/cp/zones) and specify it with the `BROWSER_ZONE` environment variable

## 🔌 Other MCP Clients

To use this MCP server with other agent types, you should adapt the following to your specific software:

- Before running the server, make sure the `API_TOKEN=<your-token>` environment variable is set
- The full command to run the MCP server is `npx @brightdata/mcp`


#### 💻 macOS / Linux (bash/zsh)

```bash
export API_TOKEN=your-token
npx @brightdata/mcp
```

#### 🪟 Windows (Command Prompt)

```cmd
set API_TOKEN=your-token
npx @brightdata/mcp
```

#### 🪟 Windows (PowerShell)

```powershell
$env:API_TOKEN="your-token"
npx @brightdata/mcp
```

> 💡 **Tip:** You can also use a `.env` file and a tool like [`dotenv`](https://www.npmjs.com/package/dotenv) to manage environment variables more easily during development.

---

## 🔄 Changelog

[CHANGELOG.md](https://github.com/brightdata-com/brightdata-mcp/blob/main/CHANGELOG.md)

## 🎮 Try Bright Data MCP Playgrounds

Want to try Bright Data MCP without setting up anything? 

Check out this playground on [Smithery](https://smithery.ai/server/@luminati-io/brightdata-mcp/tools):

[![2025-05-06_10h44_20](https://github.com/user-attachments/assets/52517fa6-827d-4b28-b53d-f2020a13c3c4)](https://smithery.ai/server/@luminati-io/brightdata-mcp/tools)

This platform provides an easy way to explore the capabilities of Bright Data MCP without any local setup. Just sign in and start experimenting with web data collection!

## ⚠️ Troubleshooting

### Timeouts when using certain tools

Some tools can involve reading web data, and the amount of time needed to load the page can vary by quite a lot in extreme circumstances.

To ensure that your agent will be able to consume the data, set a high enough timeout in your agent settings.

A value of `180s` should be enough for 99% of requests, but some sites load slower than others, so tune this to your needs.

### spawn npx ENOENT

This error occurs when your system cannot find the `npx` command. To fix it:

#### Finding npm/Node Path

**macOS:**

```
which node
```

Shows path like `/usr/local/bin/node`

**Windows:**

```
where node
```

Shows path like `C:\Program Files\nodejs\node.exe`

#### Update your MCP configuration:

Replace the `npx` command with the full path to Node, for example, on mac, it will look as follows:

```
"command": "/usr/local/bin/node"
```

## 👨‍💻 Contributing

We welcome contributions to help improve the Bright Data MCP! Here's how you can help:

1. **Report Issues**: If you encounter any bugs or have feature requests, please open an issue on our GitHub repository.
2. **Submit Pull Requests**: Feel free to fork the repository and submit pull requests with enhancements or bug fixes.
3. **Coding Style**: All JavaScript code should follow [Bright Data's JavaScript coding conventions](https://brightdata.com/dna/js_code). This ensures consistency across the codebase.
4. **Documentation**: Improvements to documentation, including this README, are always appreciated.
5. **Examples**: Share your use cases by contributing examples to help other users.

For major changes, please open an issue first to discuss your proposed changes. This ensures your time is well spent and aligned with project goals.

## 📞 Support

If you encounter any issues or have questions, please reach out to the Bright Data support team or open an issue in the repository.
