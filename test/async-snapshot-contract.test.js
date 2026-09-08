'use strict'; /*jslint node:true es9:true*/
// Regression tests for the fixes to the async snapshot handle feature.
// Written against the specification, not against the implementation: these
// were authored while server.js was being changed, deliberately without
// reading how the fixes were written, so a test that passes here says the
// contract holds and not that two files agree with each other.
//
// Companion to dataset-wait-budget.test.js, which pins the base behaviour of
// the same feature (fast path, budget expiry, hand-off). Nothing here repeats
// what that file already covers except where a case needs a different angle.
// The shared mock API and MCP harness live in test/helpers/mcp-harness.mjs.
//
// Every Bright Data call is served by a local mock. Nothing in this file can
// reach POST /datasets/v3/trigger for real: a real trigger bills money.
//
// Set MCP_TEST_STDERR=1 to see the server's own logs while debugging.
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {start_harness, close_all, lazy, call_tool, list_tools, tool_text,
    parse_payload, is_running, describe, visible_error, sleep, TRIGGER_PATH,
    snapshot_path} from './helpers/mcp-harness.mjs';

const DATASET_TOOL = 'web_data_amazon_product';
const OTHER_TOOL = 'web_data_npm_package';
const OTHER_TOOL_INPUT = {package_name: '@brightdata/mcp'};
const SNAPSHOT_TOOL = 'web_data_snapshot';
const PRODUCT_URL = 'https://www.amazon.com/dp/B0CRMZHDG8';
// Long enough that an untruncated label would be obvious, and still a valid
// URL so the tool's own schema accepts it.
const LONG_URL = `${PRODUCT_URL}?ref=${'a'.repeat(600)}`;
// "Roughly 200 characters" per the spec, and the truncation marker is the
// implementer's choice, so this is a bound and not an exact length. An
// untruncated label for LONG_URL would be past 640.
const MAX_LABEL_LENGTH = 300;

// Deliberately tiny. Proving these contracts must never need a real 45s wait.
const SMALL_BUDGET_MS = 1500;
// Room for several polls a second apart, so a retry can be observed.
const RETRY_BUDGET_MS = 6000;
// A trigger that outlives the whole wait budget, with room to spare.
const TRIGGER_DELAY_MS = SMALL_BUDGET_MS+3000;
// Generous slack for MCP round trips and child process scheduling.
const SLACK_MS = 10000;
// Long enough to prove a budget is a real multi-second number and not 0 or
// NaN, short enough that the suite does not sit through a whole 45s default.
const MIN_REAL_BUDGET_MS = 4000;
const TEST_TIMEOUT_MS = 120000;

const RECORDS = [{
    url: PRODUCT_URL,
    title: 'Test Product',
    brand: 'Test Brand',
    final_price: 19.99,
    currency: 'USD',
}];
const RUNNING_BODY = {status: 'running',
    message: 'Snapshot is not ready yet, try again in 10s'};

// ------------------------------------------------------------- harnesses

const small_harness = lazy(()=>start_harness({budget_ms: SMALL_BUDGET_MS}));
const retry_harness = lazy(()=>start_harness({budget_ms: RETRY_BUDGET_MS}));
// PRO_MODE off, explicit selection on: the two addTool branches that every
// other harness in this repo skips.
const tools_harness = lazy(()=>start_harness({budget_ms: SMALL_BUDGET_MS,
    env: {PRO_MODE: null, TOOLS: DATASET_TOOL}}));
const groups_harness = lazy(()=>start_harness({budget_ms: SMALL_BUDGET_MS,
    env: {PRO_MODE: null, GROUPS: 'ecommerce'}}));
const bad_budget_harnesses = new Map();
const bad_budget_harness = value=>{
    if (!bad_budget_harnesses.has(value))
    {
        bad_budget_harnesses.set(value, start_harness(
            {env: {DATASET_WAIT_BUDGET_MS: value}}));
    }
    return bad_budget_harnesses.get(value);
};

after(close_all);

// ------------------------------------------------------------ assertions

function assert_ok(result, what){
    assert.ok(!result.isError,
        `${what} must resolve as a normal result, not an error.`
        +describe(result));
}

