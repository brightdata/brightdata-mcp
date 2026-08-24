'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {search_url} from '../search_url.js';

// Verbatim-preservation matrix: valid cursors only. The malformed-cursor
// behaviour (parseInt('abc') -> NaN URLs) is a known adjacent defect,
// deliberately NOT pinned here so a future fix doesn't have to fight the
// suite.

test('google URLs: query, pagination, geo via gl=', ()=>{
    assert.equal(search_url('google', 'coffee'),
        'https://www.google.com/search?q=coffee&start=0');
    assert.equal(search_url('google', 'coffee', '2'),
        'https://www.google.com/search?q=coffee&start=20');
    assert.equal(search_url('google', 'coffee', undefined, 'de'),
        'https://www.google.com/search?q=coffee&start=0&gl=de');
});

test('bing URLs: query and pagination (first = page*10 + 1)', ()=>{
    assert.equal(search_url('bing', 'coffee'),
        'https://www.bing.com/search?q=coffee&first=1');
    assert.equal(search_url('bing', 'coffee', '2'),
        'https://www.bing.com/search?q=coffee&first=21');
});

test('yandex URLs: query and pagination', ()=>{
    assert.equal(search_url('yandex', 'coffee'),
        'https://yandex.com/search/?text=coffee&p=0');
    assert.equal(search_url('yandex', 'coffee', '3'),
        'https://yandex.com/search/?text=coffee&p=3');
});

test('query is URI-encoded for every engine', ()=>{
    for (const engine of ['google', 'bing', 'yandex'])
        assert.ok(search_url(engine, 'a b&c').includes('a%20b%26c'), engine);
});

// The fix: geo_location must be honored where the engine supports it
// (Bing via cc=, matching Bright Data's own CLI) and loudly rejected where
// it cannot be (Yandex has no country-code parameter -- lr= takes numeric
// region ids). Silently dropping it was the bug.

test('bing honors geo_location via cc=', ()=>{
    assert.equal(search_url('bing', 'coffee', undefined, 'de'),
        'https://www.bing.com/search?q=coffee&first=1&cc=de');
    assert.ok(!search_url('bing', 'coffee').includes('cc='),
        'no geo -> no cc parameter');
});

test('yandex with geo_location throws a clear error', ()=>{
    assert.throws(()=>search_url('yandex', 'coffee', undefined, 'de'),
        /not supported for engine "yandex"/);
    assert.equal(search_url('yandex', 'coffee'),
        'https://yandex.com/search/?text=coffee&p=0',
        'yandex without geo still works');
});
