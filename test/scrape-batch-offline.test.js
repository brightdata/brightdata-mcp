'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {start_stub_server, close_stub_server}
    from '../test-helpers/stub-server.js';

const test_dir = dirname(fileURLToPath(import.meta.url));
const repo_root = resolve(test_dir, '..');

test('scrape_batch sanitizes a partial batch (one success, one failure) '
    +'fully offline', async(t)=>{
        const stub = await start_stub_server();
        t.after(()=>close_stub_server(stub));
        const {port} = stub.address();
        const secret_token = 'offline-canary-token-should-not-leak';
        const env = {
            ...process.env,
            API_TOKEN: secret_token,
            __BRD_TEST_STUB_URL: `http://127.0.0.1:${port}`,
        };
        delete env.PRO_MODE;
        delete env.GROUPS;
        delete env.TOOLS;

        const client = new Client(
            {name: 'server-health-test', version: '0.0.1'},
            {capabilities: {tools: {}}});
        const transport = new StdioClientTransport({
            command: process.execPath,
            args: ['--import', './test-helpers/redirect-api.mjs',
                'server.js'],
            cwd: repo_root,
            env,
        });
        try {
            await client.connect(transport);
            const tools = await client.listTools();
            assert.ok(tools.tools.some(tool=>tool.name=='scrape_batch'),
                'scrape_batch is available in the default tool set '
                +'without PRO_MODE, GROUPS or TOOLS');

            const result = await client.callTool({name: 'scrape_batch',
                arguments: {urls: ['https://good.example/success',
                    'https://bad.example/fail']}});
            const text_block = result.content.find(block=>block.type=='text');
            assert.ok(text_block, 'scrape_batch returned text content');

            const parsed = JSON.parse(text_block.text);
            assert.equal(parsed.length, 2, 'both URLs produced a result, '
                +'order and partial success are preserved');
            assert.equal(parsed[0].status, 'fulfilled',
                'the first (successful) URL keeps its original position');
            assert.equal(parsed[1].status, 'rejected',
                'the second (failing) URL keeps its original position');

            assert.deepEqual(Object.keys(parsed[0]).sort(),
                ['status', 'value'].sort(),
                'fulfilled entry keeps the allSettled shape');
            assert.equal(typeof parsed[0].value.url, 'string');
            assert.equal(typeof parsed[0].value.content, 'string');

            const rejected = parsed[1];
            assert.equal(typeof rejected.reason, 'string',
                'reason must be a sanitized string, not a raw error object');
            assert.equal(rejected.reason, 'Request failed with status code '
                +'400');
            assert.equal('config' in rejected, false,
                'rejected entry must not carry a raw axios config');
            assert.equal('request' in rejected, false,
                'rejected entry must not carry a raw axios request');
            assert.equal('response' in rejected, false,
                'rejected entry must not carry a raw axios response');

            assert.doesNotMatch(text_block.text, new RegExp(secret_token),
                'result must never contain the API token');
            assert.doesNotMatch(text_block.text,
                new RegExp(`Bearer ${secret_token}`),
                'result must never contain the Authorization header value');
            assert.doesNotMatch(text_block.text, /authorization/i,
                'result must never contain request headers');
            assert.doesNotMatch(text_block.text, /"config"/i,
                'result must never contain raw axios config');
            assert.doesNotMatch(text_block.text, /"request"/i,
                'result must never contain a raw axios request object');

            assert.ok(stub.observed_requests.length>0,
                'the stub actually received requests');
            assert.ok(stub.observed_requests.every(
                req=>req.headers.authorization==`Bearer ${secret_token}`),
                'the tool really sent the API token upstream, proving the '
                +'redaction is meaningful and not just an empty header');
        } finally {
            await client.close();
        }
    });

test('control: an unsanitized Promise.allSettled result really does leak '
    +'the token (proves the old code path was vulnerable)', async()=>{
        const stub = await start_stub_server();
        try {
            const {port} = stub.address();
            const canary_token = 'control-canary-token-must-appear-raw';
            const settled = await Promise.allSettled([
                axios({
                    url: `http://127.0.0.1:${port}/request`,
                    method: 'POST',
                    data: {url: 'https://bad.example/fail'},
                    headers: {authorization: `Bearer ${canary_token}`},
                }),
            ]);
            const raw = JSON.stringify(settled);
            assert.match(raw, new RegExp(canary_token),
                'a raw allSettled serialization leaks the token via '
                +'AxiosError.toJSON(), demonstrating the vulnerability '
                +'the fix closes');
        } finally {
            await close_stub_server(stub);
        }
    });
