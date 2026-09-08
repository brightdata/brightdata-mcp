'use strict'; /*jslint node:true es9:true*/
// Contract tests for the async snapshot handle behaviour of the web_data_*
// tools. Written against the specification, not against the implementation.
//
// The server is started as a real MCP stdio child process (same approach as
// server-health.test.js). Its Bright Data traffic is redirected to a local
// mock HTTP server owned by this file, through test/helpers/mock-api-preload
// .mjs loaded with `node --import`. No real API call is ever made: a real
// trigger costs money.
//
// Set MCP_TEST_STDERR=1 to see the server's own logs while debugging.
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {dirname, resolve, join} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const test_dir = dirname(fileURLToPath(import.meta.url));
const repo_root = resolve(test_dir, '..');
const preload = pathToFileURL(join(test_dir, 'helpers',
    'mock-api-preload.mjs')).href;

const DATASET_TOOL = 'web_data_amazon_product';
const SNAPSHOT_TOOL = 'web_data_snapshot';
const PRODUCT_URL = 'https://www.amazon.com/dp/B0CRMZHDG8';
const TRIGGER_PATH = '/datasets/v3/trigger';
const snapshot_path = id=>`/datasets/v3/snapshot/${id}`;
// Deliberately tiny budgets. A real 45s wait must never be needed to prove
// the contract.
const SMALL_BUDGET_MS = 1200;
const LARGE_BUDGET_MS = 6000;
// Generous slack for MCP round trips and child process scheduling. Still two
// orders of magnitude below the 600s legacy blocking poll.
const SLACK_MS = 8000;
// How long the default (env unset) budget must at least keep waiting. Far
// below the documented 45000ms default so the suite stays fast.
const DEFAULT_MIN_WAIT_MS = 5000;
const TEST_TIMEOUT_MS = 120000;

const RECORDS = [{
    url: PRODUCT_URL,
    title: 'Test Product',
    brand: 'Test Brand',
    final_price: 19.99,
    currency: 'USD',
}];
const ERROR_RECORDS = [{
    url: PRODUCT_URL,
    error: 'Dead page',
    error_code: 'dead_page',
    warning: 'Page could not be collected',
}];
// What the Bright Data API returns while a snapshot is still collecting.
const RUNNING_BODY = {status: 'running',
    message: 'Snapshot is not ready yet, try again in 10s'};

// ---------------------------------------------------------------- mock API

async function start_mock_api(){
    const state = {calls: [], trigger: null, snapshot: null, next_id: 0};
    const sockets = new Set();
    const send_json = (res, status, body)=>{
        const payload = JSON.stringify(body===undefined ? null : body);
        res.writeHead(status, {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(payload),
        });
        res.end(payload);
    };
    const server = http.createServer((req, res)=>{
        const chunks = [];
        req.on('data', chunk=>chunks.push(chunk));
        req.on('end', ()=>{
            const raw = Buffer.concat(chunks).toString('utf8');
            let body;
            try { body = raw ? JSON.parse(raw) : undefined; }
            catch(e){ body = raw; }
            const url = new URL(req.url, 'http://127.0.0.1');
            const call = {
                method: req.method,
                path: url.pathname,
                query: Object.fromEntries(url.searchParams),
                body,
                at: Date.now(),
            };
            state.calls.push(call);
            if (url.pathname=='/zone/get_active_zones')
            {
                return void send_json(res, 200,
                    [{name: 'mcp_unlocker'}, {name: 'mcp_browser'}]);
            }
            if (url.pathname==TRIGGER_PATH)
            {
                const reply = state.trigger ? state.trigger(call)
                    : {status: 200,
                        body: {snapshot_id: `snap_${++state.next_id}`}};
                return void send_json(res, reply.status||200, reply.body);
            }
            const match = url.pathname
                .match(/^\/datasets\/v3\/snapshot\/([^/]+)$/);
            if (match)
            {
                const attempt = state.calls
                    .filter(c=>c.path==url.pathname).length;
                const reply = state.snapshot
                    ? state.snapshot(match[1], attempt, call)
                    : {status: 200, body: RUNNING_BODY};
                return void send_json(res, reply.status||200, reply.body);
            }
            return void send_json(res, 404,
                {error: `unmocked ${req.method} ${url.pathname}`});
        });
    });
    server.on('connection', socket=>{
        sockets.add(socket);
        socket.on('close', ()=>sockets.delete(socket));
    });
    await new Promise((done, fail)=>{
        server.once('error', fail);
        server.listen(0, '127.0.0.1', done);
    });
    return {
        base_url: `http://127.0.0.1:${server.address().port}`,
        calls: ()=>state.calls.slice(),
        count: (path, method)=>state.calls.filter(c=>c.path==path
            && (!method || c.method==method)).length,
        // trigger/snapshot are (call)=>({status, body}) and
        // (snapshot_id, attempt, call)=>({status, body}); attempt starts at 1.
        reset({trigger = null, snapshot = null} = {}){
            state.calls = [];
            state.trigger = trigger;
            state.snapshot = snapshot;
        },
        async close(){
            for (const socket of sockets)
                socket.destroy();
            await new Promise(done=>server.close(done));
        },
    };
}

