'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {with_server} from './helpers/spawn_server.js';

test('MCP serves session_stats tool over stdio', async()=>{
    await with_server(async({client})=>{
        const tools = await client.listTools();
        assert.ok(tools.tools.some(tool=>tool.name=='session_stats'),
            'session_stats tool available');
        const result = await client.callTool({name: 'session_stats',
            arguments: {}});
        const text_block = result.content.find(block=>block.type=='text');
        assert.ok(text_block, 'session_stats returned text content');
        assert.match(text_block.text, /Tool calls this session:/,
            'session_stats responded with usage summary');
    }, {name: 'server-health-test', network: 'none'});
});
