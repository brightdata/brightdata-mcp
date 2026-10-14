'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const test_dir = dirname(fileURLToPath(import.meta.url));
const repo_root = resolve(test_dir, '..');

// A hung Bright Data API used to freeze startup forever: the zone bootstrap
// runs before the MCP handshake, and its axios calls had no timeout. Point
// the spawned server's HTTPS_PROXY at a blackhole (accepts connections,
// never responds) so the zone GET hangs, and prove the server still boots
// and serves tools/list within the bound. On the unfixed code the handshake
// never happens and this test fails on its own timeout; the stdio pipe
// between test and server is proxy-immune.
test('startup survives a hung zone API (bounded bootstrap)',
    {timeout: 15000}, async()=>{
    const blackhole = net.createServer(()=>{
        // hold the socket open, never write a byte
    });
    await new Promise(resolve_listen=>
        blackhole.listen(0, '127.0.0.1', resolve_listen));
    const port = blackhole.address().port;
    const client = new Client(
        {name: 'zone-timeout-test', version: '0.0.1'},
        {capabilities: {tools: {}}});
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: ['server.js'],
        cwd: repo_root,
        env: {
            ...process.env,
            API_TOKEN: 'dummy-token',
            PRO_MODE: 'true',
            BASE_TIMEOUT: '2',  // shrink the bound so the test runs fast
            HTTPS_PROXY: `http://127.0.0.1:${port}`,
            https_proxy: `http://127.0.0.1:${port}`,
            // a dev shell's no-proxy rules must not bypass the blackhole
            NO_PROXY: '',
            no_proxy: '',
        },
    });
    try {
        // Race the handshake so a hung (unfixed) server produces a bounded
        // assertion failure -- and the finally below still kills the child,
        // letting the test runner exit instead of lingering on its pipes.
        const winner = await Promise.race([
            client.connect(transport).then(()=>'connected', e=>{
                throw e;
            }),
            new Promise(resolve_race=>{
                // unref'd so a passing run exits immediately; on a hung
                // (unfixed) server the child's pipes keep the loop alive,
                // so the sentinel still fires
                setTimeout(()=>resolve_race('hung'), 10000).unref();
            }),
        ]);
        assert.equal(winner, 'connected',
            'server did not complete the MCP handshake within 10s -- the '
            +'zone bootstrap is unbounded');
        const tools = await client.listTools();
        assert.ok(tools.tools.some(t=>t.name=='session_stats'),
            'server booted and serves tools despite the hung zone API');
    } finally {
        await transport.close().catch(()=>{});
        blackhole.close();
    }
});