function assert_records(result, expected, what){
    assert_ok(result, what);
    assert.deepEqual(parse_payload(result), expected,
        `${what} must return the records unchanged.`+describe(result));
}

function assert_running_envelope(result, expected_snapshot_id, what){
    assert_ok(result, what);
    const payload = parse_payload(result);
    assert.ok(is_running(payload),
        `${what} must return an object with status "running".`
        +describe(result));
    assert.equal(payload.snapshot_id, expected_snapshot_id,
        `${what} must carry the snapshot_id of the collection that is `
        +'running and already billed.'+describe(result));
    assert.ok(Number.isFinite(Number(payload.polling_interval_seconds))
        && Number(payload.polling_interval_seconds)>0,
        `${what} must carry a positive polling_interval_seconds.`
        +describe(result));
    assert.match(JSON.stringify(payload.next??null), /web_data_snapshot/,
        `${what} must name web_data_snapshot in its "next" field.`
        +describe(result));
    assert.equal(typeof payload.warning, 'string',
        `${what} must carry a warning string.`+describe(result));
    return payload;
}

function assert_is_error(result, what){
    const payload = parse_payload(result);
    assert.ok(!is_running(payload),
        `${what} must never be disguised as status "running".`
        +describe(result));
    assert.ok(result.isError===true || /error|fail/i.test(tool_text(result)),
        `${what} must surface as an error.`+describe(result));
}

// ------------------------------------- 1. the trigger must have no timeout

// The trigger POST is the billable call. Aborting it at the wait budget does
// not cancel the collection upstream, it only throws away the snapshot_id of
// a collection the user has already paid for, which is the single most
// expensive way this feature can fail. The budget bounds how long we WAIT for
// records, never how long we wait to learn the id.
test('a trigger slower than the wait budget still hands back its snapshot_id',
    {timeout: TEST_TIMEOUT_MS}, async()=>{
    const harness = await small_harness();
    harness.api.reset({
        trigger: async()=>{
            await sleep(TRIGGER_DELAY_MS);
            return {status: 200, body: {snapshot_id: 'snap_slow_trigger'}};
        },
        snapshot: ()=>({status: 200, body: RUNNING_BODY}),
    });
    const {result, ms} = await call_tool(harness, DATASET_TOOL,
        {url: PRODUCT_URL});
    assert_running_envelope(result, 'snap_slow_trigger',
        `a trigger that took ${TRIGGER_DELAY_MS}ms against a `
        +`${SMALL_BUDGET_MS}ms wait budget`);
    assert.ok(ms>=TRIGGER_DELAY_MS,
        `the trigger must be awaited to completion, the call returned after `
        +`${ms}ms but the trigger only answered at ${TRIGGER_DELAY_MS}ms`);
    assert.equal(harness.api.count(TRIGGER_PATH, 'POST'), 1,
        'a slow trigger must not be retried: every retry is a second '
        +'billable collection');
});

// ------------------------------------------- 2. poll errors keep the handle

// 401/403/404 from the snapshot endpoint are retried, not fatal. The
// pre-change loop retried them and a collection that is mid-flight can answer
// this way transiently, so treating them as terminal turns a hiccup into a
// lost, billed collection. Only 400, a malformed ID, is worth giving up on.
for (const status of [401, 403, 404])
{
    test(`a transient ${status} while polling is retried, not fatal`,
        {timeout: TEST_TIMEOUT_MS}, async()=>{
        const harness = await retry_harness();
        const snapshot_id = `snap_transient_${status}`;
        harness.api.reset({
            trigger: ()=>({status: 200, body: {snapshot_id}}),
            snapshot: (id, attempt)=>attempt<2
                ? {status, body: {error: `mock ${status}`}}
                : {status: 200, body: RECORDS},
        });
        const {result, ms} = await call_tool(harness, DATASET_TOOL,
            {url: PRODUCT_URL});
        assert_records(result, RECORDS,
            `a snapshot that answered ${status} once and then returned `
            +'records');
        assert.ok(harness.api.count(snapshot_path(snapshot_id), 'GET')>=2,
            `a ${status} must be polled again inside the budget, the server `
            +'gave up after the first one');
        assert.ok(ms<RETRY_BUDGET_MS+SLACK_MS,
            `the retry must stay inside the budget, took ${ms}ms`);
    });
}

