'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {unwrap} from '../test-helpers/untrusted.js';
import {start_stub_server, close_stub_server}
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
    const scrape = async url=>{
        const res = await client.callTool({name: 'scrape_as_markdown',
            arguments: {url}});
        return {is_error: !!res.isError, text: res.content[0].text};
    };
    const calls = url=>stub.observed_requests
        .filter(r=>r.body?.[0]?.url==url).length;

    const ok = await scrape('https://good.example/');
    assert.equal(ok.is_error, false);
    assert.deepEqual(JSON.parse(unwrap(ok.text)), {
        url: 'https://good.example/', title: 'Stub', format: 'markdown',
        content: '# Example\n\nHello world.', snapshot_id: 'sd_stub1',
        other_formats: ['text'],
        note: 'Note: only 23 characters of text. If you expected more, the '
            +'page renders with JavaScript; use the browser tools.'});

    const slow = await scrape('https://slow.example/');
    assert.equal(slow.is_error, true);
    assert.match(slow.text, /^timeout: https:\/\/slow.example\/ did not/);

    const flaky = await scrape('https://flaky.example/');
    assert.equal(flaky.is_error, false, 'one 5xx is retried');
    assert.equal(calls('https://flaky.example/'), 2);

    const busy = await scrape('https://busy.example/');
    assert.match(busy.text, /^busy: /);
    assert.equal(calls('https://busy.example/'), 1, '429 is never retried');
});