// ------------------------------------------------------------- MCP harness

const harnesses = [];

// budget_ms null leaves DATASET_WAIT_BUDGET_MS unset, i.e. the shipped
// default configuration.
async function start_harness(budget_ms){
    const api = await start_mock_api();
    const client = new Client({name: 'dataset-wait-budget-test',
        version: '0.0.1'}, {capabilities: {tools: {}}});
    const env = {
        ...process.env,
        API_TOKEN: 'dummy-token',
        PRO_MODE: 'true',
        MOCK_BRIGHTDATA_BASE: api.base_url,
        DATASET_WAIT_BUDGET_MS: String(budget_ms),
        // Bounds the damage if the server ignores the budget entirely:
        // without this the legacy path blocks for 600s per call.
        POLLING_TIMEOUT: '30',
    };
    if (budget_ms===null)
        delete env.DATASET_WAIT_BUDGET_MS;
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: ['--import', preload, 'server.js'],
        cwd: repo_root,
        env,
        stderr: process.env.MCP_TEST_STDERR ? 'inherit' : 'ignore',
    });
    await client.connect(transport);
    const harness = {
        client,
        api,
        budget_ms,
        async close(){
            try { await client.close(); } catch(e){ /* already gone */ }
            await api.close();
        },
    };
    harnesses.push(harness);
    return harness;
}

const lazy = fn=>{
    let promise = null;
    return ()=>promise||(promise = fn());
};
// One child per budget, reused across tests; the mock is reconfigured per
// test. Starting the server costs ~1s, and the budget is env-only by design
// so it cannot be varied per call.
const small_harness = lazy(()=>start_harness(SMALL_BUDGET_MS));
const large_harness = lazy(()=>start_harness(LARGE_BUDGET_MS));
// The shipped configuration: DATASET_WAIT_BUDGET_MS unset.
const default_harness = lazy(()=>start_harness(null));

after(async()=>{
    for (const harness of harnesses)
        await harness.close();
});

async function call_tool(harness, name, args){
    const started = Date.now();
    const result = await harness.client.callTool({name, arguments: args});
    return {result, ms: Date.now()-started, payload: parse_payload(result)};
}

async function list_tools(harness){
    const {tools} = await harness.client.listTools();
    return tools;
}

async function assert_tool_exists(harness, name){
    const tools = await list_tools(harness);
    assert.ok(tools.some(tool=>tool.name==name),
        `tool ${name} must be registered, got: `
        +tools.map(tool=>tool.name).join(', '));
}

// --------------------------------------------------------------- assertions

function tool_text(result){
    return (result?.content||[]).filter(block=>block.type=='text')
        .map(block=>block.text).join('\n');
}

function try_json(text){
    try { return JSON.parse(text); }
    catch(e){ return undefined; }
}