// Whatever error does reach the caller has to carry the way back. The
// collection was triggered and billed before the first poll ever ran, so an
// error message without the snapshot_id is a receipt for data nobody can
// collect. The pre-fix code threw the raw axios error, "Request failed with
// status code 404", with no id and no next step.
for (const status of [400, 401, 403, 404])
{
    test(`a persistent ${status} while polling still names the snapshot_id `
        +'and web_data_snapshot', {timeout: TEST_TIMEOUT_MS}, async()=>{
        const harness = await small_harness();
        const snapshot_id = `snap_fatal_${status}`;
        harness.api.reset({
            trigger: ()=>({status: 200, body: {snapshot_id}}),
            snapshot: ()=>({status, body: {error: `mock ${status}`}}),
        });
        const {result} = await call_tool(harness, DATASET_TOOL,
            {url: PRODUCT_URL});
        assert_is_error(result, `a persistent ${status} from the snapshot `
            +'endpoint');
        const text = visible_error(result);
        assert.ok(text.includes(snapshot_id),
            `a ${status} while polling must not throw away the snapshot_id `
            +`of the billed collection. The caller saw: ${text}`);
        assert.match(text, /web_data_snapshot/,
            `a ${status} while polling must tell the caller which tool can `
            +`still collect the records. The caller saw: ${text}`);
    });
}

// web_data_snapshot's own errors: fastmcp already wraps them as "Tool
// 'web_data_snapshot' execution failed: ...", so naming the tool proves
// nothing here and only the id is asserted.
test('web_data_snapshot keeps the snapshot_id in a poll error',
    {timeout: TEST_TIMEOUT_MS}, async()=>{
    const harness = await small_harness();
    harness.api.reset({
        trigger: ()=>({status: 500, body: {error: 'must not trigger'}}),
        snapshot: ()=>({status: 403, body: {error: 'mock 403'}}),
    });
    const {result} = await call_tool(harness, SNAPSHOT_TOOL,
        {snapshot_id: 'snap_fatal_collect'});
    assert_is_error(result, 'a 403 from web_data_snapshot');
    assert.ok(visible_error(result).includes('snap_fatal_collect'),
        'web_data_snapshot must say which snapshot_id failed, otherwise an '
        +'agent juggling two collections cannot tell which one is lost. '
        +`The caller saw: ${visible_error(result)}`);
    assert.equal(harness.api.count(TRIGGER_PATH, 'POST'), 0,
        'a failing collect must never be retried by triggering a new '
        +'(billable) collection');
});

// ---------------------------------------------- 3. an empty body fails fast

// A 200 with a null body is neither records nor a status. The pre-fix path
// ran it through JSON.parse(JSON.stringify(null, replacer)), which throws a
// SyntaxError, and the catch filed that as a transient network error: the
// loop then retried a body that will never change until the entire wait
// budget was gone, and only then reported a JSON parse error. Nothing about
// an empty body improves by waiting.
//
// Scope note: this is the only readiness case tested. Whether a body is ready
// records or a pending status is pre-existing behaviour that predates this
// feature, and is deliberately left alone.
test('a null snapshot body fails fast instead of burning the wait budget',
    {timeout: TEST_TIMEOUT_MS}, async()=>{
    const harness = await retry_harness();
    harness.api.reset({
        trigger: ()=>({status: 200, body: {snapshot_id: 'snap_empty'}}),
        snapshot: ()=>({status: 200, body: null}),
    });
    const {result, ms} = await call_tool(harness, DATASET_TOOL,
        {url: PRODUCT_URL});
    const polls = harness.api.count(snapshot_path('snap_empty'), 'GET');
    assert.ok(polls<=2,
        `an empty body is not going to fill itself in, so it must not be `
        +`retried: the server polled it ${polls} times`);
    assert.ok(ms<RETRY_BUDGET_MS*0.6,
        `an empty body must fail fast, the call took ${ms}ms of a `
        +`${RETRY_BUDGET_MS}ms budget`);
    assert_is_error(result, 'a snapshot that answered 200 with a null body');
    assert.ok(visible_error(result).includes('snap_empty'),
        'even here the snapshot_id has to survive: the collection was '
        +`triggered and billed. The caller saw: ${visible_error(result)}`);
});

