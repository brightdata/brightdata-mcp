'use strict'; /*jslint node:true es9:true*/
// The content gate end to end: a real server.js, spawned over stdio and pointed
// at the local stub, driven by a real MCP client that answers elicitation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {ElicitRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {start_stub_server, close_stub_server}
    from '../test-helpers/stub-server.js';

const repo_root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const POISONED = 'https://poisoned.example/page';
const CLEAN = 'https://good.example/page';

// Spawns a server against a fresh stub, connects a client, runs fn, and
// tears everything down. `answer` handles elicitation; omit `elicitation`
// to connect a client that cannot be asked.
async function with_gate({elicitation = true, answer, env: extra = {}} = {}, fn){
    const stub = await start_stub_server();
    const {port} = stub.address();
    const env = {...process.env, API_TOKEN: 'dummy-token',
        __BRD_TEST_STUB_URL: `http://127.0.0.1:${port}`,
        CONTENT_GATE_PROGRESS_MS: '100'};
    delete env.PRO_MODE; delete env.GROUPS; delete env.TOOLS;
    Object.assign(env, extra);
    const capabilities = {tools: {}};
    if (elicitation)
        capabilities.elicitation = {};
    const client = new Client({name: 'content-gate-test', version: '0.0.1'},
        {capabilities});
    const recorded = [];
    if (elicitation)
    {
        client.setRequestHandler(ElicitRequestSchema, async req=>{
            recorded.push(req.params);
            return answer ? await answer(req.params)
                : {action: 'accept', content: {return_content: true}};
        });
    }
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: ['--import', './test-helpers/redirect-api.mjs', 'server.js'],
        cwd: repo_root,
        env,
    });
    try {
        await client.connect(transport);
        return await fn({client, recorded});
    } finally {
        await client.close().catch(()=>{});
        await close_stub_server(stub);
    }
}

const text_of = result=>result.content.find(b=>b.type=='text')?.text ?? '';

test('approved: the user is asked once and the content is returned', async()=>{
    await with_gate({}, async({client, recorded})=>{
        const result = await client.callTool({name: 'scrape_as_markdown',
            arguments: {url: POISONED}});
        assert.equal(recorded.length, 1, 'exactly one dialog');
        assert.match(recorded[0].message, /npx -y/, 'the human sees the snippet');
        assert.ok(recorded[0].requestedSchema.properties.return_content);
        const text = text_of(result);
        assert.match(text, /Welcome\./);
        assert.match(text, /npx -y \.\/helper-demo/, 'content delivered as-is');
        assert.doesNotMatch(text, /was not returned/);
    });
});

test('declined: the content is withheld and none of it reaches the model',
    async()=>{
        await with_gate({answer: async()=>({action: 'decline'})},
            async({client, recorded})=>{
                const result = await client.callTool({name: 'scrape_as_markdown',
                    arguments: {url: POISONED}});
                assert.equal(recorded.length, 1);
                const text = text_of(result);
                assert.match(text, /was not returned/);
                assert.doesNotMatch(text, /Welcome\.|npx -y|helper-demo/,
                    'no page text in the refusal');
            });
    });

test('progress keeps the call alive while the user decides', async()=>{
    await with_gate({answer: ()=>new Promise(r=>setTimeout(()=>
        r({action: 'accept', content: {return_content: true}}), 350))},
    async({client})=>{
        let ticks = 0;
        const result = await client.callTool({name: 'scrape_as_markdown',
            arguments: {url: POISONED}}, undefined,
        {onprogress: ()=>{ ticks++; }});
        assert.ok(ticks>=1, `expected progress before the result, saw ${ticks}`);
        assert.match(text_of(result), /Welcome\./);
    });
});

test('scrape_batch: a declined item is withheld, the rest survive, one dialog',
    async()=>{
        await with_gate({answer: async()=>({action: 'decline'})},
            async({client, recorded})=>{
                const result = await client.callTool({name: 'scrape_batch',
                    arguments: {urls: [CLEAN, POISONED]}});
                assert.equal(recorded.length, 1);
                const items = JSON.parse(text_of(result));
                assert.equal(items.length, 2);
                assert.equal(items[0].status, 'fulfilled');
                assert.match(items[0].value.content, /Hello world\./);
                assert.equal(items[1].status, 'rejected');
                assert.equal(items[1].url, POISONED);
                assert.match(items[1].reason, /was not returned/);
                assert.doesNotMatch(items[1].reason, /helper-demo|npx -y/);
            });
    });

test('a clean page is returned untouched and nobody is asked', async()=>{
    await with_gate({}, async({client, recorded})=>{
        const result = await client.callTool({name: 'scrape_as_markdown',
            arguments: {url: CLEAN}});
        assert.equal(recorded.length, 0);
        assert.match(text_of(result), /Hello world\./);
    });
});

test('a non-gated tool is unaffected', async()=>{
    // session_stats is a pro-mode tool, so this case enables the full set.
    await with_gate({env: {PRO_MODE: 'true'}}, async({client, recorded})=>{
        const result = await client.callTool({name: 'session_stats',
            arguments: {}});
        assert.equal(recorded.length, 0);
        assert.match(text_of(result), /Tool calls this session:/);
    });
});

test('a client without elicitation support gets the content withheld',
    async()=>{
        await with_gate({elicitation: false}, async({client})=>{
            const result = await client.callTool({name: 'scrape_as_markdown',
                arguments: {url: POISONED}});
            const text = text_of(result);
            assert.match(text, /was not returned/);
            assert.doesNotMatch(text, /helper-demo/);
        });
    });

test('CONTENT_GATE=off returns the content even when nobody can be asked',
    async()=>{
        await with_gate({elicitation: false, env: {CONTENT_GATE: 'off'}},
            async({client})=>{
                const result = await client.callTool({name: 'scrape_as_markdown',
                    arguments: {url: POISONED}});
                assert.match(text_of(result), /helper-demo/);
            });
    });
