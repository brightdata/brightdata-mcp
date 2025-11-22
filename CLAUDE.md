# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The Bright Data MCP (Model Context Protocol) Server is a Node.js application that provides AI assistants with web scraping and browser automation capabilities. It acts as an MCP server that exposes tools for:
- Web search (Google, Bing, Yandex)
- Web scraping with unblocking capabilities
- Browser automation via Playwright
- Structured data extraction from 60+ web data APIs

The server uses the FastMCP framework to implement the MCP protocol and connects to Bright Data's infrastructure for web unblocking and browser automation.

## Architecture

### Core Components

**server.js** - Main MCP server implementation
- Initializes FastMCP server
- Registers all MCP tools (search, scraping, web data, browser automation)
- Handles API authentication and zone management
- Implements rate limiting and usage tracking
- Uses Zod for parameter validation
- Tool registration is conditional based on `PRO_MODE` environment variable

**browser_tools.js** - Browser automation tools
- Exports an array of MCP tools for browser control
- All tools use ARIA ref-based element selection (more reliable than CSS selectors)
- Tools include: navigate, snapshot, click, type, screenshot, scroll, network requests
- Lazy-loads browser session only when needed via `require_browser()`

**browser_session.js** - Browser session management
- `Browser_session` class manages Playwright browser connections
- Implements per-domain session isolation (multiple browser instances for different domains)
- Connects to Bright Data's remote browser via CDP (Chrome DevTools Protocol)
- Tracks network requests per session
- Handles automatic reconnection on connection loss

**aria_snapshot_filter.js** - ARIA snapshot processing
- `Aria_snapshot_filter` class parses and filters Playwright ARIA snapshots
- Extracts only interactive elements (buttons, links, textboxes, etc.)
- Formats snapshots compactly to reduce token usage
- Used by browser tools to provide element refs for interaction

### Key Architectural Patterns

**Two-tier tool system:**
- **Rapid Mode (default/free)**: Only exposes `search_engine`, `scrape_as_markdown`, `search_engine_batch`, `scrape_batch`
- **Pro Mode**: Exposes all 60+ web data tools + browser automation tools
- Controlled via `PRO_MODE=true` environment variable

**Zone-based authentication:**
- Web scraping uses `WEB_UNLOCKER_ZONE` (default: `mcp_unlocker`)
- Browser automation uses `BROWSER_ZONE` (default: `mcp_browser`)
- Zones are automatically created if they don't exist on server startup

**ARIA ref-based browser automation:**
- Uses Playwright's ARIA snapshot feature for element identification
- Elements are referenced by `ref` numbers instead of CSS selectors
- More stable across page changes and reduces hallucination
- Workflow: snapshot → get refs → interact with refs

**Per-domain browser sessions:**
- Browser sessions are isolated by domain to prevent cookie/state leakage
- Each domain gets its own browser instance and page
- Automatically switches current domain based on navigation URL

**Sampling-based data extraction:**
- The `extract` tool uses MCP's `requestSampling` to convert scraped markdown to structured JSON
- Allows AI-powered parsing of arbitrary web content without predefined schemas

## Development Commands

### Running the server

```bash
# Start the MCP server (requires API_TOKEN env var)
npm start

# Or run directly
node server.js
```

### Testing

There are no automated tests in this repository. To test:
1. Configure the server in an MCP client (Claude Desktop, etc.)
2. Use example queries from README.md
3. Monitor server logs via stderr output

### Building

No build step required - this is a pure Node.js application using ES modules.

### Docker

```bash
# Build Docker image
docker build -t brightdata-mcp .

# Run container with environment variables
docker run -e API_TOKEN=your_token brightdata-mcp
```

### Publishing

The `.github/workflows/publish-mcp.yml` workflow automatically publishes to npm on version changes. To publish:
1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Commit and push - GitHub Actions handles the rest

## Environment Variables

**Required:**
- `API_TOKEN` - Bright Data API token (authentication)

**Optional:**
- `PRO_MODE=true` - Enable all 60+ tools (default: false, only basic tools)
- `WEB_UNLOCKER_ZONE=name` - Custom web unlocker zone (default: `mcp_unlocker`)
- `BROWSER_ZONE=name` - Custom browser zone (default: `mcp_browser`)
- `RATE_LIMIT=100/1h` - Rate limiting format: `{limit}/{time}{unit}` where unit is h/m/s

## Code Conventions

### Coding Standards

Follow [Bright Data's JavaScript coding standards](https://brightdata.com/dna/js_code):
- Use strict mode: `'use strict'; /*jslint node:true es9:true*/`
- Use snake_case for variables and functions
- Use PascalCase for classes
- Prefer async/await over promises
- Use ES modules (import/export)

### Error Handling

- Use `UserError` from fastmcp for user-facing errors in tools
- Log errors to stderr using `console.error()`
- Network errors should include response status and data
- Browser errors should provide context about which element/action failed

### Tool Implementation Pattern

All tools follow this pattern:

```javascript
addTool({
    name: 'tool_name',
    description: 'Clear description for LLM',
    parameters: z.object({
        param: z.string().describe('Parameter description'),
    }),
    execute: tool_fn('tool_name', async (data, ctx) => {
        // Tool implementation
        // ctx includes: clientName, clientInfo, reportProgress
        return 'Result string or object';
    }),
});
```

The `tool_fn` wrapper:
- Checks rate limits
- Logs execution with client info
- Updates debug stats
- Handles errors consistently
- Measures execution time

### Browser Tool Patterns

Browser tools should:
1. Use `require_browser()` to get browser session (lazy initialization)
2. Use `browser_session.get_page()` to get current page
3. Prefer ARIA refs over CSS selectors
4. Throw `UserError` for user-facing errors
5. Return descriptive success messages

### Adding New Web Data Tools

Web data tools are generated in a loop at server.js:793-866. To add a new dataset:

1. Add entry to the `datasets` array with:
   - `id` - Tool suffix (becomes `web_data_{id}`)
   - `dataset_id` - Bright Data dataset identifier
   - `description` - Tool description for LLM
   - `inputs` - Array of required input parameter names
   - `defaults` (optional) - Default values for parameters
   - `fixed_values` (optional) - Parameters automatically added to requests

2. The tool will automatically:
   - Validate URLs if `url` is in inputs
   - Trigger dataset collection
   - Poll for results (max 600 seconds)
   - Return JSON results

## Common Patterns

**Conditional tool registration:**
Tools are only registered if in pro mode or in the allowed list (`pro_mode_tools`).

**Automatic zone creation:**
On startup, `ensure_required_zones()` checks for and creates necessary Bright Data zones.

**Request/response tracking:**
Browser sessions track all network requests made during page navigation via Playwright's request/response events.

**Client name propagation:**
The client name (Claude Desktop, etc.) is captured from MCP connect events and passed to Bright Data APIs via headers for analytics.

**Domain-based session isolation:**
Browser sessions are keyed by domain hostname to prevent cross-site state leakage and enable parallel browsing.

## Important Notes

- The server communicates via stdio transport (MCP standard)
- All logging must use `console.error()` since stdout is reserved for MCP protocol
- The server expects `API_TOKEN` env var - it will throw immediately if missing
- Browser automation requires Playwright chromium (included in dependencies)
- ARIA snapshots are filtered by default to reduce token usage - pass `filtered: false` to `capture_snapshot()` for full snapshot
- Network requests are tracked per navigation - use `clear_requests()` when navigating to reset the list
- The `extract` tool requires an active MCP session for sampling