// --------------------------------------------------------- 4. annotations

// readOnlyHint means, in the MCP spec, that the tool does not modify its
// environment. These tools scrape public pages: they change nothing about the
// target site or the user's system, so every one of them is read-only,
// web_data_snapshot and the 50 generated dataset tools alike.
//
// Being billable is a property of the service, not a mutation of the
// environment, and MCP has no annotation for cost. Ten other billable tools
// on this server (search_engine, scrape_as_markdown, scrape_batch and the
// rest, server.js lines 234-730) are all readOnlyHint:true, so flipping only
// the dataset family would emit an incoherent signal, and it would make
// clients that auto-approve read-only calls start prompting on the server's
// largest tool family. The guard against re-triggering a billable collection
// lives in the pending envelope's `warning` field and in web_data_snapshot's
// description, not here; retry semantics are idempotentHint, not
// readOnlyHint.
//
// This test is kept as a guard against the readOnlyHint:false change being
// re-applied later.
test('every web_data_* tool stays annotated read-only',
    {timeout: TEST_TIMEOUT_MS}, async()=>{
    const harness = await small_harness();
    const tools = await list_tools(harness);
    const family = tools.filter(tool=>tool.name.startsWith('web_data_'));
    assert.ok(family.length>10,
        `expected the whole web_data_* family to be registered, found `
        +`${family.length}`);
    assert.ok(family.some(tool=>tool.name==SNAPSHOT_TOOL),
        `${SNAPSHOT_TOOL} must be registered`);
    const offenders = family
        .filter(tool=>tool.annotations?.readOnlyHint!==true)
        .map(tool=>`${tool.name}=${tool.annotations?.readOnlyHint}`);
    assert.deepEqual(offenders, [],
        'a web_data_* tool reads public pages and mutates nothing, so each '
        +`must carry readOnlyHint:true. ${offenders.length} of `
        +`${family.length} do not: ${offenders.join(', ')}`);
});

// ---------------------------------------------------- 5. NaN budget guard

// parseInt('abc') is NaN, and every comparison against NaN is false, so a
// deadline of NaN makes the poll loop exit before its first iteration. The
// tool then bills a trigger, makes ZERO snapshot GETs, and returns a pending
// envelope in milliseconds: the caller pays and gets nothing, fast. '0' and
// '-5' produce the same silent no-poll, and '45s' parses to 45ms.
//
// The exact 45000 cannot be asserted without sitting through it (and
// POLLING_TIMEOUT caps it lower in these harnesses anyway), so each value is
// pinned two ways: the poll must happen at all, and the budget must be a real
// multi-second number. '45s' needs the second check on its own: 45ms is long
// enough for exactly one poll and would sail past a "did it poll" assertion
// while still being useless.
for (const value of ['abc', '0', '-5', '45s'])
{
    test(`DATASET_WAIT_BUDGET_MS=${value} falls back to the default budget`,
        {timeout: TEST_TIMEOUT_MS}, async()=>{
        const harness = await bad_budget_harness(value);
        harness.api.reset({
            trigger: ()=>({status: 200, body: {snapshot_id: 'snap_budget'}}),
            snapshot: ()=>({status: 200, body: RECORDS}),
        });
        const {result} = await call_tool(harness, DATASET_TOOL,
            {url: PRODUCT_URL});
        // A trigger was paid for, so the snapshot must actually have been
        // polled at least once.
        assert.ok(harness.api.count(snapshot_path('snap_budget'), 'GET')>=1,
            `DATASET_WAIT_BUDGET_MS=${value} left a budget that expired `
            +'before the first poll: the collection was triggered and billed '
            +'and not one snapshot GET was made.'+describe(result));
        assert_records(result, RECORDS,
            `DATASET_WAIT_BUDGET_MS=${value}`);
        assert.equal(harness.api.count(TRIGGER_PATH, 'POST'), 1,
            'exactly one billable trigger per call');

        // Now a collection that never finishes: the server must still be
        // waiting seconds later.
        harness.api.reset({
            trigger: ()=>({status: 200, body: {snapshot_id: 'snap_nan_wait'}}),
            snapshot: ()=>({status: 200, body: RUNNING_BODY}),
        });
        const pending = call_tool(harness, DATASET_TOOL, {url: PRODUCT_URL});
        // Abandoned on purpose; the child is killed when the suite ends.
        pending.catch(()=>{});
        const early = await Promise.race([
            pending,
            new Promise(done=>setTimeout(()=>done(null), MIN_REAL_BUDGET_MS)),
        ]);
        assert.equal(early, null,
            `DATASET_WAIT_BUDGET_MS=${value} must fall back to the 45000ms `
            +'default, so the server must still be polling after '
            +`${MIN_REAL_BUDGET_MS}ms. It gave up after ${early?.ms}ms.`
            +describe(early?.result));
    });
}

