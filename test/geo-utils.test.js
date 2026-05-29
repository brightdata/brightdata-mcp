'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    GEO_STATUS,
    normalize_geos,
    build_geo_entry,
    summarize_fanout,
} from '../geo_utils.js';

const NOW = Date.parse('2026-01-19T20:51:08Z');

const normalize_ok_cases = [
    {
        name: 'lowercases and trims',
        input: [' US ', 'De'],
        expected: ['us', 'de'],
    },
    {
        name: 'dedupes preserving first-seen order',
        input: ['de', 'be', 'DE', 'be', 'fr'],
        expected: ['de', 'be', 'fr'],
    },
    {
        name: 'single code',
        input: ['gb'],
        expected: ['gb'],
    },
];

test('normalize_geos valid cases (table-driven)', ()=>{
    for (const tc of normalize_ok_cases)
    {
        assert.deepEqual(normalize_geos(tc.input), tc.expected, tc.name);
    }
});

const normalize_throw_cases = [
    {name: 'empty array throws', input: [], match: /non-empty array/},
    {name: 'not an array throws', input: 'us', match: /non-empty array/},
    {name: 'three-letter code throws', input: ['usa'],
        match: /invalid geo country code/},
    {name: 'one-letter code throws', input: ['u'],
        match: /invalid geo country code/},
    {name: 'digits throw', input: ['12'], match: /invalid geo country code/},
    {name: 'non-string entry throws', input: [42], match: /not a string/},
];

test('normalize_geos invalid cases throw loudly (table-driven)', ()=>{
    for (const tc of normalize_throw_cases)
    {
        assert.throws(()=>normalize_geos(tc.input), tc.match, tc.name);
    }
});

const entry_cases = [
    {
        name: '200 -> ok',
        attempt: {geo: 'de', url: 'https://shop.example/p/1',
            response: {status: 200, headers: {}, exit_ip: '1.2.3.4'}},
        status: GEO_STATUS.OK,
        http_status: 200,
        exit_ip: '1.2.3.4',
    },
    {
        name: '403 -> blocked as first-class result (not discarded)',
        attempt: {geo: 'be', url: 'https://shop.example/p/1',
            error: {response: {status: 403, headers: {}}}},
        status: GEO_STATUS.BLOCKED,
        http_status: 403,
    },
    {
        name: '451 -> blocked',
        attempt: {geo: 'be', url: 'https://shop.example/p/1',
            error: {response: {status: 451, headers: {}}}},
        status: GEO_STATUS.BLOCKED,
        http_status: 451,
    },
    {
        name: '302 cross-host -> redirected (geo gating signal)',
        attempt: {geo: 'be', url: 'https://de.shop.example/p/1',
            response: {status: 302,
                headers: {location: 'https://be.shop.example/blocked'}}},
        status: GEO_STATUS.REDIRECTED,
        http_status: 302,
    },
    {
        name: '301 same-host -> still redirected, cross_host false',
        attempt: {geo: 'de', url: 'https://shop.example/p/1',
            response: {status: 301,
                headers: {location: 'https://shop.example/p/1/'}}},
        status: GEO_STATUS.REDIRECTED,
        http_status: 301,
    },
    {
        name: '429 -> rate_limited with retry_after',
        attempt: {geo: 'fr', url: 'https://shop.example/p/1',
            error: {response: {status: 429,
                headers: {'retry-after': '3'}}}},
        status: GEO_STATUS.RATE_LIMITED,
        http_status: 429,
        retry_after_ms: 3000,
    },
    {
        name: '502 -> error (transient, surfaced not dropped)',
        attempt: {geo: 'it', url: 'https://shop.example/p/1',
            error: {response: {status: 502, headers: {}}}},
        status: GEO_STATUS.ERROR,
        http_status: 502,
    },
    {
        name: 'network error -> error with null http_status',
        attempt: {geo: 'es', url: 'https://shop.example/p/1',
            error: {code: 'ECONNRESET'}},
        status: GEO_STATUS.ERROR,
        http_status: null,
    },
];

test('build_geo_entry classifies each geo as first-class (table-driven)', ()=>{
    for (const tc of entry_cases)
    {
        const e = build_geo_entry(tc.attempt, NOW);
        assert.equal(e.status, tc.status, `${tc.name}: status`);
        assert.equal(e.http_status, tc.http_status,
            `${tc.name}: http_status`);
        assert.equal(e.geo, tc.attempt.geo, `${tc.name}: geo preserved`);
        if (tc.exit_ip!==undefined)
            assert.equal(e.exit_ip, tc.exit_ip, `${tc.name}: exit_ip`);
        if (tc.retry_after_ms!==undefined)
        {
            assert.equal(e.retry_after_ms, tc.retry_after_ms,
                `${tc.name}: retry_after_ms`);
        }
        assert.equal(typeof e.reason, 'string', `${tc.name}: reason string`);
    }
});

test('build_geo_entry marks cross_host redirect correctly', ()=>{
    const cross = build_geo_entry({geo: 'be',
        url: 'https://de.shop.example/p/1',
        response: {status: 302,
            headers: {location: 'https://be.shop.example/x'}}}, NOW);
    assert.equal(cross.redirect.cross_host, true);

    const same = build_geo_entry({geo: 'de',
        url: 'https://shop.example/p/1',
        response: {status: 301,
            headers: {location: 'https://shop.example/p/1/'}}}, NOW);
    assert.equal(same.redirect.cross_host, false);
});

test('summarize_fanout counts every geo with none dropped', ()=>{
    const entries = [
        build_geo_entry({geo: 'de', url: 'https://shop.example/p',
            response: {status: 200, headers: {}}}, NOW),
        build_geo_entry({geo: 'be', url: 'https://shop.example/p',
            error: {response: {status: 403, headers: {}}}}, NOW),
        build_geo_entry({geo: 'fr', url: 'https://de.shop.example/p',
            response: {status: 302,
                headers: {location: 'https://fr.shop.example/x'}}}, NOW),
        build_geo_entry({geo: 'it', url: 'https://shop.example/p',
            error: {response: {status: 429,
                headers: {'retry-after': '1'}}}}, NOW),
        build_geo_entry({geo: 'es', url: 'https://shop.example/p',
            error: {code: 'ETIMEDOUT'}}, NOW),
    ];
    const report = summarize_fanout(entries);
    assert.equal(report.summary.total, 5);
    assert.equal(report.summary.ok, 1);
    assert.equal(report.summary.blocked, 1);
    assert.equal(report.summary.redirected, 1);
    assert.equal(report.summary.rate_limited, 1);
    assert.equal(report.summary.error, 1);
    assert.equal(report.any_blocked, true);
    assert.equal(report.any_redirected, true);
    assert.equal(report.results.length, 5,
        'every geo is present in results, nothing discarded');
});

test('summarize_fanout handles empty input without crashing', ()=>{
    const report = summarize_fanout([]);
    assert.equal(report.summary.total, 0);
    assert.equal(report.any_blocked, false);
    assert.equal(report.any_redirected, false);
    assert.deepEqual(report.results, []);
});
