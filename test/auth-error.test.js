'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {AUTH_HINT, is_auth_rejection, render_auth_error}
    from '../auth_error.js';

test('is_auth_rejection fires on 401 only', ()=>{
    assert.equal(is_auth_rejection({response: {status: 401}}), true);
    assert.equal(is_auth_rejection({response: {status: 403}}), false);
    assert.equal(is_auth_rejection({response: {status: 400}}), false);
    assert.equal(is_auth_rejection({response: {status: 500}}), false);
});

test('is_auth_rejection tolerates errors with no response', ()=>{
    assert.equal(is_auth_rejection(new Error('socket hang up')), false);
    assert.equal(is_auth_rejection(undefined), false);
    assert.equal(is_auth_rejection(null), false);
});

test('verified branch names the stale-token cause', ()=>{
    const message = render_auth_error({verified_at: Date.now()});
    assert.match(message, /verified the same token at startup/);
    assert.match(message, /validity changed while the server was running/);
});

test('verified branch never claims rotation as the cause', ()=>{
    const message = render_auth_error({verified_at: Date.now()});
    // Deleting a zone or revoking a permission produces the same
    // verified-then-rejected evidence, so rotation is not established.
    assert.doesNotMatch(message, /you rotated/i);
});

test('unverified branch states what it cannot tell', ()=>{
    const message = render_auth_error({verified_at: null});
    assert.match(message, /has not verified this token since startup/);
    assert.match(message, /whether the token changed or was never valid/);
});

test('both branches instruct the restart', ()=>{
    for (let state of [{verified_at: Date.now()}, {verified_at: null}])
    {
        const message = render_auth_error(state);
        assert.match(message, /restart the MCP client/);
        assert.match(message, /mcp\.json/);
    }
});

test('both branches carry the machine-readable hint marker', ()=>{
    for (let state of [{verified_at: Date.now()}, {verified_at: null}])
        assert.match(render_auth_error(state),
            new RegExp(`\\[brightdata_hint: ${AUTH_HINT}\\]`));
});

test('both branches point at the dashboard', ()=>{
    for (let state of [{verified_at: Date.now()}, {verified_at: null}])
    {
        assert.match(render_auth_error(state),
            /https:\/\/brightdata\.com\/cp\/setting\/users/);
    }
});

test('no branch ever reports the token as expired', ()=>{
    // The acceptance criterion: never report "Token expired". The upstream
    // body says it; this server must not relay it as its own finding.
    for (let state of [{verified_at: Date.now()}, {verified_at: null}, {}])
        assert.doesNotMatch(render_auth_error(state), /expired/i);
});

test('render_auth_error is total over missing state', ()=>{
    assert.equal(typeof render_auth_error(), 'string');
    assert.equal(typeof render_auth_error({}), 'string');
});