// ------------------------------------------------- 6. tool selection paths

// Closes a real coverage gap: every other harness in this repo sets
// PRO_MODE=true, so neither branch of addTool that an explicit selection
// takes has ever been exercised. server.js pulls web_data_snapshot in
// whenever any web_data_* tool is selected, because a snapshot_id the caller
// has no tool to spend is the same lost, billed collection as never getting
// an id at all.
test('an explicit TOOLS selection still registers web_data_snapshot',
    {timeout: TEST_TIMEOUT_MS}, async()=>{
    const harness = await tools_harness();
    const names = (await list_tools(harness)).map(tool=>tool.name);
    assert.ok(names.includes(DATASET_TOOL),
        `TOOLS=${DATASET_TOOL} must register it, got: ${names.join(', ')}`);
    assert.ok(names.includes(SNAPSHOT_TOOL),
        `TOOLS=${DATASET_TOOL} selects a tool that can hand back a `
        +'snapshot_id, so web_data_snapshot must come with it. Registered: '
        +names.join(', '));
    assert.ok(!names.includes(OTHER_TOOL),
        'the selection must still be a selection, but '
        +`${OTHER_TOOL} was registered too: ${names.join(', ')}`);
});

test('a GROUPS selection still registers web_data_snapshot',
    {timeout: TEST_TIMEOUT_MS}, async()=>{
    const harness = await groups_harness();
    const names = (await list_tools(harness)).map(tool=>tool.name);
    assert.ok(names.some(name=>name.startsWith('web_data_')
        && name!=SNAPSHOT_TOOL),
        `GROUPS=ecommerce must register dataset tools, got: `
        +names.join(', '));
    assert.ok(names.includes(SNAPSHOT_TOOL),
        'GROUPS=ecommerce can trigger collections, so web_data_snapshot must '
        +`be registered with it. Registered: ${names.join(', ')}`);
});

// The selection paths must behave like pro mode once registered, or the fixes
// above are only true for PRO_MODE users.
test('a TOOLS-selected dataset tool still hands back a snapshot_id',
    {timeout: TEST_TIMEOUT_MS}, async()=>{
    const harness = await tools_harness();
    harness.api.reset({
        trigger: ()=>({status: 200, body: {snapshot_id: 'snap_selected'}}),
        snapshot: ()=>({status: 200, body: RUNNING_BODY}),
    });
    const {result} = await call_tool(harness, DATASET_TOOL,
        {url: PRODUCT_URL});
    const payload = assert_running_envelope(result, 'snap_selected',
        'budget expiry under an explicit TOOLS selection');
    // The id has to be spendable by the same server that handed it out.
    const collect = await call_tool(harness, SNAPSHOT_TOOL,
        {snapshot_id: payload.snapshot_id});
    assert_running_envelope(collect.result, 'snap_selected',
        'web_data_snapshot under an explicit TOOLS selection');
    assert.equal(harness.api.count(TRIGGER_PATH, 'POST'), 1,
        'the whole hand-off must cost exactly one billable trigger');
});

// -------------------------------------------------- 7. the collecting label

// `sd_mtsosz7n1fexitzavy` says nothing about what is being collected. An
// agent running two collections at once holds two of those and can collect
// the wrong one; an agent whose context was compacted holds one with no idea
// what it was for, and re-triggers a billable collection to find out. The
// `collecting` field is the label that makes an opaque id self describing.
const collecting_of = (payload, what, result)=>{
    assert.equal(typeof payload.collecting, 'string',
        `${what} must carry a "collecting" label saying what the snapshot_id `
        +'is for.'+describe(result));
    return payload.collecting;
};

