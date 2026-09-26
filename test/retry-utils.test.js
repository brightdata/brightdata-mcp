'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    OUTCOME,
    classify_response,
    compute_backoff,
    parse_retry_after,
    should_retry,
} from '../retry_utils.js';

// Fixed clock so HTTP-date Retry-After cases are deterministic.
const NOW = Date.parse('2026-01-19T20:51:08Z');

const classify_cases = [
    {
        name: '200 is success, not retryable',
        input: {status: 200, headers: {}},
        outcome: OUTCOME.SUCCESS,
        retryable: false,
        retry_after_ms: null,
    },
    {
        name: '204 is success',
        input: {status: 204, headers: {}},
        outcome: OUTCOME.SUCCESS,
        retryable: false,
    },
    {
        name: '502 from gateway is retryable (issue #104)',
        input: {error: {response: {status: 502, headers: {}}}},
        outcome: OUTCOME.RETRYABLE,
        retryable: true,
    },
    {
        name: '504 gateway timeout is retryable (issue #104)',
        input: {error: {response: {status: 504, headers: {}}}},
        outcome: OUTCOME.RETRYABLE,
        retryable: true,
    },
    {
        name: '500 is retryable',
        input: {error: {response: {status: 500, headers: {}}}},
        outcome: OUTCOME.RETRYABLE,
        retryable: true,
    },
    {
        name: '503 is retryable',
        input: {error: {response: {status: 503, headers: {}}}},
        outcome: OUTCOME.RETRYABLE,
        retryable: true,
    },
    {
        name: '408 request timeout is retryable',
        input: {error: {response: {status: 408, headers: {}}}},
        outcome: OUTCOME.RETRYABLE,
        retryable: true,
    },
    {
        name: 'unenumerated 5xx (599) falls back to retryable',
        input: {error: {response: {status: 599, headers: {}}}},
        outcome: OUTCOME.RETRYABLE,
        retryable: true,
    },
    {
        name: '301 is a redirect, not fatal (self-consistent outcome)',
        input: {status: 301, headers: {location: 'https://shop.example/x'}},
        outcome: OUTCOME.REDIRECT,
        retryable: false,
        retry_after_ms: null,
    },
    {
        name: '302 is a redirect, never retried',
        input: {error: {response: {status: 302, headers: {}}}},
        outcome: OUTCOME.REDIRECT,
        retryable: false,
    },
    {
        name: '307 temporary redirect is a redirect outcome',
        input: {status: 307, headers: {}},
        outcome: OUTCOME.REDIRECT,
        retryable: false,
    },
    {
        name: '429 is rate_limited and retryable',
        input: {error: {response: {status: 429, headers: {}}}},
        outcome: OUTCOME.RATE_LIMITED,
        retryable: true,
    },
    {
        name: '429 surfaces numeric Retry-After in ms',
        input: {error: {response: {status: 429,
            headers: {'retry-after': '2'}}}},
        outcome: OUTCOME.RATE_LIMITED,
        retryable: true,
        retry_after_ms: 2000,
    },
    {
        name: '429 surfaces uppercase Retry-After header',
        input: {error: {response: {status: 429,
            headers: {'Retry-After': '5'}}}},
        outcome: OUTCOME.RATE_LIMITED,
        retryable: true,
        retry_after_ms: 5000,
    },
    {
        name: '503 surfaces HTTP-date Retry-After relative to now',
        input: {error: {response: {status: 503,
            headers: {'retry-after': 'Mon, 19 Jan 2026 20:51:18 GMT'}}}},
        outcome: OUTCOME.RETRYABLE,
        retryable: true,
        retry_after_ms: 10000,
    },
    {
        name: '403 is a first-class BLOCKED outcome, not a discarded error',
        input: {error: {response: {status: 403, headers: {}}}},
        outcome: OUTCOME.BLOCKED,
        retryable: false,
    },
    {
        name: '451 (unavailable for legal reasons) is BLOCKED',
        input: {error: {response: {status: 451, headers: {}}}},
        outcome: OUTCOME.BLOCKED,
        retryable: false,
    },
    {
        name: '400 is a terminal client error',
        input: {error: {response: {status: 400, headers: {}}}},
        outcome: OUTCOME.CLIENT_ERROR,
        retryable: false,
    },
    {
        name: '401 is a terminal client error',
        input: {error: {response: {status: 401, headers: {}}}},
        outcome: OUTCOME.CLIENT_ERROR,
        retryable: false,
    },
    {
        name: '404 is a terminal client error',
        input: {error: {response: {status: 404, headers: {}}}},
        outcome: OUTCOME.CLIENT_ERROR,
        retryable: false,
    },
    {
        name: 'ECONNRESET network error is retryable',
        input: {error: {code: 'ECONNRESET'}},
        outcome: OUTCOME.RETRYABLE,
        retryable: true,
    },
    {
        name: 'ETIMEDOUT network error is retryable',
        input: {error: {code: 'ETIMEDOUT'}},
        outcome: OUTCOME.RETRYABLE,
        retryable: true,
    },
    {
        name: 'undici connect timeout is retryable',
        input: {error: {code: 'UND_ERR_CONNECT_TIMEOUT'}},
        outcome: OUTCOME.RETRYABLE,
        retryable: true,
    },
    {
        name: 'unknown network code is fatal, never silently retried',
        input: {error: {code: 'ESOMETHINGWEIRD'}},
        outcome: OUTCOME.FATAL,
        retryable: false,
    },
    {
        name: 'no status and no code is fatal',
        input: {error: {}},
        outcome: OUTCOME.FATAL,
        retryable: false,
    },
    {
        name: 'non-object input is fatal, not a crash',
        input: null,
        outcome: OUTCOME.FATAL,
        retryable: false,
    },
];

