'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import url from 'node:url';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const repo_root = resolve(dirname(url.fileURLToPath(import.meta.url)), '..');
const clean_env = Object.fromEntries(Object.entries(process.env)
    .filter(([k])=>!/^npm_/i.test(k) && k!='GROUPS' && k!='TOOLS'));
const npm = (args, cwd)=>execFileSync('npm', args, {cwd, encoding: 'utf8',
    env: {...clean_env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1'}});

test('the packed npm package installs, starts and lists its tools',
    {timeout: 300000}, async t=>{
    const dir = mkdtempSync(join(tmpdir(), 'brd-mcp-packed-'));
    t.after(()=>rmSync(dir, {recursive: true, force: true}));
    const [{filename}] = JSON.parse(npm(['pack', '--json',
        '--pack-destination', dir], repo_root));
    npm(['install', '--prefer-offline', '--no-audit', '--no-fund',
        join(dir, filename)], dir);
    const client = new Client({name: 'packed-install-test', version: '0'},
        {capabilities: {tools: {}}});
    try {
        await client.connect(new StdioClientTransport({cwd: dir,
            command: process.execPath,
            args: [join(dir, 'node_modules/@brightdata/mcp/server.js')],
            env: {...clean_env, API_TOKEN: 'packed-install-test'}}));
        const {tools} = await client.listTools();
        assert.ok(tools.some(x=>x.name=='ask_brightdata_assistant'),
            'ask_brightdata_assistant (sophie_assistant.js) is served');
    } finally {
        await client.close();
    }
});
