# Bright Data MCP Tests

This directory contains unit tests for the Bright Data MCP server.

## Prerequisites

- Node.js (v18 or higher recommended)
- npm

## Setup

1. **Install dependencies** from the root directory:

   ```bash
   npm install
   ```

2. **Create a `.env` file** in the root directory with your Bright Data API token:

   ```bash
   # .env
   BRIGHTDATA_API_TOKEN=your_api_token_here
   ```

   You can obtain an API token from the [Bright Data dashboard](https://brightdata.com/cp).

## Running Tests

From the root directory, run:

```bash
npm test
```

This executes `node --test` which discovers and runs all test files in the `test/` directory.