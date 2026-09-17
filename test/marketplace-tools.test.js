'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {MARKETPLACE_DATASET_IDS} from '../marketplace_datasets.js';

const test_dir = dirname(fileURLToPath(import.meta.url));
const repo_root = resolve(test_dir, '..');

let tools_cache = null;
async function get_tools(){
    if (tools_cache)
        return tools_cache;
    const client = new Client({name: 'marketplace-tools-test', version: '0.0.1'},
        {capabilities: {tools: {}}});
    const transport = new StdioClientTransport({
        command: process.execPath, args: ['server.js'], cwd: repo_root,
        env: {...process.env, API_TOKEN: 'dummy-token', PRO_MODE: 'true'},
    });
    try {
        await client.connect(transport);
        const {tools} = await client.listTools();
        tools_cache = tools;
        return tools;
    } finally {
        await client.close();
    }
}

test('the three marketplace tools are registered', async()=>{
    const names = new Set((await get_tools()).map(t=>t.name));
    for (const n of ['list_marketplace_datasets', 'query_dataset',
        'collect_dataset'])
    {
        assert.ok(names.has(n), `${n} registered`);
    }
    assert.ok(names.has('search_dataset'), 'search_dataset still registered');
});

// The bounding decision: a model must always choose a limit, so it can never
// silently receive a truncated answer it did not ask for.
test('query_dataset requires records_limit and caps it at 25', async()=>{
    const q = (await get_tools()).find(t=>t.name=='query_dataset');
    assert.ok(q.inputSchema.required?.includes('records_limit'),
        'records_limit must be required -- adding a default would break this');
    assert.equal(q.inputSchema.properties.records_limit.maximum, 25);
    assert.ok(!q.inputSchema.required?.includes('fields'), 'fields optional');
});

// MCP clients cancel requests at DEFAULT_REQUEST_TIMEOUT_MSEC (60s), so a
// single call must never wait longer than that -- the reason the query is
// split into start + collect at all.
test('collect_dataset cannot wait past the client request timeout', async()=>{
    const c = (await get_tools()).find(t=>t.name=='collect_dataset');
    const wait = c.inputSchema.properties.wait_seconds;
    assert.ok(wait.maximum<=45,
        `wait_seconds max must stay under the 60s client timeout, got ${wait.maximum}`);
    assert.ok(wait.default<=30, `default should be comfortably lower, got ${wait.default}`);
});

// The standing-context decision: the catalog is served on demand, so no tool
// schema may inline all 169 dataset ids.
test('dataset ids are not enumerated in any tool schema', async()=>{
    const tools = await get_tools();
    for (const name of ['query_dataset', 'list_dataset_fields'])
    {
        const prop = tools.find(t=>t.name==name)
            .inputSchema.properties.dataset_id;
        assert.equal(prop.type, 'string');
        assert.ok(!prop.enum, `${name}.dataset_id must not be an enum`);
    }
    const blob = JSON.stringify(tools);
    const inlined = MARKETPLACE_DATASET_IDS
        .filter(id=>blob.includes(id)).length;
    assert.ok(inlined<=3, `at most a few example ids may appear, saw ${inlined}`);
});

// Tool schemas are permanent context for every session, so guard against
// creep. Reference points when this was written: query_dataset was 3283 bytes
// -- smaller than the existing search_dataset (3479), half of each being the
// shared filter schema (1641) -- plus collect_dataset 852 and
// list_marketplace_datasets 573, for 4708 total. Inlining the 169-dataset
// catalog instead (the design this replaced) would have cost ~6900.
test('the new tools stay within their context budget', async()=>{
    const tools = await get_tools();
    const bytes = ['list_marketplace_datasets', 'query_dataset',
        'collect_dataset']
        .map(n=>tools.find(t=>t.name==n))
        .reduce((sum, t)=>sum+JSON.stringify(t).length, 0);
    assert.ok(bytes<5000,
        `three tools should stay small in context, got ${bytes} bytes`);
    const search_dataset_bytes = JSON.stringify(
        tools.find(t=>t.name=='search_dataset')).length;
    const query_bytes = JSON.stringify(
        tools.find(t=>t.name=='query_dataset')).length;
    assert.ok(query_bytes<=search_dataset_bytes,
        'query_dataset must not be heavier than the tool it generalises');
});

test('the catalog is non-trivial and every id looks well-formed', ()=>{
    assert.ok(MARKETPLACE_DATASET_IDS.length>50,
        `expected a substantial verified catalog, got ${MARKETPLACE_DATASET_IDS.length}`);
    for (const id of MARKETPLACE_DATASET_IDS)
        assert.match(id, /^gd_[a-z0-9]+$/, id);
});
