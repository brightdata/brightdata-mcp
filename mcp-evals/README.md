# Bright Data Tool Groups Evaluation

This repository contains evaluation tests for Bright Data tool groups using the [mcpjam](https://github.com/mcpjam/inspector) evals CLI.

## Overview

The evaluation framework tests various Bright Data tool groups by running automated tests that verify tool functionality through natural language queries. Each tool group represents a specific domain (e-commerce, research, finance, etc.) and comes with pre-configured test cases.

## Project Structure

```
mcp-evals/
├── server-configs/           # Server configuration files
│   ├── server-config.ecommerce.json
│   ├── server-config.research.json
│   ├── server-config.finance.json
│   ├── server-config.social.json
│   ├── server-config.business.json
│   ├── server-config.app_stores.json
│   ├── server-config.browser.json
│   └── server-config.advanced_scraping.json
├── tool-groups.json/         # Tool group test definitions
│   ├── tool-groups.ecommerce.json
│   ├── tool-groups.research.json
│   ├── tool-groups.finance.json
│   ├── tool-groups.social.json
│   ├── tool-groups.business.json
│   ├── tool-groups.app_stores.json
│   ├── tool-groups.browser.json
│   └── tool-groups.advanced_scraping.json
└── llms.json                 # LLM API keys configuration
```

## Prerequisites

1. **mcpjam CLI**: Install the mcpjam evaluation CLI
   ```bash
   npm install -g @mcpjam/cli
   ```

2. **Bright Data MCP Server**: Ensure your have an API key and that you are able to connect to Bright Data MCP server
   - Default URL: `http://mcp.brightdata.com/mcp`
3. **API Keys**: Configure your LLM provider API keys in `llms.json`

## Configuration Files

### 1. LLM Configuration (`llms.json`)

Configure your LLM provider API keys:

```json
{
  "openai": "sk-your-api-key-here"
}
```

### 2. Server Configuration (`server-configs/*.json`)

Each server configuration file defines:
- **timeout**: Maximum execution time (in milliseconds)
- **servers**: Server connection details
  - URL with tool group and browser parameters
  - Authentication headers

Example `server-config.ecommerce.json`:

```json
{
  "timeout": 600000,
  "servers": {
    "ecommerce-server": {
      "url": "http://mcp.brightdata.com/mcp?groups=ecommerce&browser=scraping_browser",
      "requestInit": {
        "headers": {
          "Authorization": "Bearer YOUR_AUTH_TOKEN"
        }
      }
    }
  }
}
```

### 3. Tool Group Tests (`tool-groups.json/*.json`)

Each test file contains an array of test cases with:
- **title**: Test description
- **query**: Natural language query for the LLM
- **runs**: Number of times to run the test
- **model**: LLM model to use (e.g., `gpt-5.1-2025-11-13`)
- **provider**: LLM provider (e.g., `openai`)
- **expectedToolCalls**: Array of expected tool names to be called
- **selectedServers**: Array of server names from server config
- **advancedConfig**: Additional configuration
  - **instructions**: System instructions for the LLM
  - **temperature**: LLM temperature setting
  - **maxSteps**: Maximum number of tool call steps
  - **toolChoice**: Tool selection strategy (`required`, `auto`)

Example test case:

```json
{
  "title": "Test E-commerce - Amazon product search",
  "query": "Search for wireless headphones on Amazon and show me the top products with reviews",
  "runs": 1,
  "model": "gpt-5.1-2025-11-13",
  "provider": "openai",
  "expectedToolCalls": ["web_data_amazon_product_search"],
  "selectedServers": ["ecommerce-server"],
  "advancedConfig": {
    "instructions": "You are a shopping assistant helping users find products on Amazon",
    "temperature": 0.1,
    "maxSteps": 5,
    "toolChoice": "required"
  }
}
```

## Running Evaluations

### Basic Usage

Run evaluations using the following command format:

```bash
mcpjam evals run -t <tool-groups-file> -e <server-config> -l <llms-config>
```

### Examples

#### 1. E-commerce Tool Group

```bash
mcpjam evals run \
  -t tool-groups.json/tool-groups.ecommerce.json \
  -e server-configs/server-config.ecommerce.json \
  -l llms.json
```

**Expected Output:**
```
Running tests
Connected to 1 server: ecommerce-server
Found 13 total tools
Running 2 tests

Test 1: Test E-commerce - Amazon product search
Using openai:gpt-5.1-2025-11-13

run 1/1
user: Search for wireless headphones on Amazon and show me the top products with reviews
[tool-call] web_data_amazon_product_search
{
  "keyword": "wireless headphones",
  "url": "https://www.amazon.com"
}
[tool-result] web_data_amazon_product_search
{
  "content": [...]
}
assistant: Here are some of the top wireless headphones currently on Amazon...

Expected: [web_data_amazon_product_search]
Actual:   [web_data_amazon_product_search]
PASS (23.8s)
Tokens • input 20923 • output 1363 • total 22286
```

#### 2. Research Tool Group

```bash
mcpjam evals run \
  -t tool-groups.json/tool-groups.research.json \
  -e server-configs/server-config.research.json \
  -l llms.json
```

#### 3. Finance Tool Group

```bash
mcpjam evals run \
  -t tool-groups.json/tool-groups.finance.json \
  -e server-configs/server-config.finance.json \
  -l llms.json
```

## Available Tool Groups

| Tool Group | Description | Example Tools |
|------------|-------------|---------------|
| **ecommerce** | E-commerce platforms (Amazon, Walmart, Best Buy) | `web_data_amazon_product_search` |
| **research** | Research platforms (GitHub, Reuters, academic) | `web_data_github_repository_file`, `web_data_reuter_news` |
| **finance** | Financial data sources | Stock data, market info |
| **social** | Social media platforms | Twitter, LinkedIn, Instagram |
| **business** | Business data and tools | Company information, B2B data |
| **app_stores** | Mobile app store data | iOS App Store, Google Play |
| **browser** | Web browser automation | Page scraping, navigation |
| **advanced_scraping** | Advanced web scraping capabilities | Custom scraping scenarios |

## Understanding Test Results

### Test Output Components

1. **Connection Info**: Shows connected servers and available tools
   ```
   Connected to 1 server: ecommerce-server
   Found 13 total tools
   ```

2. **Test Execution**: Displays each test run with:
   - User query
   - Tool calls made (with parameters)
   - Tool results (truncated)
   - Assistant response

3. **Test Result**: Shows pass/fail status
   ```
   Expected: [web_data_amazon_product_search]
   Actual:   [web_data_amazon_product_search]
   PASS (23.8s)
   ```

4. **Token Usage**: Displays token consumption
   ```
   Tokens • input 20923 • output 1363 • total 22286
   ```

### Success Criteria

A test passes when:
- All expected tools are called
- Tools are called with appropriate parameters
- No errors occur during execution
- Response is generated within timeout

## Customizing Tests

### Adding New Test Cases

1. Edit the relevant tool group file (e.g., `tool-groups.json/tool-groups.ecommerce.json`)
2. Add a new test object with:
   - Descriptive title
   - Clear user query
   - Expected tool calls
   - Appropriate LLM configuration

Example:

```json
{
  "title": "Test E-commerce - Product price tracking",
  "query": "Track the price history for AirPods Pro on Amazon",
  "runs": 1,
  "model": "gpt-5.1-2025-11-13",
  "provider": "openai",
  "expectedToolCalls": ["web_data_amazon_product_search"],
  "selectedServers": ["ecommerce-server"],
  "advancedConfig": {
    "instructions": "You are a price tracking assistant",
    "temperature": 0.1,
    "maxSteps": 5,
    "toolChoice": "required"
  }
}
```

### Adjusting Server Configuration

1. Edit the relevant server config file
2. Modify:
   - URL parameters (groups, browser type)
   - Timeout values
   - Authentication headers

## Troubleshooting

### Common Issues

1. **Server Connection Failed**
   - Verify authorization token is valid
   - Check network connectivity

2. **Tool Not Found**
   - Verify tool group parameter in server URL
   - Ensure MCP server has the required tools loaded
   - Check tool name spelling in expectedToolCalls

3. **Timeout Errors**
   - Increase timeout value in server config
   - Check if query is too complex
   - Verify LLM model is responding

4. **Authentication Errors**
   - Verify API keys in `llms.json`
   - Check authorization bearer token in server config
   - Ensure tokens have not expired

## Best Practices

1. **Start with single tool group** before running comprehensive tests
2. **Monitor token usage** to manage API costs
3. **Use appropriate temperature settings** (lower for deterministic tests)
4. **Set realistic timeouts** based on tool complexity
5. **Validate expectedToolCalls** match actual tool names
6. **Use clear, specific queries** in test cases
7. **Document custom test cases** with descriptive titles

## Resources

- [mcpjam CLI Documentation](https://github.com/mcpjam/inspector)
- [Bright Data MCP Server](https://github.com/brightdata/brightdata-mcp)
- [Model Context Protocol (MCP) Specification](https://modelcontextprotocol.io/)

## Contributing

When adding new test cases:
1. Follow the existing JSON structure
2. Use descriptive titles and clear queries
3. Specify expected tool calls accurately
4. Test with appropriate LLM models
5. Document any special configuration requirements