'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {to_page, request_error, to_items, batch_timeout_error}
    from '../fetch_api.js';

const long_md = '# Title\n\n'+'Some text. '.repeat(20);
const record = (extra = {})=>({url: 'https://a.example/',
    input: {url: 'https://a.example/'}, final_url: 'https://a.example/',
    page_title: 'A', markdown: long_md, html2text: 'Title Some text',
    page_html: '<html></html>', ld_json: [], ...extra});

test('to_page returns markdown by default', ()=>{
    assert.deepEqual(to_page(record()), {url: 'https://a.example/',
        title: 'A', format: 'markdown', content: long_md});
});

test('to_page returns the requested format', ()=>{
    const page = to_page(record({ld_json: [{'@type': 'Product'}]}),
        'ld_json');
    assert.equal(page.format, 'ld_json');
    assert.equal(page.content, '[{"@type":"Product"}]');
});

test('to_page shows final_url only after a redirect', ()=>{
    const page = to_page(record({final_url: 'https://b.example/'}));
    assert.equal(page.final_url, 'https://b.example/');
});

test('to_page falls back to plain text when markdown is nearly empty', ()=>{
    const text = 'THE DASHBOARD NEEDS JAVASCRIPT. '.repeat(5);
    const page = to_page(record({markdown: 'Opens in a new tab',
        html2text: text}));
    assert.equal(page.format, 'text');
    assert.equal(page.content, text);
    assert.match(page.note, /markdown was nearly empty/);
});

test('to_page adds a note on a short page', ()=>{
    const page = to_page(record({markdown: 'Hello', html2text: 'Hello'}));
    assert.equal(page.content, 'Hello');
    assert.match(page.note, /^Note: only 5 characters/);
});

test('to_page maps API error codes', ()=>{
    const err = (error_code, error)=>to_page(record({error_code, error,
        markdown: null})).error;
    assert.match(err('dead_page'), /^page_not_found: https:\/\/a.example\//);
    assert.match(err('proxy', 'Could not resolve host'),
        /^fetch_failed: .* Details: Could not resolve host$/);
    assert.match(err('bad_cmd_arg'), /^invalid_url: /);
    assert.match(err('bucket_rate_limit'), /^rate_limited: a.example is/);
    assert.equal(err('weird', 'raw text'), 'weird: raw text');
});

test('to_page flags empty and binary pages', ()=>{
    const err = extra=>to_page(record(extra)).error;
    assert.match(err({markdown: '', html2text: ' '}), /^empty_page: /);
    assert.match(err({markdown: '%PDF-1.4 '+'x'.repeat(200)}),
        /^unsupported_content: /);
});

test('request_error maps HTTP and network failures', ()=>{
    const url = 'https://a.example/';
    const err = (status, extra = {})=>request_error({isAxiosError: true,
        response: status && {status, data: 'bad'}, ...extra}, url);
    assert.match(err(0, {code: 'ERR_CANCELED'}), /^timeout: /);
    assert.match(err(0, {code: 'ECONNRESET'}),
        /^network_error: .*\(ECONNRESET\)/);
    assert.match(err(401), /^auth_failed: /);
    assert.match(err(429), /^busy: /);
    assert.match(err(502), /^service_error: .*HTTP 502/);
    assert.equal(err(400), 'invalid_url: https://a.example/: bad');
    assert.equal(err(402), null);
    assert.equal(request_error(new Error('bug'), url), null);
});

test('to_page returns another format when the one asked for is missing',
    ()=>{
        const page = to_page(record(), 'ld_json');
        assert.equal(page.format, 'markdown');
        assert.equal(page.content, long_md);
        assert.equal(page.note,
            'ld_json is not available on this page; returned markdown');
        const html = to_page(record({page_html: '', markdown: ''}), 'html');
        assert.equal(html.format, 'text');
        assert.match(html.note, /^html is not available/);
    });

test('to_items keeps input order and matches records by input.url', ()=>{
    const a = record(), b = record({url: 'https://b.example/',
        input: {url: 'https://b.example/'}, final_url: 'https://c.example/'});
    const items = to_items(['https://b.example/', 'https://a.example/',
        'https://b.example/', 'https://x.example/'], [a, b]);
    assert.deepEqual(items.map(i=>i.url), ['https://b.example/',
        'https://a.example/', 'https://b.example/', 'https://x.example/']);
    assert.equal(items[0].final_url, 'https://c.example/');
    assert.equal(items[1].content, long_md);
    assert.match(items[3].error, /^no_data: /);
});

test('to_items maps cancelled pages to timeouts', ()=>{
    const rec = (url, error_code)=>({url, input: {url}, error_code,
        error: 'Crawl aborted on job cancel'});
    const [aborted, uncrawled] = to_items(['https://a.example/',
        'https://b.example/'], [rec('https://a.example/', 'aborted_page'),
        rec('https://b.example/', 'uncrawled_page')]);
    assert.equal(aborted.error, batch_timeout_error('https://a.example/'));
    assert.match(uncrawled.error, /was not reached within 40 s/);
});