test('the pending envelope labels what is being collected',
    {timeout: TEST_TIMEOUT_MS}, async()=>{
    const harness = await small_harness();
    harness.api.reset({
        trigger: ()=>({status: 200, body: {snapshot_id: 'snap_label'}}),
        snapshot: ()=>({status: 200, body: RUNNING_BODY}),
    });
    const {result} = await call_tool(harness, DATASET_TOOL,
        {url: PRODUCT_URL});
    const payload = assert_running_envelope(result, 'snap_label',
        'budget expiry');
    const label = collecting_of(payload, 'budget expiry', result);
    assert.ok(label.includes(DATASET_TOOL),
        `collecting must name the tool that started the collection, got: `
        +label);
    assert.ok(label.includes(PRODUCT_URL),
        'collecting must name the input the tool was called with, or the '
        +`label cannot tell two calls of the same tool apart, got: ${label}`);
});

// The case most likely to break: the label lives in the process that
// triggered the collection, and web_data_snapshot is a different call that
// only receives an id. A label that does not survive the hand-off is a label
// that is missing exactly when it is needed, because the follow-up poll is
// where the agent is most likely to have lost the context.
test('the collecting label survives to the follow-up web_data_snapshot poll',
    {timeout: TEST_TIMEOUT_MS}, async()=>{
    const harness = await small_harness();
    harness.api.reset({
        trigger: ()=>({status: 200, body: {snapshot_id: 'snap_label_handoff'}}),
        snapshot: ()=>({status: 200, body: RUNNING_BODY}),
    });
    const first = await call_tool(harness, DATASET_TOOL, {url: PRODUCT_URL});
    const triggered = assert_running_envelope(first.result,
        'snap_label_handoff', 'budget expiry');
    const label = collecting_of(triggered, 'budget expiry', first.result);
    const second = await call_tool(harness, SNAPSHOT_TOOL,
        {snapshot_id: triggered.snapshot_id});
    const collected = assert_running_envelope(second.result,
        'snap_label_handoff', 'the follow-up poll');
    assert.equal(collected.collecting, label,
        'web_data_snapshot must report the same collecting label the '
        +'web_data_* tool handed out, otherwise the agent loses track of '
        +`what it is polling at the exact moment it asks.${
            describe(second.result)}`);
});

// Same rule the envelope already follows for elapsed_s: a field that would
// have to be guessed is left out. A wrong label is worse than none, because
// an agent reads it and acts on it; a missing key it can simply ignore.
test('an unknown collecting label is omitted, never guessed or left empty',
    {timeout: TEST_TIMEOUT_MS}, async()=>{
    const harness = await small_harness();
    harness.api.reset({
        trigger: ()=>({status: 500, body: {error: 'must not trigger'}}),
        snapshot: ()=>({status: 200, body: RUNNING_BODY}),
    });
    // An id this server process never triggered: the restart case, and the
    // same shape as an id evicted by the 1000-entry cap on the map that
    // holds the labels.
    const {result} = await call_tool(harness, SNAPSHOT_TOOL,
        {snapshot_id: 'snap_from_a_previous_life'});
    const payload = assert_running_envelope(result, 'snap_from_a_previous_life',
        'a snapshot_id from before a restart');
    assert.ok(!('collecting' in payload),
        'a label this process cannot know must be omitted, not emitted as an '
        +`empty string or a placeholder.${describe(result)}`);
    assert.ok(!('elapsed_s' in payload),
        'the same rule the envelope already applies to elapsed_s: unknown '
        +`means absent.${describe(result)}`);
});

