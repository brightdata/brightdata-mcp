'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {create_scraper_run} from '../scraper_run.js';

const send = (res, code, body)=>{
    res.writeHead(code, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(body));
};

const route = (state, req, res, body)=>{
    const url = new URL(req.url, 'http://x'), path = url.pathname;
    state.paths.push(path);
    if (state.fail[path.split('/')[3]])
        return send(res, state.fail[path.split('/')[3]], {error: 'boom'});
    if (path=='/datasets/v3/trigger')
    {
        state.trigger = {params: Object.fromEntries(url.searchParams),
            body: JSON.parse(body), auth: req.headers.authorization};
        const reply = state.no_id ? {} : {snapshot_id: 's_1'};
        return void setTimeout(()=>send(res, 200, reply),
            state.trigger_delay||0);
    }
    if (path=='/datasets/v3/progress/s_1')
        return send(res, 200, {snapshot_id: 's_1', status: 'running'});
    if (path=='/datasets/v3/snapshot/s_1')
    {
        if (state.polls++<state.ready_after)
            return send(res, 202, {status: 'running', message: 'not ready'});
        return send(res, 200, [{title: 'a', price: null}]);
    }
    return send(res, 404, {});
};

const setup = t=>new Promise(done=>{
    const state = {paths: [], fail: {}, polls: 0, ready_after: 0};
    const server = http.createServer((req, res)=>{
        let body = '';
        req.on('data', c=>body += c);
        req.on('end', ()=>route(state, req, res, body));
    });
    t.after(()=>server.close());
    server.listen(0, '127.0.0.1', ()=>done({state, sr: create_scraper_run({
        api_url: `http://127.0.0.1:${server.address().port}`, poll_ms: 5})}));
});

const headers = {Authorization: 'Bearer k'};

test('collect_by_url triggers without discover params', async t=>{
    const {sr, state} = await setup(t);
    assert.equal(await sr.trigger({dataset_id: 'gd_1',
        method: 'collect_by_url', input: {url: 'https://a.com'}, headers}),
        's_1');
    assert.deepEqual(state.trigger, {auth: 'Bearer k',
        params: {dataset_id: 'gd_1', include_errors: 'true'},
        body: [{url: 'https://a.com'}]});
});

test('discover methods pass discover_by and limit_per_input', async t=>{
    const {sr, state} = await setup(t);
    await sr.trigger({dataset_id: 'gd_1', method: 'discover_by_sietmap',
        input: [{url: 'https://a.com'}, {url: 'https://b.com'}]});
    assert.deepEqual(state.trigger.params, {dataset_id: 'gd_1',
        include_errors: 'true', type: 'discover_new',
        discover_by: 'sietmap', limit_per_input: '10'});
    assert.equal(state.trigger.body.length, 2);
    await sr.trigger({dataset_id: 'gd_1', method: 'discover_by_keyword',
        input: {keyword: 'x'}, limit_per_input: 50});
    assert.equal(state.trigger.params.limit_per_input, '50');
});

test('progress and results report status', async t=>{
    const {sr, state} = await setup(t);
    state.ready_after = 1;
    assert.equal((await sr.progress('s_1')).status, 'running');
    assert.deepEqual(await sr.results('s_1'),
        {snapshot_id: 's_1', status: 'running'});
    assert.deepEqual(await sr.results('s_1'),
        {snapshot_id: 's_1', status: 'ready', data: [{title: 'a'}]});
});

test('snapshot id is encoded into the path', async t=>{
    const {sr, state} = await setup(t);
    await assert.rejects(sr.results('../../zone'), /HTTP 404/);
    assert.deepEqual(state.paths, ['/datasets/v3/snapshot/..%2F..%2Fzone']);
});

test('run waits until the snapshot is ready', async t=>{
    const {sr, state} = await setup(t);
    state.ready_after = 3;
    const res = await sr.run({dataset_id: 'gd_1', method: 'collect_by_url',
        input: {url: 'https://a.com'}});
    assert.equal(res.status, 'ready');
    assert.equal(state.polls, 4);
});

test('run counts the trigger time against the wait', async t=>{
    const {sr, state} = await setup(t);
    state.ready_after = Infinity;
    state.trigger_delay = 50;
    const res = await sr.run({dataset_id: 'gd_1', method: 'collect_by_url',
        input: {url: 'https://a.com'}, wait_ms: 30});
    assert.equal(res.status, 'running');
    assert.equal(state.polls, 1);
});

test('run returns the snapshot id when the wait runs out', async t=>{
    const {sr, state} = await setup(t);
    state.ready_after = Infinity;
    const res = await sr.run({dataset_id: 'gd_1', method: 'collect_by_url',
        input: {url: 'https://a.com'}, wait_ms: 30});
    assert.deepEqual(res, {snapshot_id: 's_1', status: 'running'});
    assert.ok(state.polls>1);
});

for (const [step, call] of [
    ['trigger', sr=>sr.run({dataset_id: 'gd_1', method: 'collect_by_url',
        input: {}})],
    ['progress', sr=>sr.progress('s_1')],
    ['snapshot', sr=>sr.run({dataset_id: 'gd_1', method: 'collect_by_url',
        input: {}})],
])
{
    for (const code of [400, 500])
    {
        test(`${step} HTTP ${code} reports the step and API message`,
        async t=>{
            const {sr, state} = await setup(t);
            state.fail[step] = code;
            const name = step=='snapshot' ? 'results' : step;
            await assert.rejects(call(sr), err=>err.step==name
                && err.message==`${name} failed (HTTP ${code}): `
                +'{"error":"boom"}');
        });
    }
}

test('trigger without snapshot_id is an error', async t=>{
    const {sr, state} = await setup(t);
    state.no_id = true;
    await assert.rejects(sr.trigger({dataset_id: 'gd_1',
        method: 'collect_by_url', input: {}}),
        /trigger failed: no snapshot_id returned/);
});
