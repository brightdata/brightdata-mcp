'use strict'; /*jslint node:true es9:true*/
// Live: real Bright Data calls. Run with BRD_LIVE_TOKEN=<api token>.
import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {unwrap} from '../test-helpers/untrusted.js';

const token = process.env.BRD_LIVE_TOKEN;
const repo_root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const long_url = 'https://en.wikipedia.org/wiki/Python_(programming_language)';
const short_url = 'https://example.com/';
const opt = {skip: !token && 'set BRD_LIVE_TOKEN to run', timeout: 600000};

const connect = async t=>{
    const env = {...process.env, API_TOKEN: token};
    delete env.GROUPS;
    delete env.TOOLS;
    const client = new Client({name: 'live-paging', version: '0.0.1'});
    await client.connect(new StdioClientTransport({command: process.execPath,
        args: ['server.js'], cwd: repo_root, env}));
    t.after(()=>client.close());
    return async(name, args)=>{
        const res = await client.callTool({name, arguments: args},
            undefined, {timeout: 120000});
        const text = unwrap(res.content[0].text);
        return res.isError ? {error: text} : JSON.parse(text);
    };
};

const snapshot_record = async(snapshot_id, url)=>{
    const res = await axios.get('https://api.brightdata.com/datasets/v3/'
        +`snapshot/${snapshot_id}`, {params: {format: 'json'},
        headers: {authorization: `Bearer ${token}`}});
    return res.data.find(r=>r.input?.url==url);
};

const read_rest = async(call, url, format, next)=>{
    let text = '', page;
    while (next)
    {
        page = await call('scrape_as_markdown', {url, format, ...next});
        assert.equal(page.error, undefined, page.error);
        assert.ok(page.content.length<=40000);
        text += page.content;
        next = page.next;
    }
    return {text, last: page};
};

test('live: scrape_as_markdown reads a long page in parts', opt, async t=>{
    const call = await connect(t);
    const first = await call('scrape_as_markdown', {url: long_url});
    assert.match(first.next?.snapshot_id||'', /^sd_\w+$/);
    assert.match(first.note, /^Cut at [\d,]+ of [\d,]+ characters \(\d+%\)/);
    assert.equal(first.next.start, first.content.length);
    const full = (await snapshot_record(first.next.snapshot_id, long_url))
        .markdown;
    const {text, last} = await read_rest(call, long_url, 'markdown',
        first.next);
    assert.equal(first.content+text, full);
    assert.equal('next' in last, false);
    assert.match(last.note, /^Showing [\d,]+-([\d,]+) of \1 characters$/);
    const as_text = await call('scrape_as_markdown', {url: long_url,
        format: 'text', snapshot_id: first.next.snapshot_id, start: 0});
    assert.equal(as_text.format, 'text');
    assert.ok(as_text.content.length>0 && as_text.content.length<=40000);
    const past = await call('scrape_as_markdown', {url: long_url,
        snapshot_id: first.next.snapshot_id, start: full.length});
    assert.match(past.error, /^Start out of range: /);
    const other = await call('scrape_as_markdown', {url: short_url,
        snapshot_id: first.next.snapshot_id});
    assert.match(other.error, /^No data: /);
});

test('live: a missing snapshot says to fetch again', opt, async t=>{
    const call = await connect(t);
    const res = await call('scrape_as_markdown', {url: long_url,
        snapshot_id: 'sd_doesnotexist000000', start: 0});
    assert.match(res.error, /^Snapshot not found: .*no snapshot_id/);
});

test('live: scrape_batch shares 40k and each cut page reads on', opt,
    async t=>{
    const call = await connect(t);
    const items = await call('scrape_batch', {urls: [long_url, short_url,
        'https://httpbin.org/status/404']});
    assert.equal(items.error, undefined, items.error);
    const [long, short, dead] = items;
    assert.ok(dead.error, 'the 404 page is an error item');
    assert.equal('next' in short, false);
    assert.equal(long.content.length+short.content.length<=40000, true);
    assert.ok(long.content.length>40000-short.content.length-8000,
        'the long page gets what the short one left');
    const full = (await snapshot_record(long.next.snapshot_id, long_url))
        .markdown;
    const {text} = await read_rest(call, long_url, 'markdown', long.next);
    assert.equal(long.content+text, full);
});

test('live: a page from a batch cut by the 35 s cancel still reads on', opt,
    async t=>{
    const call = await connect(t);
    const [long, slow] = await call('scrape_batch', {urls: [long_url,
        'https://deelay.me/55000/https://example.com/']});
    assert.match(slow.error, /^Page timed out: /);
    const next = await call('scrape_as_markdown', {url: long_url,
        ...long.next});
    assert.equal(next.error, undefined, next.error);
    assert.match(next.note, /^Showing /);
});

test('live: a one-URL scrape_batch cut page also reads on', opt, async t=>{
    const call = await connect(t);
    const [page] = await call('scrape_batch', {urls: [long_url]});
    assert.match(page.next?.snapshot_id||'', /^sd_\w+$/);
    const next = await call('scrape_as_markdown', {url: long_url,
        ...page.next});
    assert.equal(next.error, undefined, next.error);
    assert.match(next.note, /^Showing /);
});
