'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {scraper_tools, scraper_tool_names} from '../scraper_tools.js';

const setup = (runner = {})=>{
    const calls = [];
    const spy = name=>async(...args)=>{
        calls.push([name, ...args]);
        return {ok: name};
    };
    const tools = scraper_tools({
        catalog: {search: spy('search'), get_details: spy('details'),
            load_catalog: async opt=>{
                calls.push(['load', opt]);
                return [1, 2, 3];
            }},
        runner: {run: spy('run'), progress: spy('progress'),
            results: spy('results'), ...runner},
        tool_fn: (name, fn)=>fn,
        headers: (ctx, name)=>({token: ctx.api_token, tool: name}),
    });
    const by_name = Object.fromEntries(tools.map(t=>[t.name, t]));
    const tool_meta = {};
    const call = (name, args)=>by_name[name].execute(
        by_name[name].parameters.parse(args), {api_token: 'tok', tool_meta});
    return {tools, by_name, calls, call, tool_meta};
};

test('tool names match scraper_tool_names', ()=>{
    assert.deepEqual(setup().tools.map(t=>t.name), scraper_tool_names);
});

test('tools pass ctx headers and return JSON', async()=>{
    const {call, calls} = setup();
    const h = {token: 'tok', tool: 'get_scraper_details'};
    assert.equal(await call('get_scraper_details',
        {dataset_id: 'gd_1', method: 'collect_by_url'}),
        '{"ok":"details"}');
    assert.deepEqual(calls.pop(), ['details', 'gd_1', 'collect_by_url', h]);
    await call('run_scraper', {dataset_id: 'gd_1',
        method: 'discover_by_keyword', input: [{keyword: 'x'}]});
    assert.deepEqual(calls.pop(), ['run', {dataset_id: 'gd_1',
        method: 'discover_by_keyword', input: [{keyword: 'x'}],
        limit_per_input: 10, headers: {token: 'tok', tool: 'run_scraper'}}]);
    await call('get_scraper_results', {snapshot_id: 's_1'});
    assert.deepEqual(calls.pop(), ['results', 's_1',
        {token: 'tok', tool: 'get_scraper_results'}]);
});

test('search uses the default limit, refresh forces a reload', async()=>{
    const {call, calls} = setup();
    await call('search_scrapers', {query: 'amazon'});
    assert.deepEqual(calls.pop().slice(0, 3), ['search', 'amazon', 10]);
    assert.equal(await call('refresh_scrapers', {}), '{"scrapers":3}');
    assert.deepEqual(calls.pop(), ['load', {force: true}]);
});

test('run_scraper rejects an empty input list', ()=>{
    const {by_name} = setup();
    assert.equal(by_name.run_scraper.parameters.safeParse({
        dataset_id: 'gd_1', method: 'collect_by_url', input: []}).success,
    false);
});

test('tools record the scraper and failed step in tool_meta', async()=>{
    const err = Object.assign(new Error('x'), {step: 'trigger',
        error_code: 401});
    const {call, tool_meta} = setup({run: async()=>{ throw err; }});
    await call('get_scraper_details', {dataset_id: 'gd_1',
        method: 'collect_by_url'});
    assert.deepEqual(tool_meta, {dataset_id: 'gd_1',
        method: 'collect_by_url'});
    await assert.rejects(call('run_scraper', {dataset_id: 'gd_2',
        method: 'collect_by_url', input: [{url: 'u'}]}), err);
    assert.deepEqual(tool_meta, {dataset_id: 'gd_2',
        method: 'collect_by_url', failed_step: 'trigger', error_code: 401});
});
