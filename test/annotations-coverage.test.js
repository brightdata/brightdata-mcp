'use strict'; /*jslint node:true es9:true*/
// What the server actually advertises, checked against OpenAI's plugin-review
// definitions of the three MCP annotation hints.
//
// This file deliberately imports nothing from tool_annotations.js: it asserts
// only what a client can observe, so a change inside the module can never move
// the expectations with it, and the file still loads (and fails honestly) on a
// tree where the module does not exist yet.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve, join} from 'node:path';
import {list_tools, with_server, with_hosted_server}
    from './helpers/spawn_server.js';

const test_dir = dirname(fileURLToPath(import.meta.url));
const repo_root = resolve(test_dir, '..');
const HINTS = ['readOnlyHint', 'openWorldHint', 'destructiveHint'];

// Every tool the server can register, by behaviour. A tool absent from here
// fails the set-equality check below, so a new tool cannot ship unclassified.
const GOLDEN = {
    // Synchronous /request call: reads the public web, nothing persists.
    search_engine: 'sync_fetch',
    search_engine_batch: 'sync_fetch',
    scrape_as_markdown: 'sync_fetch',
    scrape_as_html: 'sync_fetch',
    scrape_batch: 'sync_fetch',
    extract: 'sync_fetch',
    // Starts a persistent, billed collection job (plus every web_data_* tool,
    // matched by prefix below).
    discover: 'job_start',
    // Talks only to Bright Data's own API or to in-process state.
    list_dataset_fields: 'closed_read',
    search_dataset: 'closed_read',
    session_stats: 'closed_read',
    // Browser: reads the current page of the session.
    scraping_browser_snapshot: 'browser_read',
    scraping_browser_screenshot: 'browser_read',
    scraping_browser_get_html: 'browser_read',
    scraping_browser_get_text: 'browser_read',
    scraping_browser_network_requests: 'browser_read',
    scraping_browser_wait_for_ref: 'browser_read',
    // Browser: moves the session between public pages.
    scraping_browser_navigate: 'browser_navigate',
    scraping_browser_go_back: 'browser_navigate',
    scraping_browser_go_forward: 'browser_navigate',
    scraping_browser_scroll: 'browser_scroll',
    scraping_browser_scroll_to_ref: 'browser_scroll',
    // Browser: acts on an arbitrary third-party page.
    scraping_browser_click_ref: 'browser_act',
    scraping_browser_type_ref: 'browser_act',
    scraping_browser_fill_form: 'browser_fill',
};
const class_of = name=>name.startsWith('web_data_') ? 'job_start' : GOLDEN[name];

// The values each class must advertise, pinned here as literals rather than
// imported: flipping a decision is then two deliberate edits (module + test),
// and the test edit is the reviewer's signal that a value moved.
//                     readOnly openWorld destructive
const EXPECTED = {
    sync_fetch: [true, true, false],
    // DECISION (see desc.md): OpenAI's definition sets readOnlyHint false for
    // anything that can "run jobs, start workflows". These 51 tools create a
    // billed snapshot in the user's account. They harm nothing, so they are
    // not destructive.
    job_start: [false, true, false],
    closed_read: [true, false, false],
    browser_read: [true, false, false],
    browser_navigate: [false, true, false],
    browser_scroll: [false, false, false],
    browser_act: [false, true, true],
    browser_fill: [false, true, false],
};

let cached = null;
async function tools(){
    if (!cached)
        cached = await list_tools({name: 'annotations-test', network: 'none'});
    return cached;
}

function describe(tool){
    return HINTS.map(hint=>`${hint}=${tool.annotations?.[hint]}`).join(' ');
}

test('every tool advertises all three hints and a title', async()=>{
    const listed = await tools();
    const incomplete = listed.filter(tool=>
        HINTS.some(hint=>typeof tool.annotations?.[hint]!='boolean')
        || !tool.annotations?.title);
    assert.deepEqual(incomplete.map(tool=>`${tool.name}: ${describe(tool)}`
        +`${tool.annotations?.title ? '' : ' (no title)'}`), [],
        `${incomplete.length} of ${listed.length} tools are incomplete`);
});

test('every advertised tool is classified, and every classified tool exists',
    async()=>{
    const listed = (await tools()).map(tool=>tool.name);
    const unclassified = listed.filter(name=>!class_of(name));
    assert.deepEqual(unclassified, [],
        'advertised but missing from GOLDEN -- classify it');
    const advertised = new Set(listed);
    const stale = Object.keys(GOLDEN).filter(name=>!advertised.has(name));
    assert.deepEqual(stale, [],
        'in GOLDEN but not advertised -- remove it or fix the spawn');
});

