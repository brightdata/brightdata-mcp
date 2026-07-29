'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    GEO_STATUS,
    normalize_geos,
    parse_unlocker_json,
    build_geo_entry,
    summarize_fanout,
} from '../geo_utils.js';
import {OUTCOME} from '../retry_utils.js';

const NOW = Date.parse('2026-01-19T20:51:08Z');

// Helper mirroring the geo_fanout executor's settled-attempt flow exactly: the
// Unlocker /request endpoint is called with format:'json' and answers a JSON
// envelope {status_code, headers, body}; the executor maps it with
// parse_unlocker_json and feeds the TARGET's {status, headers} into
// build_geo_entry. Driving the tests through this same path is the whole point:
// the OLD tests handed build_geo_entry a synthetic axios-status fixture (the
// gateway's 200), which misrepresented the real shape and hid the bug where a
// target 403/451/3xx was classified as ok.
function entry_from_envelope(geo, url, envelope, now = NOW){
    const parsed = parse_unlocker_json(envelope);
    return build_geo_entry({
        geo,
        url,
        body: parsed.body,
        response: {status: parsed.status, headers: parsed.headers},
    }, now);
}

// A thrown transport error never produces an envelope; the executor passes the
// raw error straight into build_geo_entry as {error}.
function entry_from_error(geo, url, error, now = NOW){
    return build_geo_entry({geo, url, error}, now);
}

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

// parse_unlocker_json maps the REAL Unlocker envelope {status_code, headers,
// body} to the {status, headers, body} shape build_geo_entry expects. These
// fixtures use the verified live shape: a normal page is status_code 200, a
// blocked page is 403, a redirect is a 302 carrying headers.location WITHOUT the
// Unlocker following it.
const parse_cases = [
    {
        name: 'maps status_code -> status and passes headers/body through',
        input: {status_code: 200, headers: {'content-type': 'text/html'},
            body: '<html>ok</html>'},
        expected: {status: 200, headers: {'content-type': 'text/html'},
            body: '<html>ok</html>'},
    },
    {
        name: 'maps a 403 target status',
        input: {status_code: 403, headers: {}, body: 'forbidden'},
        expected: {status: 403, headers: {}, body: 'forbidden'},
    },
    {
        name: 'maps a 302 keeping the target location header',
        input: {status_code: 302,
            headers: {location: 'https://be.shop.example/blocked'}, body: ''},
        expected: {status: 302,
            headers: {location: 'https://be.shop.example/blocked'}, body: ''},
    },
    {
        name: 'parses a JSON string envelope (responseType fallback)',
        input: JSON.stringify({status_code: 200, headers: {}, body: 'hi'}),
        expected: {status: 200, headers: {}, body: 'hi'},
    },
    {
        name: 'tolerates a non-object input -> null status',
        input: null,
        expected: {status: null, headers: undefined, body: undefined},
    },
    {
        name: 'tolerates a non-JSON string -> null status',
        input: 'not json at all',
        expected: {status: null, headers: undefined, body: undefined},
    },
    {
        name: 'tolerates a missing status_code -> null status',
        input: {headers: {x: '1'}, body: 'b'},
        expected: {status: null, headers: {x: '1'}, body: 'b'},
    },
];

test('parse_unlocker_json maps the real Unlocker envelope (table-driven)', ()=>{
    for (const tc of parse_cases)
    {
        assert.deepEqual(parse_unlocker_json(tc.input), tc.expected, tc.name);
    }
});

