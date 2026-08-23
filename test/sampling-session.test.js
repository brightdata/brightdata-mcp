'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {select_sampling_session} from '../sampling_session.js';

// A stand-in for a fastmcp FastMCPSession: only the fields the resolver reads.
const S = id => ({sessionId: id, requestSampling: async()=>({})});

test('stdio: one session, no id -> that session', ()=>{
    const only = S(undefined);
    assert.equal(select_sampling_session([only], undefined), only);
});

test('http: id matches -> the matching session, not [0]', ()=>{
    const a = S('a'), b = S('b');
    // The bug this replaces would have returned a (index 0); the caller is b.
    assert.equal(select_sampling_session([a, b], 'b'), b);
});

test('no sessions -> throws (needs a sampling-capable client)', ()=>{
    assert.throws(()=>select_sampling_session([], undefined),
        /No active MCP session/);
    assert.throws(()=>select_sampling_session(undefined, undefined),
        /No active MCP session/);
});

test('id given but no session matches -> throws, never falls back to [0]', ()=>{
    const a = S('a');
    assert.throws(()=>select_sampling_session([a], 'ghost'),
        /Could not match the calling session/);
});

test('multiple sessions, no id -> refuses to guess', ()=>{
    assert.throws(()=>select_sampling_session([S('a'), S('b')], undefined),
        /refusing to guess/i);
});

test('null id is treated like a missing id', ()=>{
    const only = S(undefined);
    assert.equal(select_sampling_session([only], null), only);
    assert.throws(()=>select_sampling_session([S('a'), S('b')], null),
        /refusing to guess/i);
});
