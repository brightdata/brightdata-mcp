'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {start_stub_server, stub_env, close_stub_server}
    from '../test-helpers/stub-server.js';

const test_dir = dirname(fileURLToPath(import.meta.url));
const repo_root = resolve(test_dir, '..');

test('scrape_batch is available without PRO_MODE and sanitizes a partial '
    +'batch (one success, one failure) fully offline', async(t)=>{
        const stub = await start_stub_server();
        t.after(()=>close_stub_server(stub));
        const secret_token = 'offline-canary-token-should-not-leak';
        const env = stub_env(stub, {API_TOKEN: secret_token});
        delete env.PRO_MODE;
        delete env.GROUPS;
        delete env.TOOLS;

        const client = new Client(
            {name: 'server-health-test', version: '0.0.1'},
            {capabilities: {tools: {}}});
        const transport = new StdioClientTransport({
            command: process.execPath,
            args: ['server.js'],
            cwd: repo_root,
            env,
        });
        try {
            await client.connect(transport);
            const tools = await client.listTools();
            assert.ok(tools.tools.some(tool=>tool.name=='scrape_batch'),
                'scrape_batch is available in the default tool set '
                +'without PRO_MODE');

            const result = await client.callTool({name: 'scrape_batch',
                arguments: {urls: ['https://good.example/success',
                    'https://bad.example/fail']}});
            const text_block = result.content.find(block=>block.type=='text');
            assert.ok(text_block, 'scrape_batch returned text content');

            const parsed = JSON.parse(text_block.text);
            assert.equal(parsed.length, 2, 'both URLs produced a result');
            assert.ok(parsed.some(r=>r.status=='fulfilled'),
                'the successful URL is reported as fulfilled');

            const rejected = parsed.find(r=>r.status=='rejected');
            assert.ok(rejected, 'the failing URL is reported as rejected');
            assert.equal(typeof rejected.reason, 'string',
                'reason must be a sanitized string, not a raw error object');
            assert.match(rejected.reason, /^HTTP 400/,
                'reason must carry the sanitized HTTP status');
            assert.equal('config' in rejected, false,
                'rejected entry must not carry a raw axios config');
            assert.equal('request' in rejected, false,
                'rejected entry must not carry a raw axios request');

            assert.equal(stub.observed_requests.length, 2,
                'the stub actually received both requests');
            assert.ok(stub.observed_requests.every(
                req=>req.headers.authorization==`Bearer ${secret_token}`),
                'the tool really sent the API token upstream, proving the '
                +'redaction is meaningful and not just an empty header');

            assert.doesNotMatch(text_block.text, new RegExp(secret_token),
                'result must never contain the API token');
            assert.doesNotMatch(text_block.text, /authorization/i,
                'result must never contain request headers');
            assert.doesNotMatch(text_block.text, /"config"/i,
                'result must never contain raw axios config');
            assert.doesNotMatch(text_block.text, /"request"/i,
                'result must never contain a raw axios request object');
        } finally {
            await client.close();
        }
    });

