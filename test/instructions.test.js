'use strict'; /*jslint node:true es9:true*/
// What the server tells the model before it calls anything.
//
// Asserts only what a client observes through initialize, so the wording is
// free to change: the rules themselves are pinned by clause id in
// test/instructions-builder.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import {with_server, list_tools} from './helpers/spawn_server.js';

// The platform asks for the most important details in the first 512
// characters. That is an ordering rule, not a size cap -- text can sit under
// any total and still bury its best line -- so the window is what we assert.
const PRIORITY_WINDOW = 512;
// A loose sanity bound on the whole thing. Standing context in every session,
// but not the guarantee; the window above is.
const TOTAL_SANITY = 1500;

const MODES = {
    pro: {},
    rapid: {PRO_MODE: undefined},
    custom: {PRO_MODE: undefined, TOOLS: 'search_engine,scrape_as_markdown'},
};

const cache = new Map();
async function session(mode){
    if (!cache.has(mode))
    {
        cache.set(mode, await with_server(async({client})=>({
            instructions: client.getInstructions() ?? '',
            tools: (await client.listTools()).tools,
        }), {network: 'none', env: MODES[mode], name: `instructions-${mode}`}));
    }
    return cache.get(mode);
}

test('initialize carries instructions in every mode', async()=>{
    for (const mode of Object.keys(MODES))
    {
        const {instructions} = await session(mode);
        assert.ok(instructions.length>0, `${mode} mode sends no instructions`);
        assert.ok(instructions.length<=TOTAL_SANITY,
            `${mode} mode: ${instructions.length} chars, over the sanity bound`);
    }
});

// The assertion that matters: not how long the text is, but what is at the
// front of it.
test('the high-priority rules fall inside the first 512 characters', async()=>{
    const {build_instructions, capabilities_from, CLAUSES} =
        await import('../instructions.js');
    for (const mode of Object.keys(MODES))
    {
        const {instructions, tools} = await session(mode);
        const built = build_instructions(
            capabilities_from(tools.map(t=>t.name)));
        assert.equal(built.text, instructions,
            `${mode}: the server's text should be the builder's output`);
        const window = instructions.slice(0, PRIORITY_WINDOW);
        for (const id of built.ids)
        {
            const clause = CLAUSES.find(c=>c.id===id);
            if (clause.priority!='high')
                continue;
            const rendered = built.rendered[id];
            assert.ok(window.includes(rendered),
                `${mode}: high-priority clause "${id}" is not fully inside `
                +`the first ${PRIORITY_WINDOW} characters`);
        }
    }
});

// Structure, not prose: a deleted rule is a missing id and an unambiguous
// failure, while any rewording passes.
test('each mode is given the rules that apply to it', async()=>{
    const {build_instructions, capabilities_from} =
        await import('../instructions.js');
    const expected = {
        pro: ['ladder', 'job_timing', 'usage_limit'],
        // rapid has no web_data_* and no browser. discover is registered here
        // but its API was retired, so it counts as no job tool at all.
        rapid: ['ladder', 'usage_limit'],
        // search_engine + scrape_as_markdown: an ordering, but nothing that
        // starts a job.
        custom: ['ladder', 'usage_limit'],
    };
    for (const [mode, ids] of Object.entries(expected))
    {
        const {tools} = await session(mode);
        const built = build_instructions(
            capabilities_from(tools.map(t=>t.name)));
        assert.deepEqual(built.ids, ids, `${mode} mode's clauses`);
    }
});

// A rule naming a tool the session cannot see is worse than no rule: the model
// looks for something that is not there.
test('no mode is told about tools it does not have', async()=>{
    const families = [
        ['web_data_', /web_data_/],
        ['scraping_browser_', /scraping_browser_|browser/i],
        ['query_dataset', /query_dataset|collect_dataset/],
    ];
    for (const mode of Object.keys(MODES))
    {
        const {instructions, tools} = await session(mode);
        for (const [prefix, mention] of families)
        {
            if (!mention.test(instructions))
                continue;
            assert.ok(tools.some(t=>t.name.startsWith(prefix)),
                `${mode} mode mentions ${prefix} but registers none`);
        }
    }
});

// Two renderings of one idea, for different audiences. They must not
// contradict each other on tier order; they need not share a string.
test('the instructions and the scraping-strategy prompt agree on tier order',
    async()=>{
    const {default: prompts} = await import('../prompts.js');
    const strategy = prompts.find(p=>p.name=='web_scraping_strategy');
    const prompt_text = await strategy.load();
    const {instructions} = await session('pro');
    for (const text of [prompt_text, instructions])
    {
        const dataset = text.indexOf('web_data_');
        const scrape = text.indexOf('scrape_as_markdown');
        const browser = text.search(/scraping_browser_|browser/i);
        assert.ok(dataset>=0 && scrape>=0 && browser>=0,
            'all three tiers are mentioned');
        assert.ok(dataset<scrape, 'a dedicated tool comes before scraping');
        assert.ok(scrape<browser, 'scraping comes before the browser');
    }
});

test('adding instructions did not move a tool', async()=>{
    const tools = await list_tools({network: 'none'});
    assert.equal(tools.length, 74);
    // Instructions are transport metadata; this task must not touch a tool.
    for (const tool of tools)
    {
        assert.ok(tool.name && tool.description,
            `${tool.name} still has a name and description`);
        assert.ok(tool.inputSchema, `${tool.name} still has an input schema`);
    }
});
