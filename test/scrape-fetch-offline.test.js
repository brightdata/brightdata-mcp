'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {unwrap} from '../test-helpers/untrusted.js';
import {start_stub_server, close_stub_server, long_text}
    from '../test-helpers/stub-server.js';

const repo_root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('scrape_as_markdown on the Fetch API, fully offline', async t=>{
    const stub = await start_stub_server();
    t.after(()=>close_stub_server(stub));
    const env = {...process.env, API_TOKEN: 'fetch-test-token',
        __BRD_TEST_STUB_URL: `http://127.0.0.1:${stub.address().port}`};
    delete env.GROUPS;
    delete env.TOOLS;
    const client = new Client({name: 'fetch-test', version: '0'},
        {capabilities: {tools: {}}});
    const transport = new StdioClientTransport({cwd: repo_root, env,
        command: process.execPath,
        args: ['--import', './test-helpers/redirect-api.mjs', 'server.js']});
    t.after(()=>client.close());
    await client.connect(transport);
    const scrape = async(url, more = {})=>{
        const res = await client.callTool({name: 'scrape_as_markdown',
            arguments: {url, ...more}});
        return {is_error: !!res.isError, text: res.content[0].text};
    };
    const calls = url=>stub.observed_requests
        .filter(r=>r.body?.[0]?.url==url).length;

    const ok = await scrape('https://good.example/');
    assert.equal(ok.is_error, false);
    assert.deepEqual(JSON.parse(unwrap(ok.text)), {
        url: 'https://good.example/', title: 'Stub', format: 'markdown',
        content: '# Example\n\nHello world.',
        note: 'Note: only 23 characters of text. If you expected more, the '
            +'page needs JavaScript.'});

    const slow = await scrape('https://slow.example/');
    assert.equal(slow.is_error, true);
    assert.match(slow.text,
        /^Page timed out: https:\/\/slow.example\/ did not load/);

    const flaky = await scrape('https://flaky.example/');
    assert.equal(flaky.is_error, false, 'one 5xx is retried');
    assert.equal(calls('https://flaky.example/'), 2);

    const busy = await scrape('https://busy.example/');
    assert.match(busy.text, /^Rate limited: .* Details: /);
    assert.equal(calls('https://busy.example/'), 1, '429 is never retried');

    const long = 'https://long.example/';
    const first = JSON.parse(unwrap((await scrape(long)).text));
    assert.deepEqual(first.next, {snapshot_id: 'sd_stub1', start: 39996});
    const rest = JSON.parse(unwrap((await scrape(long, first.next)).text));
    assert.equal(first.content+rest.content, long_text.slice(0, 79984));
    assert.equal(calls(long), 1, 'the rest is read from the snapshot');
    assert.ok(stub.observed_requests.some(r=>
        r.url?.startsWith('/datasets/v3/snapshot/sd_stub1')));

    const gone = await scrape(long, {snapshot_id: 'sd_gone', start: 10});
    assert.equal(gone.is_error, true);
    assert.match(gone.text, /^Snapshot not found: Snapshot sd_gone is gone/);
});
