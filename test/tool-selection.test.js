'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const test_dir = dirname(fileURLToPath(import.meta.url));
const repo_root = resolve(test_dir, '..');

async function list_tool_names(extra_env){
    const client = new Client(
        {name: 'tool-selection-test', version: '0.0.1'},
        {capabilities: {tools: {}}});
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: ['server.js'],
        cwd: repo_root,
        env: {...process.env, API_TOKEN: 'dummy-token', ...extra_env},
    });
    try {
        await client.connect(transport);
        const tools = await client.listTools();
        return new Set(tools.tools.map(t=>t.name));
    } finally {
        await client.close();
    }
}

// The headline fix: PRO_MODE used to be a strict === 'true', so an uppercase
// TRUE silently fell back to the five default tools. session_stats is not one
// of the five defaults, so its presence discriminates fixed from unfixed.
test('PRO_MODE=TRUE (uppercase) enables pro mode', async()=>{
    const names = await list_tool_names({PRO_MODE: 'TRUE'});
    assert.ok(names.has('session_stats'),
        'session_stats registers only in pro mode -- PRO_MODE=TRUE must count');
    assert.ok(names.has('scraping_browser_navigate'),
        'browser tools register in pro mode');
});

// The selection branch, end-to-end through the edited addTool: a group's tools
// register, and tools outside the group (session_stats) do not.
test('GROUPS=ecommerce registers that group and nothing else', async()=>{
    const names = await list_tool_names({GROUPS: 'ecommerce'});
    assert.ok(names.has('web_data_amazon_product'),
        'ecommerce group tool registered');
    assert.ok(names.has('search_engine'), 'base tool included in the group');
    assert.ok(!names.has('session_stats'),
        'tools outside the selected group are not registered');
});
