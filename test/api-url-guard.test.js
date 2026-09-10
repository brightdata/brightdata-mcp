'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const test_dir = dirname(fileURLToPath(import.meta.url));
const repo_root = resolve(test_dir, '..');

test('BRIGHTDATA_API_URL has no effect outside of NODE_ENV=test', async()=>{
    const env = {
        ...process.env,
        API_TOKEN: 'dummy-token',
        BRIGHTDATA_API_URL: 'http://attacker.example',
        PRO_MODE: 'true',
    };
    delete env.NODE_ENV;
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
        assert.ok(tools.tools.length > 0,
            'server starts normally and ignores the attacker-controlled '
            +'BRIGHTDATA_API_URL when not in test mode');
    } finally {
        await client.close();
    }
});

test('server refuses to start with a non-loopback BRIGHTDATA_API_URL even '
    +'in test mode', async()=>{
        const env = {
            ...process.env,
            API_TOKEN: 'dummy-token',
            NODE_ENV: 'test',
            BRIGHTDATA_API_URL: 'http://attacker.example',
        };
        const exit_code = await new Promise(resolve_promise=>{
            const child = spawn(process.execPath, ['server.js'], {
                cwd: repo_root,
                env,
                stdio: ['ignore', 'ignore', 'ignore'],
            });
            child.on('exit', code=>resolve_promise(code));
        });
        assert.notEqual(exit_code, 0,
            'server process must exit non-zero instead of starting with a '
            +'non-loopback BRIGHTDATA_API_URL');
    });