test('each tool advertises the values of its class', async()=>{
    const wrong = [];
    for (const tool of await tools())
    {
        const expected = EXPECTED[class_of(tool.name)];
        const actual = HINTS.map(hint=>tool.annotations?.[hint]);
        if (JSON.stringify(actual)!=JSON.stringify(expected))
        {
            wrong.push(`${tool.name} (${class_of(tool.name)}): `
                +`${describe(tool)} -- expected ${expected.join(', ')}`);
        }
    }
    assert.deepEqual(wrong, [], `${wrong.length} tools carry wrong values`);
});

// One way to write annotations, and only classes this file knows about.
test('annotations are written only through the helper, with known classes',
    ()=>{
    const sources = {
        'server.js': readFileSync(join(repo_root, 'server.js'), 'utf8'),
        'browser_tools.js': readFileSync(join(repo_root, 'browser_tools.js'),
            'utf8'),
    };
    const minimum = {'server.js': 11, 'browser_tools.js': 14};
    for (const [file, text] of Object.entries(sources))
    {
        assert.equal((text.match(/annotations:\s*\{/g) || []).length, 0,
            `${file} still writes an annotations object literal`);
        const calls = text.match(/annotations: annotate\(/g) || [];
        assert.ok(calls.length>=minimum[file],
            `${file}: ${calls.length} annotate() calls, expected at least `
            +`${minimum[file]}`);
        // A mistyped class would otherwise be invisible: the conservative
        // fallback triple is identical to browser_act, so click_ref and
        // type_ref would still pass every value assertion above.
        const classes = [...text.matchAll(/annotate\('([a-z_]+)'/g)]
            .map(match=>match[1]);
        const unknown = [...new Set(classes)]
            .filter(name=>!(name in EXPECTED));
        assert.deepEqual(unknown, [], `${file} names unknown classes`);
    }
});

// Spawning is the helper's job: its environment allowlist is what keeps a
// stray TOOLS or GROUPS in a developer's shell from shrinking the tool list
// under the set-equality test above. Upstream's offline tests reach the same
// guarantee by another route -- they pin the API to a local stub through
// test-helpers/redirect-api.mjs and clear the mode variables by hand -- so a
// file that imports that redirect is hermetic by construction and exempt.
test('only the shared helper spawns a server', ()=>{
    // Assembled from fragments so this file does not match its own check.
    const stdio_import = 'sdk/client/' + 'stdio.js';
    const stub_redirect = 'test-helpers/' + 'redirect-api.mjs';
    const offenders = readdirSync(test_dir)
        .filter(name=>name.endsWith('.test.js'))
        .map(name=>[name, readFileSync(join(test_dir, name), 'utf8')])
        .filter(([, text])=>text.includes(stdio_import)
            && !text.includes(stub_redirect))
        .map(([name])=>name);
    assert.deepEqual(offenders, [],
        'these tests build their own transport -- use helpers/spawn_server.js');
});

test('no tool fell back to conservative hints at startup', async()=>{
    const captured = await with_server(async({client, stderr})=>{
        await client.listTools();
        return stderr();
    }, {name: 'annotations-stderr-test', network: 'none'});
    const complaints = captured.split('\n')
        .filter(line=>/\[config\].*annotation class/.test(line));
    assert.deepEqual(complaints, [],
        'annotate() warned about a tool definition');
});

// Deployed servers are what OpenAI's portal actually scans. Give the URL
// without a token (MCP_URL) and the token separately (MCP_TOKEN); it travels
// in the Authorization header so it cannot leak through a logged URL.
const hosted_url = process.env.MCP_URL;
const hosted_token = process.env.MCP_TOKEN;
test('the deployed server carries complete annotations', {
    skip: !hosted_url || !hosted_token
        ? 'set MCP_URL (without a token) and MCP_TOKEN to check a deployment'
        : false,
}, async t=>{
    assert.ok(!/[?&]token=/.test(hosted_url),
        'put the token in MCP_TOKEN, not in MCP_URL');
    const listed = await with_hosted_server(
        async client=>(await client.listTools()).tools,
        {url: hosted_url, token: hosted_token, name: 'annotations-hosted'});
    t.diagnostic(`deployed server advertises ${listed.length} tools`);
    const incomplete = listed.filter(tool=>
        HINTS.some(hint=>typeof tool.annotations?.[hint]!='boolean')
        || !tool.annotations?.title);
    const wrong = [];
    for (const tool of listed)
    {
        const expected = EXPECTED[class_of(tool.name)];
        if (!expected)
        {
            // Tools the hosted wrapper adds on its own; reported, not failed.
            t.diagnostic(`not classified here: ${tool.name}`);
            continue;
        }
        const actual = HINTS.map(hint=>tool.annotations?.[hint]);
        if (JSON.stringify(actual)!=JSON.stringify(expected))
            wrong.push(`${tool.name}: ${describe(tool)}`);
    }
    assert.deepEqual(incomplete.map(tool=>tool.name), [],
        `${incomplete.length} deployed tools are incomplete`);
    assert.deepEqual(wrong, [], `${wrong.length} deployed tools carry wrong `
        +`values`);
});
