'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {business_search_tool, business_search_schema, BUSINESS_SEARCH_RULES}
    from '../business_search.js';
import {api_error} from '../errors.js';

const text_q = 'US software companies with 50 to 500 employees';
const tree_q = {and: [{text: {industry: 'software'}},
    {equals: {headquarters_country_code: 'US'}}]};
const parse = args=>business_search_schema.safeParse(args);
const ok = args=>assert.equal(parse(args).success, true,
    JSON.stringify(parse(args).error?.issues));
const bad = (args, re)=>{
    const r = parse(args);
    assert.equal(r.success, false);
    if (re)
        assert.match(r.error.issues.map(i=>i.message).join('\n'), re);
};

const setup = (reply = {data: {req_id: 'r1', documents: []}})=>{
    const calls = [];
    const tool = business_search_tool({
        tool_fn: (name, fn)=>fn,
        headers: (ctx, name)=>({token: ctx.api_token, tool: name}),
        request: async(config, ctx)=>{
            calls.push({...config, ctx});
            if (reply instanceof Error)
                throw reply;
            return reply;
        },
    });
    const call = args=>tool.execute(tool.parameters.parse(args),
        {api_token: 'tok'});
    return {tool, calls, call};
};

const http_error = (status, data)=>Object.assign(
    new Error(`Request failed with status code ${status}`),
    {isAxiosError: true, response: {status, data, headers: {}}});

test('defaults: mode instant, view summary, offset 0, limit 10', ()=>{
    assert.deepEqual(parse({category: 'company', query: text_q}).data,
        {category: 'company', query: text_q, mode: 'instant',
            view: 'summary', offset: 0, limit: 10});
});

test('category is required and only company or people', ()=>{
    bad({query: text_q});
    bad({category: 'ecommerce', query: text_q});
    ok({category: 'people', query: text_q});
});

test('text query: 1-200 characters after trim', ()=>{
    bad({category: 'company', query: 'x'.repeat(201)});
    bad({category: 'company', query: '   '});
    ok({category: 'company', query: '  '+'x'.repeat(200)+'  '});
    assert.equal(parse({category: 'company',
        query: ' fintech '}).data.query, 'fintech');
});

test('query type must match the mode', ()=>{
    bad({category: 'company', query: text_q, mode: 'ludicrous'},
        /ludicrous takes a JSON query/);
    bad({category: 'company', query: tree_q}, /ludicrous takes a JSON/);
    bad({category: 'company', query: tree_q, mode: 'smart'});
    ok({category: 'company', query: tree_q, mode: 'ludicrous'});
});

test('limit 1-10 in every mode', ()=>{
    for (const mode of ['instant', 'smart'])
    {
        bad({category: 'company', query: text_q, mode, limit: 0});
        bad({category: 'company', query: text_q, mode, limit: 11});
    }
    bad({category: 'company', query: tree_q, mode: 'ludicrous', limit: 11});
    bad({category: 'company', query: text_q, limit: true});
    bad({category: 'company', query: text_q, limit: 2.5});
});

test('instant and smart: offset+limit 100 or less', ()=>{
    for (const mode of ['instant', 'smart'])
    {
        ok({category: 'company', query: text_q, mode, offset: 90,
            limit: 10});
        bad({category: 'company', query: text_q, mode, offset: 91,
            limit: 10}, /first 100 matches\. Use mode ludicrous/);
    }
    bad({category: 'people', query: text_q, offset: -1});
});

test('ludicrous: offset 1000 or less, no 100 window', ()=>{
    ok({category: 'company', query: tree_q, mode: 'ludicrous',
        offset: 1000, limit: 10});
    bad({category: 'company', query: tree_q, mode: 'ludicrous',
        offset: 1001});
});

test('view: summary, full (limit 5 or less) or a field list', ()=>{
    ok({category: 'people', query: text_q, view: 'full', limit: 5});
    bad({category: 'people', query: text_q, view: 'full', limit: 6},
        /view full allows limit 5 or less/);
    bad({category: 'people', query: text_q, view: 'full'});
    ok({category: 'people', query: text_q, view: {fields: ['name']}});
    bad({category: 'people', query: text_q, view: {fields: []}});
    bad({category: 'people', query: text_q, view: 'id_only'});
    bad({category: 'people', query: text_q,
        view: {fields: ['name'], extra: 1}});
});

test('debug and unknown keys are rejected', ()=>{
    for (const key of ['explain', 'benchmark', 'trace', '__overrides__',
        'source'])
    {
        bad({category: 'company', query: text_q, [key]: true});
    }
});

