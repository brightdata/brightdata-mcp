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

const web = {readOnlyHint: true, destructiveHint: false, openWorldHint: true};
const closed = {readOnlyHint: true, destructiveHint: false,
    openWorldHint: false};
const write = {readOnlyHint: false, destructiveHint: false,
    openWorldHint: true};
const act = {readOnlyHint: false, destructiveHint: true, openWorldHint: true};

const expected = {
    search_engine: web,
    search_engine_batch: web,
    scrape_as_markdown: web,
    scrape_as_html: web,
    scrape_batch: web,
    extract: web,
    list_dataset_fields: closed,
    search_dataset: closed,
    session_stats: closed,
    ask_brightdata_assistant: closed,
    search_scrapers: closed,
    get_scraper_details: closed,
    get_scraper_progress: closed,
    get_scraper_results: closed,
    refresh_scrapers: closed,
    run_scraper: write,
    chatgpt_ai_insights: write,
    perplexity_ai_insights: write,
    scraping_browser_navigate: web,
    scraping_browser_go_back: web,
    scraping_browser_go_forward: web,
    scraping_browser_snapshot: web,
    scraping_browser_screenshot: web,
    scraping_browser_get_html: web,
    scraping_browser_get_text: web,
    scraping_browser_scroll: web,
    scraping_browser_scroll_to_ref: web,
    scraping_browser_network_requests: web,
    scraping_browser_wait_for_ref: web,
    scraping_browser_fill_form: write,
    scraping_browser_click_ref: act,
    scraping_browser_type_ref: act,
};

test('every tool sets all three hints to the expected values', async t=>{
    const stub = await start_stub_server();
    t.after(()=>close_stub_server(stub));
    const env = {...process.env, API_TOKEN: 'annotations-test-token',
        __BRD_TEST_STUB_URL: `http://127.0.0.1:${stub.address().port}`};
    delete env.GROUPS;
    delete env.TOOLS;
    const client = new Client({name: 'annotations-test', version: '0'},
        {capabilities: {tools: {}}});
    t.after(()=>client.close());
    await client.connect(new StdioClientTransport({cwd: repo_root, env,
        command: process.execPath,
        args: ['--import', './test-helpers/redirect-api.mjs', 'server.js']}));
    const {tools} = await client.listTools();
    assert.deepEqual(tools.map(x=>x.name).sort(),
        Object.keys(expected).sort());
    for (const {name, annotations: a = {}} of tools)
    {
        const {readOnlyHint, destructiveHint, openWorldHint} = a;
        assert.deepEqual({readOnlyHint, destructiveHint, openWorldHint},
            expected[name], name);
    }
});
