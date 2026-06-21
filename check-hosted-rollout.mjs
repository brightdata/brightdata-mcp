// Polls the hosted Bright Data MCP endpoint until web_data_reddit_comments appears.
// Usage: BRIGHTDATA_TOKEN=xxx node check-hosted-rollout.mjs
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const token = process.env.BRIGHTDATA_TOKEN;
if (!token) { console.error('Set BRIGHTDATA_TOKEN'); process.exit(1); }

const TARGET = 'web_data_reddit_comments';
// tools= forces just that one tool, so a hit means the deployment knows about it.
const url = `https://mcp.brightdata.com/sse?token=${token}&tools=${TARGET}`;
const INTERVAL_MS = 30_000;

async function listTools() {
  const client = new Client({ name: 'rollout-check', version: '1.0.0' }, { capabilities: {} });
  const transport = new SSEClientTransport(new URL(url));
  await client.connect(transport);
  const { tools } = await client.listTools();
  await client.close();
  return tools.map(t => t.name);
}

async function once() {
  try {
    const names = await listTools();
    const found = names.includes(TARGET);
    console.log(`[${new Date().toISOString()}] tools=${names.length} | ${TARGET}: ${found ? 'PRESENT ✅' : 'absent'}`);
    return found;
  } catch (e) {
    console.log(`[${new Date().toISOString()}] probe error: ${e.message}`);
    return false;
  }
}

while (true) {
  if (await once()) { console.log('Rolled out — hosted endpoint now exposes', TARGET); break; }
  await new Promise(r => setTimeout(r, INTERVAL_MS));
}
