'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const test_dir = dirname(fileURLToPath(import.meta.url));
const repo_root = resolve(test_dir, '..');

test('geo_fanout tool is registered and well-formed over stdio', async()=>{
    const env = {
        ...process.env,
        API_TOKEN: 'dummy-token',
        PRO_MODE: 'true',
    };
    const client = new Client(
        {name: 'geo-fanout-test', version: '0.0.1'},
        {capabilities: {tools: {}}});
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: ['server.js'],
        cwd: repo_root,
        env,
    });
    try {
        await client.connect(transport);
        const {tools} = await client.listTools();
        const geo_fanout = tools.find(tool=>tool.name=='geo_fanout');
        assert.ok(geo_fanout, 'geo_fanout tool is exposed');
        assert.match(geo_fanout.description, /first-class/i,
            'description documents first-class classified results');
        const props = geo_fanout.inputSchema?.properties || {};
        assert.ok(props.url, 'geo_fanout exposes a url parameter');
        assert.ok(props.countries, 'geo_fanout exposes a countries parameter');
    } finally {
        await client.close();
    }
});
