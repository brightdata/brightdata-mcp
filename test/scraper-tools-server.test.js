'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import url from 'node:url';
import {dirname, resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {start_stub_server, close_stub_server}
    from '../test-helpers/stub-server.js';
import {scraper_tool_names} from '../scraper_tools.js';

const repo_root = resolve(dirname(url.fileURLToPath(import.meta.url)), '..');

const call = async(client, name, args)=>{
    const res = await client.callTool({name, arguments: args});
    const text = res.content.find(b=>b.type=='text').text;
    return {error: res.isError, text,
        data: res.isError ? null : JSON.parse(text)};
};

test('scraper tools are on by default and run end to end', async t=>{
    const stub = await start_stub_server();
    t.after(()=>close_stub_server(stub));
    const env = {...process.env, API_TOKEN: 'scraper-test-token',
        __BRD_TEST_STUB_URL: `http://127.0.0.1:${stub.address().port}`};
    delete env.PRO_MODE;
    delete env.GROUPS;
    delete env.TOOLS;
    const client = new Client({name: 'scraper-tools-test', version: '0'},
        {capabilities: {tools: {}}});
    t.after(()=>client.close());
    await client.connect(new StdioClientTransport({cwd: repo_root, env,
        command: process.execPath,
        args: ['--import', './test-helpers/redirect-api.mjs', 'server.js']}));
    const names = (await client.listTools()).tools.map(x=>x.name);
    for (const name of scraper_tool_names)
        assert.ok(names.includes(name), `${name} listed`);
    assert.deepEqual((await call(client, 'search_scrapers',
        {query: 'amazon'})).data.map(s=>s.dataset_id), ['gd_rev']);
    const bad = await call(client, 'get_scraper_details',
        {dataset_id: 'gd_nope', method: 'collect_by_url'});
    assert.ok(bad.error);
    assert.match(bad.text, /Unknown dataset_id gd_nope/);
    const run = await call(client, 'run_scraper', {dataset_id: 'gd_rev',
        method: 'collect_by_url', input: [{url: 'https://amazon.com/r'}]});
    assert.deepEqual(run.data, {snapshot_id: 's_1', status: 'ready',
        data: [{rating: 5}]});
    const trigger = stub.observed_requests.find(r=>r.url);
    assert.equal(trigger.headers.authorization, 'Bearer scraper-test-token');
    assert.equal(trigger.headers['x-mcp-tool'], 'run_scraper');
    assert.deepEqual((await call(client, 'refresh_scrapers', {})).data,
        {scrapers: 1});
});
