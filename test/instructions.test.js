'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import url from 'node:url';
import {dirname, resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {start_stub_server, close_stub_server}
    from '../test-helpers/stub-server.js';

const repo_root = resolve(dirname(url.fileURLToPath(import.meta.url)), '..');

test('server sends instructions and makes no CAPTCHA claims', async t=>{
    const stub = await start_stub_server();
    t.after(()=>close_stub_server(stub));
    const env = {...process.env, API_TOKEN: 'instructions-test-token',
        __BRD_TEST_STUB_URL: `http://127.0.0.1:${stub.address().port}`};
    delete env.GROUPS;
    delete env.TOOLS;
    const client = new Client({name: 'instructions-test', version: '0'},
        {capabilities: {tools: {}}});
    t.after(()=>client.close());
    await client.connect(new StdioClientTransport({cwd: repo_root, env,
        command: process.execPath,
        args: ['--import', './test-helpers/redirect-api.mjs', 'server.js']}));
    const instructions = client.getInstructions();
    assert.match(instructions, /search_scrapers/);
    assert.ok(instructions.length<=512, `${instructions.length} chars`);
    for (const {name, description} of (await client.listTools()).tools)
        assert.doesNotMatch(description, /captcha|bot detection/i, name);
});