// The failure the field exists to prevent, pinned directly: two collections
// in flight, two ids, and the labels have to tell the agent which is which.
test('two concurrent collections get their own collecting labels',
    {timeout: TEST_TIMEOUT_MS}, async()=>{
    const harness = await small_harness();
    harness.api.reset({
        // The two tools are told apart by the input the server posted.
        trigger: call=>({status: 200, body: {snapshot_id:
            call.body?.[0]?.package_name ? 'snap_npm' : 'snap_amazon'}}),
        snapshot: ()=>({status: 200, body: RUNNING_BODY}),
    });
    const [amazon, npm] = await Promise.all([
        call_tool(harness, DATASET_TOOL, {url: PRODUCT_URL}),
        call_tool(harness, OTHER_TOOL, OTHER_TOOL_INPUT),
    ]);
    const amazon_payload = assert_running_envelope(amazon.result,
        'snap_amazon', `concurrent ${DATASET_TOOL}`);
    const npm_payload = assert_running_envelope(npm.result, 'snap_npm',
        `concurrent ${OTHER_TOOL}`);
    const amazon_label = collecting_of(amazon_payload,
        `concurrent ${DATASET_TOOL}`, amazon.result);
    const npm_label = collecting_of(npm_payload, `concurrent ${OTHER_TOOL}`,
        npm.result);
    assert.ok(amazon_label.includes(DATASET_TOOL)
        && amazon_label.includes(PRODUCT_URL),
        `the ${DATASET_TOOL} label must describe its own call, got: `
        +amazon_label);
    assert.ok(npm_label.includes(OTHER_TOOL)
        && npm_label.includes(OTHER_TOOL_INPUT.package_name),
        `the ${OTHER_TOOL} label must describe its own call, got: ${npm_label}`);
    assert.notEqual(amazon_label, npm_label,
        'two collections in flight must not share one label, or the field '
        +'cannot do the job it exists for');
    // And the labels must not have crossed over on the way out.
    assert.ok(!amazon_label.includes(OTHER_TOOL_INPUT.package_name),
        `the ${DATASET_TOOL} label picked up the other call's input: `
        +amazon_label);
    assert.ok(!npm_label.includes(PRODUCT_URL),
        `the ${OTHER_TOOL} label picked up the other call's input: `
        +npm_label);
});

// Every envelope carries this field, and some inputs are enormous. A label
// that is not bounded turns a small hand-off into a large one on exactly the
// calls that are already going badly.
test('a very long input is truncated in the collecting label',
    {timeout: TEST_TIMEOUT_MS}, async()=>{
    const harness = await small_harness();
    harness.api.reset({
        trigger: ()=>({status: 200, body: {snapshot_id: 'snap_long_label'}}),
        snapshot: ()=>({status: 200, body: RUNNING_BODY}),
    });
    const {result} = await call_tool(harness, DATASET_TOOL, {url: LONG_URL});
    const payload = assert_running_envelope(result, 'snap_long_label',
        'a call with a very long input');
    const label = collecting_of(payload, 'a call with a very long input',
        result);
    assert.ok(label.length<=MAX_LABEL_LENGTH,
        `the collecting label must be bounded at roughly 200 characters, this `
        +`one is ${label.length} for a ${LONG_URL.length} character input`);
    assert.ok(label.includes(DATASET_TOOL),
        'truncation must not cost the tool name, which is the half an agent '
        +`needs most, got: ${label}`);
});

// collecting is an addition, not a reshape. The healthcheck
// (brightdata-mcp-healthcheck/e2e-async-handles.mjs) asserts several of these
// keys against the live server, and an agent that was handed an envelope
// before this change still expects all of them.
test('the pending envelope keeps every key it already had',
    {timeout: TEST_TIMEOUT_MS}, async()=>{
    const harness = await small_harness();
    harness.api.reset({
        trigger: ()=>({status: 200, body: {snapshot_id: 'snap_keys'}}),
        snapshot: ()=>({status: 200, body: RUNNING_BODY}),
    });
    const {result} = await call_tool(harness, DATASET_TOOL,
        {url: PRODUCT_URL});
    const payload = assert_running_envelope(result, 'snap_keys',
        'budget expiry');
    // status, snapshot_id, polling_interval_seconds, next and warning are
    // checked by assert_running_envelope. elapsed_s is knowable here, since
    // this process is the one that triggered the collection, so it has to be
    // present and numeric.
    assert.ok(Number.isFinite(Number(payload.elapsed_s))
        && Number(payload.elapsed_s)>=0,
        'elapsed_s must still be reported when this process triggered the '
        +`collection.${describe(result)}`);
    for (const key of ['status', 'snapshot_id', 'elapsed_s',
        'polling_interval_seconds', 'next', 'warning'])
    {
        assert.ok(key in payload,
            `the envelope lost its "${key}" key.${describe(result)}`);
    }
});
