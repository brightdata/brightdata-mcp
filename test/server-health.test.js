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
