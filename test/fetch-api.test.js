'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {to_page, to_items, max_chars, FETCH_RULES,
    ascii_url} from '../fetch_api.js';
import {api_error} from '../errors.js';

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

test('to_page drops final_url', ()=>{
    const page = to_page(record({final_url: 'https://b.example/'}));
    assert.equal('final_url' in page, false);
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
    assert.equal(err('dead_page', 'dead page (404)'), 'Page not found: '
        +'https://a.example/ does not exist (404). Check the URL; retrying '
        +'won\'t help. Details: dead page (404)');
    assert.match(err('proxy', 'Access denied'),
        /^Fetch failed: .* Details: Access denied$/);
    assert.match(err('bad_cmd_arg'), /^URL not allowed: /);
    assert.match(err('bucket_rate_limit'),
        /^Site rate limited: a.example is/);
    assert.equal(err('weird', 'raw text'), 'Fetch failed: https://a.example/ '
        +'could not be fetched. Read the details. Retry once. Details: raw '
        +'text');
});

test('to_page flags empty and binary pages', ()=>{
    const err = extra=>to_page(record(extra)).error;
    assert.match(err({markdown: '', html2text: ' '}), /^Empty page: /);
    assert.match(err({markdown: '%PDF-1.4 '+'x'.repeat(200)}),
        /^Not a web page: /);
});

test('FETCH_RULES name the URL, the rest falls to the defaults', ()=>{
    const url = 'https://a.example/';
    const err = (status, extra = {})=>api_error({isAxiosError: true,
        response: status && {status, data: 'bad'}, ...extra},
        FETCH_RULES, {url});
    assert.match(err(0, {code: 'ERR_CANCELED'}),
        /^Page timed out: https:\/\/a.example\/ did not load within 45 s/);
    assert.equal(err(400), 'URL rejected: Bright Data rejected the request '
        +'for https://a.example/. Read the details. Check the URL and retry. '
        +'Details: bad');
    assert.match(err(401), /^Sign-in failed: /);
    assert.match(err(502), /^Service unavailable: .* Details: bad$/);
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
    assert.equal(items[1].content, long_md);
    assert.match(items[3].error, /^No data: /);
});

test('to_items maps cancelled pages to timeouts', ()=>{
    const rec = (url, error_code)=>({url, input: {url}, error_code,
        error: 'Crawl aborted on job cancel'});
    const [aborted, uncrawled] = to_items(['https://a.example/',
        'https://b.example/'], [rec('https://a.example/', 'aborted_page'),
        rec('https://b.example/', 'uncrawled_page')]);
    assert.match(aborted.error, /^Page timed out: .* within 35 s\./);
    assert.match(uncrawled.error, /was not reached within 35 s/);
});

test('to_page cuts very large pages', ()=>{
    const page = to_page(record({markdown: 'x'.repeat(max_chars+50)}));
    assert.equal(page.content.length, max_chars);
    assert.equal(page.note, `content cut to the first ${max_chars} of `
        +`${max_chars+50} characters`);
    assert.equal('note' in to_page(record()), false);
});

test('an unknown domain is "Site not found"', ()=>{
    const url = 'https://nope.example/';
    assert.match(to_page({url, input: {url}, error_code: 'proxy',
        error: 'Could not resolve host nope.example'}).error,
        /^Site not found: nope.example doesn't resolve\. /);
});

test('ascii_url turns only a Unicode host into punycode', ()=>{
    assert.equal(ascii_url('https://münchen.de/a?q=ü'),
        'https://xn--mnchen-3ya.de/a?q=ü');
    for (const url of ['https://Example.com', 'https://a.example/ü path',
        'not a url'])
    {
        assert.equal(ascii_url(url), url);
    }
});

test('to_items matches a punycode record back to the Unicode URL', ()=>{
    const idn = 'https://münchen.de/';
    const [item] = to_items([idn], [record({url: 'https://xn--mnchen-3ya.de/',
        input: {url: 'https://xn--mnchen-3ya.de/'}})]);
    assert.equal(item.url, idn);
    assert.equal(item.content, long_md);
});

test('a garbled page is text with a note, not a binary file', ()=>{
    const text = 'Price 1,200 yen '+'�'.repeat(40)+' more text '
        .repeat(10);
    const page = to_page(record({markdown: text}));
    assert.equal(page.error, undefined);
    assert.equal(page.content, text);
    assert.match(page.note, /^40 characters could not be decoded: the site/);
    assert.equal('note' in to_page(record({markdown: long_md+'�'})),
        false);
});
