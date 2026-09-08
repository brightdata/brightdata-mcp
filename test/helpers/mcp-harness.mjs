'use strict'; /*jslint node:true es9:true*/
// Test-only helper. It is NOT a test file: it registers no tests and starts
// nothing on import.
//
// A mock Bright Data API plus an MCP-over-stdio harness, shared by the
// contract tests for the async snapshot handle feature. It is a superset of
// the private harness inside dataset-wait-budget.test.js and adds the two
// things those tests do not need:
//   1. handlers may be async, so a call can be made to take longer than the
//      wait budget on purpose,
//   2. the child's environment is fully caller-controlled, so tool selection
//      (TOOLS/GROUPS instead of PRO_MODE) and bad budget values can be tested.
//
// Every request the server makes to api.brightdata.com is redirected to this
// mock by test/helpers/mock-api-preload.mjs (loaded with `node --import`), so
// no real call is ever made. A real POST /datasets/v3/trigger costs money.
//
// Set MCP_TEST_STDERR=1 to see the server's own logs while debugging.
import http from 'node:http';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {dirname, resolve, join} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const helpers_dir = dirname(fileURLToPath(import.meta.url));
export const repo_root = resolve(helpers_dir, '..', '..');
const preload = pathToFileURL(join(helpers_dir, 'mock-api-preload.mjs')).href;

export const TRIGGER_PATH = '/datasets/v3/trigger';
export const snapshot_path = id=>`/datasets/v3/snapshot/${id}`;
export const sleep = ms=>new Promise(done=>setTimeout(done, ms));

// ---------------------------------------------------------------- mock API

// Handlers are (…)=>({status, body}) and may return a promise.
//   trigger:  (call)=>reply
//   snapshot: (snapshot_id, attempt, call)=>reply   attempt starts at 1
// Any path that is not mocked answers 404, so a request the server was not
// supposed to make shows up as a failure rather than as silence.
export async function start_mock_api(){
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
        req.on('end', async()=>{
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
            try {
                const reply = await route(call, url);
                if (reply)
                    return void send_json(res, reply.status||200, reply.body);
                return void send_json(res, 404,
                    {error: `unmocked ${req.method} ${url.pathname}`});
            } catch(e){
                return void send_json(res, 500, {error: `mock: ${e.message}`});
            }
        });
    });
    const route = async(call, url)=>{
        if (url.pathname=='/zone/get_active_zones')
            return {status: 200, body: [{name: 'mcp_unlocker'},
                {name: 'mcp_browser'}]};
        if (url.pathname==TRIGGER_PATH)
        {
            return state.trigger ? await state.trigger(call)
                : {status: 200, body: {snapshot_id: `snap_${++state.next_id}`}};
        }
        const match = url.pathname
            .match(/^\/datasets\/v3\/snapshot\/([^/]+)$/);
        if (match)
        {
            const attempt = state.calls.filter(c=>c.path==url.pathname).length;
            return state.snapshot ? await state.snapshot(match[1], attempt,
                call) : {status: 200, body: {status: 'running'}};
        }
        return null;
    };
    // axios keeps connections alive, so close() has to destroy them or the
    // suite hangs at teardown.
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

export const harnesses = [];

// Anything the server reads from the environment is cleared first, so the
// suite behaves the same on a developer box that exports API_TOKEN, GROUPS or
// DATASET_WAIT_BUDGET_MS. An env value of null means "leave it unset".
const server_env_keys = ['API_TOKEN', 'PRO_MODE', 'GROUPS', 'TOOLS',
    'DATASET_WAIT_BUDGET_MS', 'POLLING_TIMEOUT', 'WEB_UNLOCKER_ZONE',
    'BROWSER_ZONE', 'BASE_TIMEOUT', 'BASE_MAX_RETRIES', 'RATE_LIMIT'];

export async function start_harness({env: extra = {}, budget_ms} = {}){
    const api = await start_mock_api();
    const env = {...process.env};
    for (const key of server_env_keys)
        delete env[key];
    Object.assign(env, {
        API_TOKEN: 'dummy-token',
        PRO_MODE: 'true',
        // Bounds the damage if the server ignores the budget entirely:
        // without this the legacy path blocks for 600s per call.
        POLLING_TIMEOUT: '30',
        MOCK_BRIGHTDATA_BASE: api.base_url,
    });
    if (budget_ms!==undefined)
        env.DATASET_WAIT_BUDGET_MS = String(budget_ms);
    Object.assign(env, extra);
    for (const [key, value] of Object.entries(env))
    {
        if (value===null || value===undefined)
            delete env[key];
    }
    const client = new Client({name: 'async-snapshot-contract-test',
        version: '0.0.1'}, {capabilities: {tools: {}}});
    const transport = new StdioClientTransport({
        command: process.execPath,
        // MCP_SERVER_ENTRY exists so the suite can be pointed at another
        // checkout of the server, e.g. `git show HEAD:server.js` written to a
        // scratch file, to prove a regression test fails on the code it is
        // meant to pin. Defaults to the working tree's server.js.
        args: ['--import', preload,
            process.env.MCP_SERVER_ENTRY || 'server.js'],
        cwd: repo_root,
        env,
        stderr: process.env.MCP_TEST_STDERR ? 'inherit' : 'ignore',
    });
    await client.connect(transport);
    const harness = {
        client,
        api,
        async close(){
            try { await client.close(); } catch(e){ /* already gone */ }
            await api.close();
        },
    };
    harnesses.push(harness);
    return harness;
}

export async function close_all(){
    for (const harness of harnesses)
        await harness.close();
    harnesses.length = 0;
}

// One child process per environment, started on first use and reused: the
// budget and the tool selection are env-only by design, so they cannot be
// varied per call.
export const lazy = fn=>{
    let promise = null;
    return ()=>promise||(promise = fn());
};

export async function call_tool(harness, name, args){
    const started = Date.now();
    const result = await harness.client.callTool({name, arguments: args});
    return {result, ms: Date.now()-started, payload: parse_payload(result)};
}

export async function list_tools(harness){
    const {tools} = await harness.client.listTools();
    return tools;
}

// --------------------------------------------------------------- payloads

export function tool_text(result){
    return (result?.content||[]).filter(block=>block.type=='text')
        .map(block=>block.text).join('\n');
}

const try_json = text=>{
    try { return JSON.parse(text); }
    catch(e){ return undefined; }
};

// The contract fixes the fields, not the transport, so accept the payload as
// a JSON text block, as JSON embedded in a text block, or as structured
// content.
export function parse_payload(result){
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

export const is_running = payload=>!!payload && !Array.isArray(payload)
    && typeof payload=='object' && payload.status=='running';

export function describe(result){
    return `\nisError=${result?.isError}\npayload=`
        +`${JSON.stringify(parse_payload(result))}\ntext=${tool_text(result)}`;
}

// Everything the caller could read as an explanation: the text blocks plus
// any structured payload. An error message is only useful if the agent can
// see it, so the assertions match against this and not against the server's
// internals.
export function visible_error(result){
    return `${tool_text(result)}\n${JSON.stringify(parse_payload(result))}`;
}
