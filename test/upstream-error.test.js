'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {summarize_upstream, extract_message, clip, MAX_MESSAGE}
    from '../upstream_error.js';

// One case per body shape observed against the live API, so the next
// unfamiliar shape is a test case rather than a rediscovered bug.

test('a short plain-text body is passed through', ()=>{
    assert.equal(
        summarize_upstream({status: 404, data: 'dataset does not exist'}),
        'HTTP 404: dataset does not exist');
    assert.equal(
        summarize_upstream({status: 400,
            data: 'zone "mcp_probe_nonexistent_zone" not found'}),
        'HTTP 400: zone "mcp_probe_nonexistent_zone" not found');
});

// The case revision 1 of the plan would have thrown away: the marketplace
// reports validation failures as JSON, so the client hands us an object.
test('JSON validation errors survive, because they are the useful ones', ()=>{
    const body = {validation_errors: [
        '"dataset_id" must be one of [gd_me5ppxjr2ge6icjuh0, gd_l1viktl72bvl7bjuj0]']};
    const summary = summarize_upstream({status: 400, statusText: 'Bad Request',
        data: body});
    assert.match(summary, /^HTTP 400: "dataset_id" must be one of/);
    assert.ok(!summary.includes('Bad Request'),
        'the specific message wins over the generic status text');
});

test('several validation errors are joined', ()=>{
    const summary = summarize_upstream({status: 400,
        data: {validation_errors: ['size must be <= 10', 'filter is required']}});
    assert.equal(summary, 'HTTP 400: size must be <= 10; filter is required');
});

test('a standard OAuth-style error envelope is read', ()=>{
    assert.equal(
        summarize_upstream({status: 400, data: {error: 'invalid_request',
            error_description: 'redirect_uris is required'}}),
        'HTTP 400: redirect_uris is required');
    // error alone, when there is no description
    assert.equal(
        summarize_upstream({status: 401, data: {error: 'invalid_token'}}),
        'HTTP 401: invalid_token');
});

// Several tools ask for responseType: 'text', so a JSON error body reaches us
// as a string. The sentence inside is what matters, not the envelope.
test('a JSON body delivered as text is still unwrapped', ()=>{
    const raw = JSON.stringify({validation_errors: ['"zone" must be a known zone name']});
    assert.equal(summarize_upstream({status: 400, data: raw}),
        'HTTP 400: "zone" must be a known zone name');
    assert.equal(
        summarize_upstream({status: 400,
            data: '{"error":"invalid_request","error_description":"bad filter"}'}),
        'HTTP 400: bad filter');
});

test('a string that merely starts like JSON is left alone', ()=>{
    assert.equal(summarize_upstream({status: 400, data: '{not json at all'}),
        'HTTP 400: {not json at all');
});

test('an HTML error page is reduced to the status', ()=>{
    const page = '<!doctype html>\n<html><head><title>502</title></head>'
        +'<body>'+'x'.repeat(12000)+'</body></html>';
    const summary = summarize_upstream({status: 502, statusText: 'Bad Gateway',
        data: page});
    assert.equal(summary, 'HTTP 502: Bad Gateway');
    assert.ok(!summary.includes('<'), 'no markup reaches the model');
});

test('an empty body falls back to the status text, then to the status', ()=>{
    assert.equal(summarize_upstream({status: 500, statusText: 'Internal Server Error',
        data: ''}), 'HTTP 500: Internal Server Error');
    assert.equal(summarize_upstream({status: 500, data: ''}), 'HTTP 500');
    assert.equal(summarize_upstream({status: 500, statusText: '   ', data: null}),
        'HTTP 500');
});

test('an unfamiliar object still yields something bounded', ()=>{
    const summary = summarize_upstream({status: 418,
        data: {unexpected: 'shape', code: 7}});
    assert.match(summary, /^HTTP 418: \{/);
    assert.ok(summary.length<=MAX_MESSAGE+20);
});

test('nothing exceeds the bound', ()=>{
    const long = 'e'.repeat(5000);
    for (const body of [long, {message: long}, {validation_errors: [long]},
        {unknown: long}])
    {
        const summary = summarize_upstream({status: 400, data: body});
        assert.ok(summary.length<=MAX_MESSAGE+20,
            `summary was ${summary.length} chars`);
        assert.ok(summary.endsWith('…'), 'a clipped message is marked as clipped');
    }
});

test('a missing response does not throw', ()=>{
    assert.equal(summarize_upstream(undefined), 'Upstream request failed');
    assert.equal(summarize_upstream({}), 'Upstream request failed');
});

test('extract_message returns empty for bodies with nothing to say', ()=>{
    assert.equal(extract_message(''), '');
    assert.equal(extract_message('   '), '');
    assert.equal(extract_message('<html><body>x</body></html>'), '');
    assert.equal(extract_message(null), '');
    assert.equal(extract_message(undefined), '');
    assert.equal(extract_message(42), '');
    assert.equal(extract_message({}), '');
});

test('clip marks what it truncates and leaves short text alone', ()=>{
    assert.equal(clip('short'), 'short');
    assert.equal(clip('abcdef', 4), 'abc…');
    assert.equal(clip(null), '');
});