test('classify_response taxonomy (table-driven)', ()=>{
    for (const tc of classify_cases)
    {
        const got = classify_response(tc.input, NOW);
        assert.equal(got.outcome, tc.outcome,
            `${tc.name}: outcome ${got.outcome} != ${tc.outcome}`);
        assert.equal(got.retryable, tc.retryable,
            `${tc.name}: retryable ${got.retryable} != ${tc.retryable}`);
        if (tc.retry_after_ms!==undefined)
        {
            assert.equal(got.retry_after_ms, tc.retry_after_ms,
                `${tc.name}: retry_after_ms ${got.retry_after_ms} `
                +`!= ${tc.retry_after_ms}`);
        }
        assert.equal(typeof got.reason, 'string',
            `${tc.name}: reason should be a string`);
    }
});

const parse_retry_after_cases = [
    {name: 'undefined -> null', value: undefined, expected: null},
    {name: 'null -> null', value: null, expected: null},
    {name: 'empty string -> null', value: '   ', expected: null},
    {name: 'integer seconds -> ms', value: '3', expected: 3000},
    {name: 'large integer seconds -> ms', value: '120', expected: 120000},
    {name: 'zero seconds -> 0', value: '0', expected: 0},
    {name: 'garbage -> null', value: 'soon', expected: null},
    // Strictness: fractional/negative/number-like junk must be null (fall back to
    // computed backoff), NOT 0 (an immediate retry via permissive Date.parse).
    {name: 'fractional seconds -> null (not 0)', value: '1.5', expected: null},
    {name: 'negative seconds -> null (not 0)', value: '-3', expected: null},
    {name: 'leading-plus -> null', value: '+5', expected: null},
    {name: 'trailing junk -> null', value: '5s', expected: null},
    {name: 'numeric-with-space -> null', value: '5 ', expected: 5000},
    {name: 'date-shaped junk -> null', value: 'Mon, not a date', expected: null},
    {
        name: 'future HTTP-date -> positive ms',
        value: 'Mon, 19 Jan 2026 20:51:18 GMT',
        expected: 10000,
    },
    {
        name: 'past HTTP-date clamps to 0',
        value: 'Mon, 19 Jan 2026 20:51:00 GMT',
        expected: 0,
    },
];

test('parse_retry_after (table-driven)', ()=>{
    for (const tc of parse_retry_after_cases)
    {
        const got = parse_retry_after(tc.value, NOW);
        assert.equal(got, tc.expected,
            `${tc.name}: got ${got} expected ${tc.expected}`);
    }
});