// End-to-end from a realistic parsed attempt: each case starts from the REAL
// Unlocker envelope (or a thrown error) and goes through the same mapping the
// executor uses, so the assertion is on the bug's actual surface (target status,
// not gateway 200).
const envelope_cases = [
    {
        name: '200 envelope -> ok',
        url: 'https://shop.example/p/1',
        envelope: {status_code: 200, headers: {'content-type': 'text/html'},
            body: '<html>price 19.99</html>'},
        status: GEO_STATUS.OK,
        http_status: 200,
        outcome: OUTCOME.SUCCESS,
        body: '<html>price 19.99</html>',
    },
    {
        name: '403 envelope -> blocked as first-class result (not ok)',
        url: 'https://shop.example/p/1',
        envelope: {status_code: 403, headers: {}, body: 'forbidden'},
        status: GEO_STATUS.BLOCKED,
        http_status: 403,
        outcome: OUTCOME.BLOCKED,
    },
    {
        name: '451 envelope -> blocked',
        url: 'https://shop.example/p/1',
        envelope: {status_code: 451, headers: {}, body: ''},
        status: GEO_STATUS.BLOCKED,
        http_status: 451,
        outcome: OUTCOME.BLOCKED,
    },
    {
        name: '302 cross-host envelope -> redirected with location captured',
        url: 'https://de.shop.example/p/1',
        envelope: {status_code: 302,
            headers: {location: 'https://be.shop.example/blocked'}, body: ''},
        status: GEO_STATUS.REDIRECTED,
        http_status: 302,
        outcome: OUTCOME.REDIRECT,
        location: 'https://be.shop.example/blocked',
        cross_host: true,
    },
    {
        name: '301 same-host envelope -> redirected, cross_host false',
        url: 'https://shop.example/p/1',
        envelope: {status_code: 301,
            headers: {location: 'https://shop.example/p/1/'}, body: ''},
        status: GEO_STATUS.REDIRECTED,
        http_status: 301,
        outcome: OUTCOME.REDIRECT,
        location: 'https://shop.example/p/1/',
        cross_host: false,
    },
    {
        name: '429 envelope -> rate_limited honoring retry-after',
        url: 'https://shop.example/p/1',
        envelope: {status_code: 429, headers: {'retry-after': '3'}, body: ''},
        status: GEO_STATUS.RATE_LIMITED,
        http_status: 429,
        outcome: OUTCOME.RATE_LIMITED,
        retry_after_ms: 3000,
    },
    {
        name: '502 envelope -> error (transient, surfaced not dropped)',
        url: 'https://shop.example/p/1',
        envelope: {status_code: 502, headers: {}, body: ''},
        status: GEO_STATUS.ERROR,
        http_status: 502,
        outcome: OUTCOME.RETRYABLE,
    },
];

test('build_geo_entry from real Unlocker envelopes (table-driven)', ()=>{
    for (const tc of envelope_cases)
    {
        const e = entry_from_envelope(tc.geo || 'xx', tc.url, tc.envelope);
        assert.equal(e.status, tc.status, `${tc.name}: status`);
        assert.equal(e.http_status, tc.http_status,
            `${tc.name}: http_status is the TARGET status`);
        if (tc.outcome!==undefined)
            assert.equal(e.outcome, tc.outcome, `${tc.name}: outcome`);
        if (tc.location!==undefined)
        {
            assert.ok(e.redirect, `${tc.name}: redirect present`);
            assert.equal(e.redirect.location, tc.location,
                `${tc.name}: location captured`);
        }
        if (tc.cross_host!==undefined)
        {
            assert.equal(e.redirect.cross_host, tc.cross_host,
                `${tc.name}: cross_host`);
        }
        if (tc.retry_after_ms!==undefined)
        {
            assert.equal(e.retry_after_ms, tc.retry_after_ms,
                `${tc.name}: retry_after_ms`);
        }
        if (tc.body!==undefined)
            assert.equal(e.body, tc.body, `${tc.name}: body carried through`);
        // exit_ip is never fabricated on the json path.
        assert.equal(e.exit_ip, null, `${tc.name}: exit_ip best-effort null`);
        assert.equal(typeof e.reason, 'string', `${tc.name}: reason string`);
    }
});

test('build_geo_entry surfaces a thrown transport error as error', ()=>{
    const e = entry_from_error('es', 'https://shop.example/p/1',
        {code: 'ECONNRESET'});
    assert.equal(e.status, GEO_STATUS.ERROR);
    assert.equal(e.http_status, null);
    assert.equal(e.outcome, OUTCOME.RETRYABLE);
    assert.equal(typeof e.reason, 'string');
});

test('build_geo_entry surfaces an error carrying an http response', ()=>{
    // A thrown axios error that still has response.status (e.g. a 429 the
    // transport raised) is classified on that real status, not dropped.
    const e = entry_from_error('fr', 'https://shop.example/p/1',
        {response: {status: 429, headers: {'retry-after': '2'}}});
    assert.equal(e.status, GEO_STATUS.RATE_LIMITED);
    assert.equal(e.http_status, 429);
    assert.equal(e.retry_after_ms, 2000);
});

test('summarize_fanout counts every geo with none dropped', ()=>{
    const entries = [
        entry_from_envelope('de', 'https://shop.example/p',
            {status_code: 200, headers: {}, body: 'ok'}),
        entry_from_envelope('be', 'https://shop.example/p',
            {status_code: 403, headers: {}, body: ''}),
        entry_from_envelope('fr', 'https://de.shop.example/p',
            {status_code: 302,
                headers: {location: 'https://fr.shop.example/x'}, body: ''}),
        entry_from_envelope('it', 'https://shop.example/p',
            {status_code: 429, headers: {'retry-after': '1'}, body: ''}),
        entry_from_error('es', 'https://shop.example/p', {code: 'ETIMEDOUT'}),
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