test('each category calls its URL, one POST, no category in body',
async()=>{
    for (const category of ['company', 'people'])
    {
        const {call, calls} = setup();
        await call({category, query: text_q});
        assert.equal(calls.length, 1);
        assert.equal(calls[0].method, 'POST');
        assert.equal(calls[0].url,
            `https://api.brightdata.com/search/${category}`);
        assert.deepEqual(calls[0].data, {query: text_q, mode: 'instant',
            view: 'summary', offset: 0, limit: 10});
        assert.deepEqual(calls[0].headers, {token: 'tok',
            tool: 'business_search', 'Content-Type': 'application/json'});
        assert.deepEqual(calls[0].ctx, {api_token: 'tok'});
    }
});

test('ludicrous sends the JSON tree unchanged', async()=>{
    const {call, calls} = setup();
    await call({category: 'company', query: tree_q, mode: 'ludicrous',
        view: {fields: ['name']}, offset: 200, limit: 5});
    assert.deepEqual(calls[0].data, {query: tree_q, mode: 'ludicrous',
        view: {fields: ['name']}, offset: 200, limit: 5});
});

test('response JSON is returned unchanged', async()=>{
    const data = {req_id: 'r1', source: 'linkedin_company',
        meta: {coverage_percent: 80, matched: 2, offset: 0, limit: 10},
        documents: [{bright_id: 'a', data: {name: 'A', website: 'a.com'}},
            {bright_id: 'b', data: {name: 'B'}}]};
    assert.deepEqual(JSON.parse(await setup({data})
        .call({category: 'company', query: text_q})), data);
});

test('empty documents is a normal result', async()=>{
    const data = {req_id: 'r2', source: 'linkedin_people',
        meta: {coverage_percent: 100, matched: 0, offset: 0, limit: 10},
        documents: []};
    assert.deepEqual(JSON.parse(await setup({data})
        .call({category: 'people', query: text_q})), data);
});

test('403 Access denied: Business Search not enabled, names other tools',
()=>{
    const msg = api_error(http_error(403, {error: 'Access denied'}),
        BUSINESS_SEARCH_RULES);
    assert.match(msg, /^Business Search not enabled: /);
    assert.match(msg, /search_dataset/);
    assert.match(msg, /run_scraper/);
    assert.match(msg, /Details: Access denied$/);
});

test('403 with another body gets the default rule', ()=>{
    const msg = api_error(http_error(403,
        {error: 'Customer account is inactive'}), BUSINESS_SEARCH_RULES);
    assert.match(msg, /^Request refused: /);
});

test('502 and 504 rules', ()=>{
    assert.match(api_error(http_error(502,
        {error: 'invalid planner response'}), BUSINESS_SEARCH_RULES),
    /^Query not understood: .*Rephrase the query, or use mode ludicrous/);
    assert.match(api_error(http_error(504, {error: 'timeout'}),
        BUSINESS_SEARCH_RULES), /^Search timed out: .*Narrow the query/);
});

test('400 and 429 use the default rules with the API text', ()=>{
    const e400 = api_error(http_error(400, {error: 'Invalid query: In '
        +'operator \'text\', field \'current_title\': Field not found in '
        +'document type \'company\'', error_code: 'invalid_query'}),
    BUSINESS_SEARCH_RULES);
    assert.match(e400, /^Request rejected: .*Details: Invalid query: /);
    assert.match(e400, /current_title/);
    const e429 = api_error(http_error(429,
        {error: 'Too many search requests, try again shortly'}),
    BUSINESS_SEARCH_RULES);
    assert.match(e429, /^Rate limited: .*Details: Too many search/);
});

test('500 uses the default 5xx rule', ()=>{
    assert.match(api_error(http_error(500, {error: 'search backend '
        +'request failed', error_code: 'backend_search_failed'}),
    BUSINESS_SEARCH_RULES), /^Service unavailable: /);
});

test('request times out after 50 s', async()=>{
    const {call, calls} = setup();
    await call({category: 'company', query: text_q});
    assert.equal(calls[0].timeout, 50000);
});

test('timeout: Search timed out, not the default Retry once', ()=>{
    const e = Object.assign(new Error('timeout of 50000ms exceeded'),
        {isAxiosError: true, code: 'ECONNABORTED'});
    const msg = api_error(e, BUSINESS_SEARCH_RULES);
    assert.match(msg, /^Search timed out: Business Search didn't answer within 50 s\. Narrow the query/);
});

test('no retry: request is called once on 429 and 500', async()=>{
    for (const status of [429, 500])
    {
        const {call, calls} = setup(http_error(status, {error: 'x'}));
        await assert.rejects(call({category: 'company', query: text_q}));
        assert.equal(calls.length, 1);
    }
});
