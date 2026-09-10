'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {build_instructions, capabilities_from, CLAUSES, PRIORITY_WINDOW}
    from '../instructions.js';

// The three registration modes this server actually has, by the names each
// one registers.
const PRO = ['search_engine', 'scrape_as_markdown', 'search_engine_batch',
    'scrape_batch', 'scrape_as_html', 'extract', 'discover',
    'list_dataset_fields', 'search_dataset', 'session_stats',
    'web_data_amazon_product', 'scraping_browser_navigate'];
const RAPID = ['search_engine', 'scrape_as_markdown', 'search_engine_batch',
    'scrape_batch', 'discover'];
const CUSTOM = ['search_engine', 'scrape_as_markdown'];
// Pro mode once PR #177's marketplace tools land.
const PRO_WITH_MARKETPLACE = [...PRO, 'query_dataset', 'collect_dataset'];

test('capabilities are read from the names a mode registers', ()=>{
    const pro = capabilities_from(PRO);
    assert.equal(pro.has_datasets, true);
    assert.equal(pro.has_browser, true);
    assert.equal(pro.has_jobs, true);
    assert.equal(pro.has_marketplace, false, 'query_dataset arrives with #177');

    const rapid = capabilities_from(RAPID);
    assert.equal(rapid.has_datasets, false);
    assert.equal(rapid.has_browser, false);
    // discover is registered in this mode but its API was retired -- it
    // answers 410 for every query -- so it must not count as a working job
    // tool, and default mode therefore has none.
    assert.equal(rapid.has_jobs, false);

    const custom = capabilities_from(CUSTOM);
    assert.equal(custom.has_jobs, false);
    assert.equal(custom.has_scrape, true);
});

test('each mode gets the clauses that apply to it, high priority first', ()=>{
    assert.deepEqual(build_instructions(capabilities_from(PRO)).ids,
        ['ladder', 'job_timing', 'usage_limit']);
    assert.deepEqual(build_instructions(capabilities_from(RAPID)).ids,
        ['ladder', 'usage_limit'], 'no working job tool in default mode');
    assert.deepEqual(build_instructions(capabilities_from(CUSTOM)).ids,
        ['ladder', 'usage_limit']);
    assert.deepEqual(
        build_instructions(capabilities_from(PRO_WITH_MARKETPLACE)).ids,
        ['ladder', 'job_timing', 'usage_limit']);
});

test('a session with nothing to order gets no ladder', ()=>{
    const {ids} = build_instructions(capabilities_from(['session_stats']));
    assert.deepEqual(ids, ['usage_limit'],
        'the only universally true rule');
});

// The rule that a mention implies a registered tool. Checked here across every
// mode, because it is the failure that would send a model looking for a tool
// it cannot see.
test('no clause names a tool family the mode does not register', ()=>{
    for (const [label, names] of [['pro', PRO], ['rapid', RAPID],
        ['custom', CUSTOM], ['marketplace', PRO_WITH_MARKETPLACE]])
    {
        const {text} = build_instructions(capabilities_from(names));
        for (const [prefix, pattern] of [
            ['web_data_', /web_data_/],
            ['scraping_browser_', /scraping_browser_/],
            ['query_dataset', /query_dataset|collect_dataset/],
            ['discover', /\bdiscover\b/]])
        {
            if (!pattern.test(text))
                continue;
            assert.ok(names.some(name=>name.startsWith(prefix)),
                `${label} mentions ${prefix} but registers none`);
        }
    }
});

test('the rapid ladder orders the tools that mode actually has', ()=>{
    const {rendered} = build_instructions(capabilities_from(RAPID));
    const ladder = rendered.ladder;
    assert.match(ladder, /search_engine/);
    assert.match(ladder, /scrape_as_markdown/);
    assert.ok(!/web_data_|scraping_browser_/.test(ladder),
        'no tools this mode lacks');
});

// discover is registered but its API answers 410 Gone for every query
// (verified 2026-09-10). Recommending it would send the model to a tool that
// cannot work, which is worse than saying nothing.
test('nothing recommends the retired discover tool', ()=>{
    for (const names of [PRO, RAPID, CUSTOM, PRO_WITH_MARKETPLACE])
    {
        const {text} = build_instructions(capabilities_from(names));
        assert.ok(!/\bdiscover\b/.test(text),
            `discover is recommended to a session with ${names.length} tools`);
    }
});

test('the job clause names the cheap recovery only when it exists', ()=>{
    const without = build_instructions(capabilities_from(PRO)).rendered.job_timing;
    assert.ok(!/collect_dataset/.test(without),
        'no marketplace tools, so no snapshot-id recovery to offer');

    const with_marketplace = build_instructions(
        capabilities_from(PRO_WITH_MARKETPLACE)).rendered.job_timing;
    assert.match(with_marketplace, /collect_dataset/,
        'the cheap recovery is named when it exists');

    // Both forms must tell the model to report rather than restart, because a
    // retry starts another billed job.
    for (const text of [without, with_marketplace])
    {
        assert.match(text, /report it rather than retrying/);
        assert.match(text, /another job/);
    }

    // Measured 2026-09-10: web_data_* answered in 4-16s while a delisted
    // product took 55s to come back empty. The earlier 30-120s figure came
    // from the marketplace endpoint, which these tools do not use.
    assert.ok(!/30-120/.test(without) && !/30-120/.test(with_marketplace),
        'no timing figure borrowed from a different endpoint');
});

// The platform asks for the most important details in the first 512
// characters. A total-length cap does not guarantee that; this does.
test('high-priority clauses fit inside the priority window in every mode', ()=>{
    for (const [label, names] of [['pro', PRO], ['rapid', RAPID],
        ['custom', CUSTOM], ['marketplace', PRO_WITH_MARKETPLACE]])
    {
        const {text, ids, rendered} = build_instructions(
            capabilities_from(names));
        const window = text.slice(0, PRIORITY_WINDOW);
        for (const id of ids)
        {
            const clause = CLAUSES.find(c=>c.id===id);
            if (clause.priority!='high')
                continue;
            assert.ok(window.includes(rendered[id]),
                `${label}: "${id}" (${rendered[id].length} chars) falls `
                +`outside the first ${PRIORITY_WINDOW} characters of `
                +`${text.length}`);
        }
    }
});

test('every clause declares an id, a priority, a gate and text', ()=>{
    const ids = new Set();
    for (const clause of CLAUSES)
    {
        assert.match(clause.id, /^[a-z_]+$/);
        assert.ok(!ids.has(clause.id), `${clause.id} is declared once`);
        ids.add(clause.id);
        assert.ok(['high', 'normal'].includes(clause.priority), clause.id);
        assert.equal(typeof clause.when, 'function', clause.id);
        assert.equal(typeof clause.text, 'function', clause.id);
    }
});

test('the text says nothing about cost, and nothing to the user', ()=>{
    // The ladder is about escalation, not price: nobody has measured credits
    // against latency, and a web_data_* job is slower than a scrape.
    for (const names of [PRO, RAPID, PRO_WITH_MARKETPLACE])
    {
        const {text} = build_instructions(capabilities_from(names));
        assert.ok(!/cheap|cheaper|cheapest|expensive/i.test(text),
            'no unmeasured cost claim');
        assert.ok(!/\byou must\b|\bimmediately stop\b/i.test(text),
            'guidance to the model, not orders to the user');
    }
});
