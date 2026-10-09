'use strict'; /*jslint node:true es9:true*/
// Step 6 -- the controlled 2x2: which tools does a session get?
//
// One variable at a time, a FRESH client and session per cell, so a result can
// be attributed to the auth method rather than to a session established under a
// different URL. The account's entitlement is recorded beside the counts,
// because 5-versus-74 may describe this account rather than the auth method.
//
// Runs whichever rows it can: the API-token row needs only .env; the OAuth row
// needs tokens.json from 03-authorize-and-token.mjs.
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport}
    from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {RESOURCE, HERE, record, draft, secret, redact} from './common.mjs';

const ENV_FILE = process.env.PREFLIGHT_ENV_FILE
    || join(HERE, '..', '..', '.env');
function api_token(){
    // Overridable so the rehearsal can exercise this row against the mock.
    if (process.env.PREFLIGHT_API_TOKEN)
        return secret(process.env.PREFLIGHT_API_TOKEN);
    if (!existsSync(ENV_FILE))
        return null;
    for (const line of readFileSync(ENV_FILE, 'utf8').split('\n'))
    {
        const match = line.match(/^(?:BRIGHTDATA_)?API_TOKEN=(.+)$/);
        if (match)
            return secret(match[1].trim().replace(/^["']|["']$/g, ''));
    }
    return null;
}

const TOKENS = join(HERE, 'tokens.json');
const oauth_token = existsSync(TOKENS)
    ? secret(JSON.parse(readFileSync(TOKENS, 'utf8')).access_token) : null;

// A fresh Client and a fresh transport per cell: the transport keeps an
// mcp-session-id after initialize, and reusing one across URLs would let a
// session established under the first answer for the second.
async function count_tools(url, token, label){
    const client = new Client({name: `preflight-${label}`, version: '0.0.1'},
        {capabilities: {tools: {}}});
    const transport = new StreamableHTTPClientTransport(new URL(url),
        {requestInit: {headers: {Authorization: `Bearer ${token}`}}});
    try {
        await client.connect(transport);
        const {tools} = await client.listTools();
        const server = client.getServerVersion();
        return {ok: true, count: tools.length,
            names_sample: tools.slice(0, 3).map(t=>t.name),
            has_web_data: tools.some(t=>t.name.startsWith('web_data_')),
            server: `${server?.name} ${server?.version}`};
    } catch(e){
        return {ok: false, error: redact(e?.message ?? String(e)).slice(0, 200)};
    } finally {
        await client.close().catch(()=>{});
    }
}

const evidence = {ran_at: new Date().toISOString(), cells: {}};
const rows = [
    ['api_token', api_token()],
    ['oauth_token', oauth_token],
];
const columns = [
    ['plain', RESOURCE],
    ['pro', `${RESOURCE}?pro=1`],
];

console.log('=== The 2x2: {API token, OAuth token} x {/mcp, /mcp?pro=1} ===');
console.log('    fresh client and session per cell\n');
for (const [row, token] of rows)
{
    for (const [column, url] of columns)
    {
        const key = `${row}__${column}`;
        if (!token)
        {
            evidence.cells[key] = {skipped: true,
                reason: row==='oauth_token'
                    ? 'no tokens.json yet -- run 03-authorize-and-token.mjs'
                    : 'no API token in .env'};
            console.log(`  ${row.padEnd(12)} ${column.padEnd(6)} -- skipped `
                +`(${evidence.cells[key].reason})`);
            continue;
        }
        const result = await count_tools(url, token, key);
        evidence.cells[key] = {url, ...result};
        console.log(`  ${row.padEnd(12)} ${column.padEnd(6)} -> `
            +(result.ok
                ? `${String(result.count).padStart(3)} tools  (${result.server}, `
                    +`web_data_*: ${result.has_web_data})`
                : `FAILED: ${result.error}`));
    }
}

// One cheap read-only call to prove the token authorises execution, not just
// listing. Nothing that starts a collection job.
if (oauth_token)
{
    console.log('\n  proving the OAuth token authorises execution (search_engine)...');
    const client = new Client({name: 'preflight-call', version: '0.0.1'},
        {capabilities: {tools: {}}});
    const transport = new StreamableHTTPClientTransport(new URL(`${RESOURCE}?pro=1`),
        {requestInit: {headers: {Authorization: `Bearer ${oauth_token}`}}});
    const started = Date.now();
    try {
        await client.connect(transport);
        const result = await client.callTool({name: 'search_engine',
            arguments: {query: 'bright data', engine: 'google'}});
        evidence.tool_call = {ok: !result.isError,
            ms: Date.now()-started,
            bytes: JSON.stringify(result.content ?? '').length};
        console.log(`  -> ${evidence.tool_call.ok ? 'ok' : 'error'} in `
            +`${evidence.tool_call.ms}ms, ${evidence.tool_call.bytes} bytes`);
    } catch(e){
        evidence.tool_call = {ok: false, error: redact(e?.message ?? String(e)).slice(0, 200)};
        console.log(`  -> failed: ${evidence.tool_call.error}`);
    } finally {
        await client.close().catch(()=>{});
    }
}

record('05-usage', evidence);

const cell = key=>{
    const c = evidence.cells[key];
    if (!c) return 'not run';
    if (c.skipped) return '_not yet_';
    return c.ok ? `**${c.count}**` : `failed: ${c.error}`;
};
draft(`## Step 6 — Which tools does a session get? (${evidence.ran_at.slice(0, 10)})

A fresh client and session per cell, so no result is answered by a session established under another
URL. Counts describe **this account's entitlement**; a reviewer's demo account is a different account.

| | \`https://mcp.brightdata.com/mcp\` | \`…/mcp?pro=1\` |
|---|---|---|
| API token | ${cell('api_token__plain')} | ${cell('api_token__pro')} |
| OAuth token | ${cell('oauth_token__plain')} | ${cell('oauth_token__pro')} |

${evidence.tool_call
    ? `A read-only \`search_engine\` call over the OAuth token ${evidence.tool_call.ok
        ? `succeeded in ${evidence.tool_call.ms}ms` : 'failed: '+evidence.tool_call.error}, so the token authorises execution and not merely listing.`
    : '_The OAuth row and the tool call still need a token._'}

Note on mechanism: the MCP SDK always sends the metadata's canonical \`resource\`
(\`${RESOURCE}\`) regardless of which URL it connects to, because \`selectResourceURL\` returns the
metadata value and \`checkResourceAllowed\` compares origin and path while ignoring query strings. So
this table measures what the **server** enforces, not what the client sends.

Shelf life: the free/pro split is being deprecated. This measures today's behaviour; the R&D owner
should confirm what an OAuth session is *intended* to expose afterwards.
`);