// The contract fixes the fields, not the transport, so accept the payload as
// a JSON text block, as JSON embedded in a text block, or as structured
// content.
function parse_payload(result){
    const blocks = (result?.content||[]).filter(block=>block.type=='text');
    for (const block of blocks)
    {
        const parsed = try_json(block.text);
        if (parsed!==undefined)
            return parsed;
    }
    for (const block of blocks)
    {
        for (const [open, close] of [['{', '}'], ['[', ']']])
        {
            const start = block.text.indexOf(open);
            const end = block.text.lastIndexOf(close);
            if (start>=0 && end>start)
            {
                const parsed = try_json(block.text.slice(start, end+1));
                if (parsed!==undefined)
                    return parsed;
            }
        }
    }
    return result?.structuredContent;
}

const is_running = payload=>!!payload && !Array.isArray(payload)
    && typeof payload=='object' && payload.status=='running';

function describe(result){
    return `\nisError=${result?.isError}\npayload=`
        +`${JSON.stringify(parse_payload(result))}\ntext=${tool_text(result)}`;
}

function assert_ok(result, what){
    assert.ok(!result.isError,
        `${what} must resolve as a normal result, not an error.`
        +describe(result));
}

function assert_running_envelope(result, expected_snapshot_id, what){
    assert_ok(result, what);
    const payload = parse_payload(result);
    assert.ok(is_running(payload),
        `${what} must return an object with status "running".`
        +describe(result));
    assert.equal(payload.snapshot_id, expected_snapshot_id,
        `${what} must carry the snapshot_id the trigger returned.`
        +describe(result));
    // elapsed_s is the age of the COLLECTION, not of this call, so it can only
    // be reported when this process is the one that triggered it. Collecting an
    // id from a previous session, or after a restart, is a real flow and there
    // the honest answer is to omit the field rather than report the current
    // call's duration, which would undercount. Present-and-wrong is worse than
    // absent for a number an agent may reason from.
    if (payload.elapsed_s!==undefined)
    {
        assert.ok(Number.isFinite(Number(payload.elapsed_s))
            && Number(payload.elapsed_s)>=0,
            `${what} carried a non-numeric elapsed_s.`+describe(result));
    }
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

function assert_error_not_running(result, what){
    const payload = parse_payload(result);
    assert.ok(!is_running(payload),
        `${what} must never be disguised as status "running".`
        +describe(result));
    assert.ok(result.isError===true || /error|fail/i.test(tool_text(result)),
        `${what} must surface as an error.`+describe(result));
}

// -------------------------------------------------------------------- tests

test('dataset tool that finishes inside the budget returns the records '
    +'unchanged', {timeout: TEST_TIMEOUT_MS}, async()=>{
    const harness = await small_harness();
    harness.api.reset({
        trigger: ()=>({status: 200, body: {snapshot_id: 'snap_fast'}}),
        snapshot: ()=>({status: 200, body: RECORDS}),
    });
    const {result, payload} = await call_tool(harness, DATASET_TOOL,
        {url: PRODUCT_URL});
    assert_ok(result, 'fast path');
    assert.deepEqual(payload, RECORDS,
        'fast path must return the records exactly as before, no envelope.'
        +describe(result));
    assert.equal(harness.api.count(TRIGGER_PATH, 'POST'), 1,
        'fast path must trigger the collection exactly once');
});

test('dataset tool that exceeds the budget resolves with a running envelope',
    {timeout: TEST_TIMEOUT_MS}, async()=>{
    const harness = await small_harness();
    harness.api.reset({
        trigger: ()=>({status: 200, body: {snapshot_id: 'snap_slow'}}),
        snapshot: ()=>({status: 200, body: RUNNING_BODY}),
    });
    const {result, ms} = await call_tool(harness, DATASET_TOOL,
        {url: PRODUCT_URL});
    assert_running_envelope(result, 'snap_slow', 'budget expiry');
    assert.ok(ms < SMALL_BUDGET_MS+SLACK_MS,
        `budget expiry must return promptly, took ${ms}ms with a `
        +`${SMALL_BUDGET_MS}ms budget`);
    assert.equal(harness.api.count(TRIGGER_PATH, 'POST'), 1,
        'budget expiry must not re-trigger the collection (that double bills)');
    assert.ok(harness.api.count(snapshot_path('snap_slow'), 'GET')>=1,
        'budget expiry must have polled the snapshot at least once');
});

test('running envelope warns against re-triggering and mentions billing',
    {timeout: TEST_TIMEOUT_MS}, async()=>{
    const harness = await small_harness();
    harness.api.reset({
        trigger: ()=>({status: 200, body: {snapshot_id: 'snap_warn'}}),
        snapshot: ()=>({status: 200, body: RUNNING_BODY}),
    });
    const {result} = await call_tool(harness, DATASET_TOOL,
        {url: PRODUCT_URL});
    const payload = assert_running_envelope(result, 'snap_warn', 'warning');
    assert.match(payload.warning, /re-?trigger|trigger.*again|same url/i,
        'the warning must tell the caller not to re-trigger the same URL: '
        +payload.warning);
    assert.match(payload.warning, /bill|charge|cost|pay/i,
        'the warning must say a second collection is billable: '
        +payload.warning);
});

test('web_data_snapshot returns the records when the snapshot is ready',
    {timeout: TEST_TIMEOUT_MS}, async()=>{
    const harness = await small_harness();
    await assert_tool_exists(harness, SNAPSHOT_TOOL);
    harness.api.reset({
        trigger: ()=>({status: 500,
            body: {error: 'web_data_snapshot must not trigger a collection'}}),
        snapshot: ()=>({status: 200, body: RECORDS}),
    });
    const {result, payload} = await call_tool(harness, SNAPSHOT_TOOL,
        {snapshot_id: 'snap_ready'});
    assert_ok(result, 'web_data_snapshot on a ready snapshot');
    assert.deepEqual(payload, RECORDS,
        'web_data_snapshot must return records in the same shape as the '
        +'dataset tools.'+describe(result));
    assert.equal(harness.api.count(TRIGGER_PATH, 'POST'), 0,
        'web_data_snapshot must never trigger a new (billable) collection');
});

test('web_data_snapshot long-polls more than once before giving up',
    {timeout: TEST_TIMEOUT_MS}, async()=>{
    const harness = await large_harness();
    await assert_tool_exists(harness, SNAPSHOT_TOOL);
    harness.api.reset({
        trigger: ()=>({status: 500,
            body: {error: 'web_data_snapshot must not trigger a collection'}}),
        snapshot: ()=>({status: 200, body: RUNNING_BODY}),
    });
    const {result, ms} = await call_tool(harness, SNAPSHOT_TOOL,
        {snapshot_id: 'snap_still_running'});
    const polls = harness.api.count(snapshot_path('snap_still_running'), 'GET');
    assert.ok(polls > 1,
        `web_data_snapshot must long-poll server side, it made ${polls} HTTP `
        +`call(s) in a single tool call with a ${LARGE_BUDGET_MS}ms budget; `
        +'one check per call would cost ~25 agent turns on a 750s collection');
    assert.ok(ms < LARGE_BUDGET_MS+SLACK_MS,
        `web_data_snapshot must stop at the budget, took ${ms}ms`);
    assert.equal(harness.api.count(TRIGGER_PATH, 'POST'), 0,
        'web_data_snapshot must never trigger a new (billable) collection');
    assert_running_envelope(result, 'snap_still_running',
        'web_data_snapshot on a running snapshot');
});

test('the snapshot_id handed back on expiry retrieves the billed records',
    {timeout: TEST_TIMEOUT_MS}, async()=>{
    const harness = await small_harness();
    await assert_tool_exists(harness, SNAPSHOT_TOOL);
    let ready = false;
    harness.api.reset({
        trigger: ()=>({status: 200, body: {snapshot_id: 'snap_handoff'}}),
        snapshot: ()=>ready ? {status: 200, body: RECORDS}
            : {status: 200, body: RUNNING_BODY},
    });
    const first = await call_tool(harness, DATASET_TOOL, {url: PRODUCT_URL});
    const envelope = assert_running_envelope(first.result, 'snap_handoff',
        'the hand-off');
    ready = true;
    const second = await call_tool(harness, SNAPSHOT_TOOL,
        {snapshot_id: envelope.snapshot_id});
    assert_ok(second.result, 'collecting with the handed back snapshot_id');
    assert.deepEqual(second.payload, RECORDS,
        'the snapshot_id from the envelope must retrieve the records that '
        +'were already paid for.'+describe(second.result));
    assert.equal(harness.api.count(TRIGGER_PATH, 'POST'), 1,
        'the whole hand-off must cost exactly one billable trigger');
});

test('DATASET_WAIT_BUDGET_MS bounds the server side wait',
    {timeout: TEST_TIMEOUT_MS}, async()=>{
    const small = await small_harness();
    const large = await large_harness();
    const scenario = {
        trigger: ()=>({status: 200, body: {snapshot_id: 'snap_budget'}}),
        snapshot: ()=>({status: 200, body: RUNNING_BODY}),
    };
    small.api.reset(scenario);
    large.api.reset(scenario);
    const short = await call_tool(small, DATASET_TOOL, {url: PRODUCT_URL});
    assert_running_envelope(short.result, 'snap_budget', 'small budget call');
    assert.ok(short.ms < SMALL_BUDGET_MS+SLACK_MS,
        `a ${SMALL_BUDGET_MS}ms budget must return in about that time, took `
        +`${short.ms}ms (the legacy path blocks for minutes)`);
    const long = await call_tool(large, DATASET_TOOL, {url: PRODUCT_URL});
    assert_running_envelope(long.result, 'snap_budget', 'large budget call');
    assert.ok(long.ms < LARGE_BUDGET_MS+SLACK_MS,
        `a ${LARGE_BUDGET_MS}ms budget must return in about that time, took `
        +`${long.ms}ms`);
    assert.ok(long.ms > short.ms,
        `the wait must follow DATASET_WAIT_BUDGET_MS: ${SMALL_BUDGET_MS}ms `
        +`budget took ${short.ms}ms, ${LARGE_BUDGET_MS}ms budget took `
        +`${long.ms}ms`);
    const polls = large.api.count(snapshot_path('snap_budget'), 'GET');
    assert.ok(polls > 1,
        `the dataset tool must keep polling for the whole budget, it made `
        +`${polls} HTTP call(s)`);
});

test('no tool exposes a caller settable wait budget',
    {timeout: TEST_TIMEOUT_MS}, async()=>{
    const harness = await small_harness();
    const tools = await list_tools(harness);
    const wait_like = /wait|budget|deadline|timeout|poll|interval|blocking/i;
    for (const tool of tools)
    {
        const properties = Object.keys(tool.inputSchema?.properties||{});
        if (tool.name.startsWith('web_data_'))
        {
            const offenders = properties.filter(name=>wait_like.test(name));
            assert.deepEqual(offenders, [],
                `${tool.name} must not let the caller set the wait budget, `
                +`found: ${offenders.join(', ')}`);
        }
        const budget_like = properties
            .filter(name=>/budget|_ms$|dataset_wait/i.test(name));
        assert.deepEqual(budget_like, [],
            `${tool.name} must not expose the wait budget as a parameter, `
            +`found: ${budget_like.join(', ')}`);
    }
    const snapshot_tool = tools.find(tool=>tool.name==SNAPSHOT_TOOL);
    assert.ok(snapshot_tool, `${SNAPSHOT_TOOL} must be registered`);
    assert.ok(Object.keys(snapshot_tool.inputSchema?.properties||{})
        .includes('snapshot_id'),
        `${SNAPSHOT_TOOL} must take a snapshot_id parameter`);
    assert.deepEqual(snapshot_tool.inputSchema?.required||[], ['snapshot_id'],
        `${SNAPSHOT_TOOL} must require snapshot_id and nothing else`);
});

test('a per call wait argument cannot extend the budget',
    {timeout: TEST_TIMEOUT_MS}, async()=>{
    const harness = await small_harness();
    harness.api.reset({
        trigger: ()=>({status: 200, body: {snapshot_id: 'snap_override'}}),
        snapshot: ()=>({status: 200, body: RUNNING_BODY}),
    });
    let call;
    try {
        call = await call_tool(harness, DATASET_TOOL, {
            url: PRODUCT_URL,
            wait_budget_ms: 600000,
            timeout: 600,
            DATASET_WAIT_BUDGET_MS: 600000,
        });
    } catch(e){
        // Rejecting the unknown argument outright also satisfies the
        // contract: there is no way to set the budget per call.
        return;
    }
    assert.ok(call.ms < SMALL_BUDGET_MS+SLACK_MS,
        `an unknown wait argument must be ignored, the call took ${call.ms}ms `
        +`with a ${SMALL_BUDGET_MS}ms server budget`);
    if (!call.result.isError)
    {
        assert_running_envelope(call.result, 'snap_override',
            'call with an unknown wait argument');
    }
});

test('a failing trigger is an error, never a running envelope',
    {timeout: TEST_TIMEOUT_MS}, async()=>{
    const harness = await small_harness();
    harness.api.reset({
        trigger: ()=>({status: 401, body: {error: 'Invalid API token'}}),
        snapshot: ()=>({status: 200, body: RUNNING_BODY}),
    });
    const {result} = await call_tool(harness, DATASET_TOOL,
        {url: PRODUCT_URL});
    assert_error_not_running(result, 'a 401 from the trigger endpoint');
});

test('a trigger response without a snapshot_id is an error',
    {timeout: TEST_TIMEOUT_MS}, async()=>{
    const harness = await small_harness();
    harness.api.reset({
        trigger: ()=>({status: 200, body: {message: 'no snapshot for you'}}),
        snapshot: ()=>({status: 200, body: RUNNING_BODY}),
    });
    const {result} = await call_tool(harness, DATASET_TOOL,
        {url: PRODUCT_URL});
    assert_error_not_running(result, 'a trigger with no snapshot_id');
});

test('a 4xx while polling the snapshot is an error, never a running envelope',
    {timeout: TEST_TIMEOUT_MS}, async()=>{
    const harness = await small_harness();
    harness.api.reset({
        trigger: ()=>({status: 200, body: {snapshot_id: 'snap_4xx'}}),
        snapshot: ()=>({status: 400, body: {error: 'Invalid snapshot id'}}),
    });
    const {result} = await call_tool(harness, DATASET_TOOL,
        {url: PRODUCT_URL});
    assert_error_not_running(result, 'a 400 from the snapshot endpoint');
});

test('web_data_snapshot on an unknown snapshot id is an error',
    {timeout: TEST_TIMEOUT_MS}, async()=>{
    const harness = await small_harness();
    await assert_tool_exists(harness, SNAPSHOT_TOOL);
    harness.api.reset({
        trigger: ()=>({status: 500, body: {error: 'must not trigger'}}),
        snapshot: ()=>({status: 404, body: {error: 'Snapshot not found'}}),
    });
    const {result} = await call_tool(harness, SNAPSHOT_TOOL,
        {snapshot_id: 'snap_does_not_exist'});
    assert_error_not_running(result, 'web_data_snapshot on a missing snapshot');
    assert.equal(harness.api.count(TRIGGER_PATH, 'POST'), 0,
        'a missing snapshot must not be retried by triggering a new one');
});

test('snapshot records that contain error fields are passed through as data',
    {timeout: TEST_TIMEOUT_MS}, async()=>{
    const harness = await small_harness();
    harness.api.reset({
        trigger: ()=>({status: 200, body: {snapshot_id: 'snap_dead_page'}}),
        snapshot: ()=>({status: 200, body: ERROR_RECORDS}),
    });
    const {result, payload} = await call_tool(harness, DATASET_TOOL,
        {url: PRODUCT_URL});
    assert_ok(result, 'an error record');
    assert.deepEqual(payload, ERROR_RECORDS,
        'error records must reach the caller as data, unchanged.'
        +describe(result));
});

test('web_data_snapshot on a ready snapshot with error records passes them '
    +'through too', {timeout: TEST_TIMEOUT_MS}, async()=>{
    const harness = await small_harness();
    await assert_tool_exists(harness, SNAPSHOT_TOOL);
    harness.api.reset({
        trigger: ()=>({status: 500, body: {error: 'must not trigger'}}),
        snapshot: ()=>({status: 200, body: ERROR_RECORDS}),
    });
    const {result, payload} = await call_tool(harness, SNAPSHOT_TOOL,
        {snapshot_id: 'snap_dead_page'});
    assert_ok(result, 'web_data_snapshot with error records');
    assert.deepEqual(payload, ERROR_RECORDS,
        'web_data_snapshot must pass error records through as data.'
        +describe(result));
});

test('a snapshot that becomes ready mid poll returns the records, not a '
    +'handle', {timeout: TEST_TIMEOUT_MS}, async()=>{
    const harness = await large_harness();
    harness.api.reset({
        trigger: ()=>({status: 200, body: {snapshot_id: 'snap_eventually'}}),
        snapshot: (id, attempt)=>attempt<2 ? {status: 200, body: RUNNING_BODY}
            : {status: 200, body: RECORDS},
    });
    const {result, payload, ms} = await call_tool(harness, DATASET_TOOL,
        {url: PRODUCT_URL});
    assert_ok(result, 'a snapshot that completes on the second poll');
    assert.deepEqual(payload, RECORDS,
        'a snapshot that becomes ready inside the budget must return the '
        +'records, not a handle.'+describe(result));
    assert.ok(ms < LARGE_BUDGET_MS+SLACK_MS,
        `the call must not outlive the budget, took ${ms}ms`);
});

test('the shipped default configuration still returns records on the fast '
    +'path', {timeout: TEST_TIMEOUT_MS}, async()=>{
    const harness = await default_harness();
    harness.api.reset({
        trigger: ()=>({status: 200, body: {snapshot_id: 'snap_default'}}),
        snapshot: ()=>({status: 200, body: RECORDS}),
    });
    const {result, payload} = await call_tool(harness, DATASET_TOOL,
        {url: PRODUCT_URL});
    assert_ok(result, 'fast path with DATASET_WAIT_BUDGET_MS unset');
    assert.deepEqual(payload, RECORDS,
        'the default configuration must behave exactly as before.'
        +describe(result));
});

// The documented default is 45000ms. Waiting for all of it would make the
// suite useless, so this only proves the default is a real multi-second
// budget and not 0, unset or a typo.
test('the default budget keeps waiting well past a few seconds',
    {timeout: TEST_TIMEOUT_MS}, async()=>{
    const harness = await default_harness();
    harness.api.reset({
        trigger: ()=>({status: 200, body: {snapshot_id: 'snap_default_wait'}}),
        snapshot: ()=>({status: 200, body: RUNNING_BODY}),
    });
    const pending = call_tool(harness, DATASET_TOOL, {url: PRODUCT_URL});
    // The call is abandoned here; the child is killed when the suite ends.
    pending.catch(()=>{});
    const early = await Promise.race([
        pending,
        new Promise(done=>setTimeout(()=>done(null), DEFAULT_MIN_WAIT_MS)),
    ]);
    assert.equal(early, null,
        'with DATASET_WAIT_BUDGET_MS unset the server must keep waiting for '
        +`at least ${DEFAULT_MIN_WAIT_MS}ms (the documented default is `
        +`45000ms), but it gave up after ${early?.ms}ms.`
        +describe(early?.result));
});
