'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const test_dir = dirname(fileURLToPath(import.meta.url));
const repo_root = resolve(test_dir, '..');

// A thrown Error from a tool can reach the client two ways: as a rejected
// callTool promise, or (as fastmcp does for a plain Error) a resolved result
// with isError:true and the message in the text content. Read whichever it is.
async function tool_error_text(promise){
    try {
        const r = await promise;
        if (r?.isError)
            return (r.content||[]).map(b=>b.text||'').join(' ');
        return null; // resolved successfully -- not an error
    } catch(e){
        return String(e?.message ?? e);
    }
}

// Browser tools used to bypass tool_fn, so they were never rate-limited. After
// wrapping every tool at the addTool chokepoint they must hit check_rate_limit
// like any other tool. Proven network-free: the limiter throws before the tool
// body, so no Bright Data browser session is ever opened.
test('browser tools are subject to RATE_LIMIT (no longer bypass tool_fn)',
    async()=>{
    const env = {
        ...process.env,
        API_TOKEN: 'dummy-token',
        PRO_MODE: 'true',   // registers the browser tools
        RATE_LIMIT: '1/1h', // a single tool call allowed per hour
    };
    const client = new Client(
        {name: 'browser-rate-limit-test', version: '0.0.1'},
        {capabilities: {tools: {}}});
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: ['server.js'],
        cwd: repo_root,
        env,
    });
    try {
        await client.connect(transport);

        // the browser tool we probe must actually be registered
        const tools = await client.listTools();
        assert.ok(tools.tools.some(t=>t.name=='scraping_browser_go_back'),
            'scraping_browser_go_back registered under PRO_MODE');

        // negative control: a normal tool call succeeds and consumes the single
        // slot. If this failed, the later rate-limit error would be meaningless
        // (server broken rather than limiter engaged).
        const first = await client.callTool({name: 'session_stats',
            arguments: {}});
        assert.ok(!first.isError,
            'session_stats should succeed and consume the one rate-limit slot');

        // the browser tool is now rejected by the limiter. Before the fix it
        // bypassed tool_fn and would instead fail fetching browser credentials
        // with the dummy token -- a different error not matching this regex, so
        // this assertion fails on the unfixed code and passes on the fixed code.
        const err = await tool_error_text(client.callTool(
            {name: 'scraping_browser_go_back', arguments: {}}));
        assert.match(err||'', /Rate limit exceeded/,
            'browser tool must hit the rate limiter (now routed through tool_fn)');
    } finally {
        await client.close();
    }
});
