'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {start_stub_server, close_stub_server}
    from '../test-helpers/stub-server.js';

const test_dir = dirname(fileURLToPath(import.meta.url));
const repo_root = resolve(test_dir, '..');

test('tool_fn error boundary sanitizes a single-tool failure whose '
    +'response body is a JSON string, fully offline', async(t)=>{
        const stub = await start_stub_server();
        t.after(()=>close_stub_server(stub));
        const {port} = stub.address();
        const secret_token = 'boundary-canary-token-should-not-leak';
        const env = {
            ...process.env,
            API_TOKEN: secret_token,
            __BRD_TEST_STUB_URL: `http://127.0.0.1:${port}`,
        };
        delete env.PRO_MODE;
        delete env.GROUPS;
        delete env.TOOLS;

        const client = new Client(
            {name: 'tool-error-boundary-test', version: '0.0.1'},
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
            const result = await client.callTool({name: 'scrape_as_markdown',
                arguments: {url: 'https://bad.example/fail'}});
            assert.equal(result.isError, true,
                'scrape_as_markdown must report a tool error for HTTP 400');

            const text_block = result.content.find(block=>block.type=='text');
            assert.ok(text_block, 'the tool error carries text content');

            assert.doesNotMatch(text_block.text, new RegExp(secret_token),
                'tool error text must never contain the API token');
            assert.doesNotMatch(text_block.text,
                new RegExp(`Bearer ${secret_token}`),
                'tool error text must never contain the Authorization '
                +'header value');
            assert.doesNotMatch(text_block.text, /authorization/i,
                'tool error text must never contain request headers');
            assert.doesNotMatch(text_block.text, /"config"/i,
                'tool error text must never contain raw axios config');
            assert.doesNotMatch(text_block.text, /"request"/i,
                'tool error text must never contain a raw axios request '
                +'object');
            assert.doesNotMatch(text_block.text, /"response"/i,
                'tool error text must never contain a raw axios response '
                +'object');

            assert.ok(stub.observed_requests.length>0,
                'the stub actually received the request');
            assert.ok(stub.observed_requests.every(
                req=>req.headers.authorization==`Bearer ${secret_token}`),
                'the tool really sent the API token upstream, proving the '
                +'redaction is meaningful and not just an empty header');
        } finally {
            await client.close();
        }
    });

test('tool_fn error boundary sanitizes a single-tool failure whose '
    +'response body is a JSON object, fully offline', async(t)=>{
        const stub = await start_stub_server();
        t.after(()=>close_stub_server(stub));
        const {port} = stub.address();
        const secret_token = 'boundary-canary-token-should-not-leak';
        const env = {
            ...process.env,
            API_TOKEN: secret_token,
            __BRD_TEST_STUB_URL: `http://127.0.0.1:${port}`,
            TOOLS: 'list_dataset_fields',
        };
        delete env.PRO_MODE;
        delete env.GROUPS;

        const client = new Client(
            {name: 'tool-error-boundary-test', version: '0.0.1'},
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
            const result = await client.callTool({
                name: 'list_dataset_fields',
                arguments: {dataset_id: 'gd_l1viktl72bvl7bjuj0'},
            });
            assert.equal(result.isError, true,
                'list_dataset_fields must report a tool error for HTTP 400');

            const text_block = result.content.find(block=>block.type=='text');
            assert.ok(text_block, 'the tool error carries text content');

            assert.match(text_block.text,
                /Request failed with status code 400/,
                'the sanitized fallback message must surface the HTTP '
                +'failure');
            assert.doesNotMatch(text_block.text, /dataset not found/,
                'the raw response body must never reach the tool output');
            assert.doesNotMatch(text_block.text, /\[object Object\]/,
                'a stringified error object must never reach the tool '
                +'output');

            assert.doesNotMatch(text_block.text, new RegExp(secret_token),
                'tool error text must never contain the API token');
            assert.doesNotMatch(text_block.text,
                new RegExp(`Bearer ${secret_token}`),
                'tool error text must never contain the Authorization '
                +'header value');
            assert.doesNotMatch(text_block.text, /authorization/i,
                'tool error text must never contain request headers');
            assert.doesNotMatch(text_block.text, /"config"/i,
                'tool error text must never contain raw axios config');
            assert.doesNotMatch(text_block.text, /"request"/i,
                'tool error text must never contain a raw axios request '
                +'object');
            assert.doesNotMatch(text_block.text, /"response"/i,
                'tool error text must never contain a raw axios response '
                +'object');

            assert.ok(stub.observed_requests.length>0,
                'the stub actually received the request');
            assert.ok(stub.observed_requests.every(
                req=>req.headers.authorization==`Bearer ${secret_token}`),
                'the tool really sent the API token upstream, proving the '
                +'redaction is meaningful and not just an empty header');
        } finally {
            await client.close();
        }
    });
