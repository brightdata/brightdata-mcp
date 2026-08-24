'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {DATASET_INPUT_DESCRIPTIONS} from '../dataset_inputs.js';

const test_dir = dirname(fileURLToPath(import.meta.url));
const repo_root = resolve(test_dir, '..');

// The datasets table lives inside server.js (unimportable without its
// bootstrap), so coverage is checked against the source text: collect every
// input name from the table's `inputs: [...]` arrays (all single-line).
function table_input_names(){
    const src = readFileSync(resolve(repo_root, 'server.js'), 'utf8');
    const names = new Set();
    for (const m of src.matchAll(/inputs:\s*\[([^\]]*)\]/g))
        for (const q of m[1].matchAll(/'([^']+)'/g))
            names.add(q[1]);
    return names;
}

test('every dataset input has a description, and no orphan entries', ()=>{
    const names = table_input_names();
    assert.ok(names.size>0, 'found the datasets table inputs');
    for (const name of names)
        assert.ok(DATASET_INPUT_DESCRIPTIONS[name],
            `input "${name}" needs an entry in DATASET_INPUT_DESCRIPTIONS`);
    for (const key of Object.keys(DATASET_INPUT_DESCRIPTIONS))
        assert.ok(names.has(key),
            `map entry "${key}" matches no dataset input (stale?)`);
});

test('description texts carry their load-bearing properties', ()=>{
    for (const [name, text] of Object.entries(DATASET_INPUT_DESCRIPTIONS))
        assert.ok(text.length>=20, `"${name}" description is non-trivial`);
    for (const name of ['num_of_reviews', 'days_limit', 'num_of_comments',
        'days_back'])
    {
        assert.match(DATASET_INPUT_DESCRIPTIONS[name], /numeric string/,
            `"${name}" must state the numeric-string wire format`);
    }
    for (const name of ['start_date', 'end_date', 'days_back'])
    {
        assert.match(DATASET_INPUT_DESCRIPTIONS[name], /empty string/,
            `"${name}" must explain its empty-string default`);
    }
});

// End-to-end: the descriptions must actually reach MCP clients. Generated
// inputs had NO description field before this fix (verified:
// days_back was exactly {"type":"string","default":""}), so this test fails
// on the unfixed code and passes after the loop attaches .describe().
test('generated tools expose input descriptions over tools/list', async()=>{
    const client = new Client(
        {name: 'dataset-inputs-test', version: '0.0.1'},
        {capabilities: {tools: {}}});
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: ['server.js'],
        cwd: repo_root,
        env: {...process.env, API_TOKEN: 'dummy-token', PRO_MODE: 'true'},
    });
    try {
        await client.connect(transport);
        const {tools} = await client.listTools();
        const prop = (tool_name, input)=>tools
            .find(t=>t.name==tool_name)?.inputSchema?.properties?.[input];
        assert.equal(prop('web_data_reddit_comments', 'days_back')?.description,
            DATASET_INPUT_DESCRIPTIONS.days_back);
        assert.equal(
            prop('web_data_google_maps_reviews', 'days_limit')?.description,
            DATASET_INPUT_DESCRIPTIONS.days_limit);
        assert.equal(
            prop('web_data_google_maps_reviews', 'url')?.description,
            DATASET_INPUT_DESCRIPTIONS.url);
        assert.equal(prop('web_data_reddit_comments', 'days_back')?.default,
            '', 'defaults still surface alongside descriptions');
    } finally {
        await client.close();
    }
});
