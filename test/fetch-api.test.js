'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {to_page, request_error, header_snapshot_id}
    from '../fetch_api.js';

const long_md = '# Title\n\n'+'Some text. '.repeat(20);
const record = (extra = {})=>({url: 'https://a.example/',
    input: {url: 'https://a.example/'}, final_url: 'https://a.example/',
    page_title: 'A', markdown: long_md, html2text: 'Title Some text',
    page_html: '<html></html>', ld_json: [], ...extra});

test('to_page returns markdown and the other non-empty formats', ()=>{
    assert.deepEqual(to_page(record(), 'markdown', 'sd_1'), {
        url: 'https://a.example/', title: 'A', format: 'markdown',
        content: long_md, snapshot_id: 'sd_1',
        other_formats: ['text', 'html']});
});

test('to_page returns the requested format', ()=>{
    const page = to_page(record({ld_json: [{'@type': 'Product'}]}),
        'ld_json');
    assert.equal(page.format, 'ld_json');
    assert.equal(page.content, '[{"@type":"Product"}]');
    assert.equal('snapshot_id' in page, false);
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
    assert.deepEqual(page.other_formats, ['markdown', 'html']);
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

test('header_snapshot_id reads the snapshot_id from the header', ()=>{
    assert.equal(header_snapshot_id({'content-disposition':
        'attachment; filename="sd_mvs3765b1ctuseg2dl.json"'}),
        'sd_mvs3765b1ctuseg2dl');
    assert.equal(header_snapshot_id({}), undefined);
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