const backoff_cases = [
    {
        name: 'no jitter, attempt 0 -> base',
        attempt: 0,
        opts: {base_ms: 500, jitter: 'none'},
        expected: 500,
    },
    {
        name: 'no jitter, attempt 1 -> base*factor',
        attempt: 1,
        opts: {base_ms: 500, factor: 2, jitter: 'none'},
        expected: 1000,
    },
    {
        name: 'no jitter, attempt 3 -> base*factor^3',
        attempt: 3,
        opts: {base_ms: 500, factor: 2, jitter: 'none'},
        expected: 4000,
    },
    {
        name: 'no jitter caps at max_ms',
        attempt: 10,
        opts: {base_ms: 500, factor: 2, max_ms: 30000, jitter: 'none'},
        expected: 30000,
    },
    {
        name: 'retry_after_ms overrides exponential',
        attempt: 5,
        opts: {base_ms: 500, retry_after_ms: 2000, jitter: 'none'},
        expected: 2000,
    },
    {
        name: 'retry_after_ms is clamped to max_ms',
        attempt: 0,
        opts: {retry_after_ms: 120000, max_ms: 30000, jitter: 'none'},
        expected: 30000,
    },
    {
        name: 'full jitter with rng=0 -> 0',
        attempt: 2,
        opts: {base_ms: 500, jitter: 'full'},
        rng: ()=>0,
        expected: 0,
    },
    {
        name: 'full jitter with rng=1 -> capped value',
        attempt: 2,
        opts: {base_ms: 500, factor: 2, jitter: 'full'},
        rng: ()=>1,
        expected: 2000,
    },
    {
        name: 'equal jitter with rng=0 -> half capped',
        attempt: 2,
        opts: {base_ms: 500, factor: 2, jitter: 'equal'},
        rng: ()=>0,
        expected: 1000,
    },
    {
        name: 'equal jitter with rng=1 -> full capped',
        attempt: 2,
        opts: {base_ms: 500, factor: 2, jitter: 'equal'},
        rng: ()=>1,
        expected: 2000,
    },
    {
        name: 'negative attempt is floored to 0',
        attempt: -3,
        opts: {base_ms: 500, jitter: 'none'},
        expected: 500,
    },
    {
        name: 'defaults applied when opts empty',
        attempt: 0,
        opts: {jitter: 'none'},
        expected: 500,
    },
];

test('compute_backoff (table-driven)', ()=>{
    for (const tc of backoff_cases)
    {
        const rng = tc.rng || (()=>0.5);
        const got = compute_backoff(tc.attempt, tc.opts, rng);
        assert.equal(got, tc.expected,
            `${tc.name}: got ${got} expected ${tc.expected}`);
    }
});

test('full jitter stays within [0, capped] across the rng range', ()=>{
    const opts = {base_ms: 500, factor: 2, max_ms: 30000, jitter: 'full'};
    for (const r of [0, 0.01, 0.25, 0.5, 0.75, 0.99, 1])
    {
        const delay = compute_backoff(3, opts, ()=>r);
        assert.ok(delay>=0, `delay ${delay} should be >= 0`);
        assert.ok(delay<=4000, `delay ${delay} should be <= capped 4000`);
    }
});

const should_retry_cases = [
    {
        name: 'retryable within budget -> retry',
        classification: {retryable: true, retry_after_ms: null},
        attempt: 0,
        max_retries: 3,
        expect_retry: true,
    },
    {
        name: 'retryable but budget exhausted -> stop',
        classification: {retryable: true, retry_after_ms: null},
        attempt: 3,
        max_retries: 3,
        expect_retry: false,
    },
    {
        name: 'non-retryable -> never retry',
        classification: {retryable: false, retry_after_ms: null},
        attempt: 0,
        max_retries: 3,
        expect_retry: false,
    },
    {
        name: 'redirect classification -> never retried (no 3xx loop)',
        classification: classify_response({status: 302, headers: {}}),
        attempt: 0,
        max_retries: 3,
        expect_retry: false,
    },
    {
        name: 'missing classification -> never retry',
        classification: null,
        attempt: 0,
        max_retries: 3,
        expect_retry: false,
    },
    {
        name: 'retry honors classification retry_after_ms',
        classification: {retryable: true, retry_after_ms: 2000},
        attempt: 0,
        max_retries: 3,
        opts: {jitter: 'none', max_ms: 30000},
        expect_retry: true,
        expect_delay: 2000,
    },
];

test('should_retry budget + delay (table-driven)', ()=>{
    for (const tc of should_retry_cases)
    {
        const got = should_retry(tc.classification, tc.attempt, tc.max_retries,
            tc.opts || {jitter: 'none'}, ()=>0.5);
        assert.equal(got.retry, tc.expect_retry,
            `${tc.name}: retry ${got.retry} != ${tc.expect_retry}`);
        if (tc.expect_delay!==undefined)
        {
            assert.equal(got.delay_ms, tc.expect_delay,
                `${tc.name}: delay ${got.delay_ms} != ${tc.expect_delay}`);
        }
    }
});
