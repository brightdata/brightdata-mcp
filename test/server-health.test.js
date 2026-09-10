'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const test_dir = dirname(fileURLToPath(import.meta.url));
const repo_root = resolve(test_dir, '..');

test('MCP serves session_stats tool over stdio', async()=>{
    const env = {
        ...process.env,
        API_TOKEN: 'dummy-token',
        PRO_MODE: 'true',
    };
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
        assert.ok(tools.tools.some(tool=>tool.name=='session_stats'),
            'session_stats tool available');
        const result = await client.callTool({name: 'session_stats',
            arguments: {}});
        const text_block = result.content.find(block=>block.type=='text');
        assert.ok(text_block, 'session_stats returned text content');
        assert.match(text_block.text, /Tool calls this session:/,
            'session_stats responded with usage summary');
    } finally {
        await client.close();
    }
});

test('scrape_batch never leaks the API token when a request fails',
    async()=>{
        const secret_token = 'super-secret-test-token-should-not-leak';
        const env = {
            ...process.env,
            API_TOKEN: secret_token,
            PRO_MODE: 'true',
        };
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
            const result = await client.callTool({name: 'scrape_batch',
                arguments: {urls: ['https://example.invalid/']}});
            const text_block = result.content.find(block=>block.type=='text');
            assert.ok(text_block, 'scrape_batch returned text content');
            assert.doesNotMatch(text_block.text,
                new RegExp(secret_token),
                'scrape_batch result must never contain the API token');
            assert.doesNotMatch(text_block.text, /authorization/i,
                'scrape_batch result must never contain request headers');
        } finally {
            await client.close();
        }
    });

test('tool_fn boundary never leaks the API token for any failing tool '
    +'(centralized protection)', async()=>{
        const secret_token = 'super-secret-boundary-token-should-not-leak';
        const env = {
            ...process.env,
            API_TOKEN: secret_token,
            PRO_MODE: 'true',
        };
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
            const result = await client.callTool({name: 'scrape_as_markdown',
                arguments: {url: 'https://example.invalid/'}});
            assert.equal(result.isError, true,
                'scrape_as_markdown should report a tool error');
            const text_block = result.content.find(block=>block.type=='text');
            assert.ok(text_block, 'scrape_as_markdown returned text content');
            assert.doesNotMatch(text_block.text,
                new RegExp(secret_token),
                'tool error text must never contain the API token');
            assert.doesNotMatch(text_block.text, /authorization/i,
                'tool error text must never contain request headers');
            assert.doesNotMatch(text_block.text, /"config"/i,
                'tool error text must never contain raw axios config');
        } finally {
            await client.close();
        }
    });

