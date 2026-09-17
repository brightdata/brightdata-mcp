'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';

// LOG_LEVEL is read once at import, so each case imports a fresh instance
// through a cache-busting query and restores the environment afterwards.
let case_id = 0;
async function load_logger(level){
    const previous = process.env.LOG_LEVEL;
    if (level===undefined)
        delete process.env.LOG_LEVEL;
    else
        process.env.LOG_LEVEL = level;
    try {
        return await import(`../logger.js?case=${++case_id}`);
    } finally {
        if (previous===undefined)
            delete process.env.LOG_LEVEL;
        else
            process.env.LOG_LEVEL = previous;
    }
}

function capture(t){
    const lines = [];
    t.mock.method(console, 'error', (...args)=>{ lines.push(args); });
    return lines;
}

test('default level prints error through info, but not debug', async t=>{
    const {log} = await load_logger(undefined);
    const lines = capture(t);
    const zone = log('zone');
    zone.error('boom');
    zone.warn('careful');
    zone.info('hello');
    zone.debug('noisy');
    assert.deepEqual(lines.map(([first])=>first),
        ['[zone] boom', '[zone] careful', '[zone] hello']);
});

test('every line carries its scope tag and keeps printf arguments', async t=>{
    const {log} = await load_logger(undefined);
    const lines = capture(t);
    log('web_data_amazon_product').info('executing (client=%s) %s',
        'claude', '{"url":"x"}');
    assert.deepEqual(lines[0],
        ['[web_data_amazon_product] executing (client=%s) %s', 'claude',
            '{"url":"x"}']);
});

test('a non-string first argument is still scoped', async t=>{
    const {log} = await load_logger(undefined);
    const lines = capture(t);
    const error = new Error('nope');
    log('browser').error(error);
    assert.equal(lines[0][0], '[browser]');
    assert.equal(lines[0][1], error);
});

test('LOG_LEVEL=warn drops info and debug', async t=>{
    const {log} = await load_logger('warn');
    const lines = capture(t);
    log('zone').info('hello');
    log('zone').debug('noisy');
    log('zone').warn('careful');
    assert.deepEqual(lines.map(([first])=>first), ['[zone] careful']);
});

test('LOG_LEVEL=debug lets everything through', async t=>{
    const {log} = await load_logger('debug');
    const lines = capture(t);
    log('tool').debug('detail');
    assert.deepEqual(lines.map(([first])=>first), ['[tool] detail']);
});

test('LOG_LEVEL=silent prints nothing at all', async t=>{
    const {log} = await load_logger('silent');
    const lines = capture(t);
    const zone = log('zone');
    zone.error('boom');
    zone.warn('careful');
    zone.info('hello');
    assert.deepEqual(lines, []);
});

// A mistyped level must not silence the server -- that would hide exactly the
// diagnostics someone setting LOG_LEVEL is trying to read.
test('an unrecognized LOG_LEVEL warns once and behaves as the default',
    async t=>{
    const lines = capture(t);
    const {log} = await load_logger('verbose');
    assert.equal(lines.length, 1, 'exactly one warning at import');
    assert.match(lines[0][0], /^\[config\] unrecognized LOG_LEVEL "verbose"/);
    assert.match(lines[0][0], /silent, error, warn, info, debug/);
    log('zone').info('hello');
    assert.equal(lines[1][0], '[zone] hello', 'info still prints');
});

test('log() returns the same bound object for a scope', async()=>{
    const {log} = await load_logger(undefined);
    assert.equal(log('zone'), log('zone'));
    assert.notEqual(log('zone'), log('server'));
});

test('nothing is ever written to stdout', async t=>{
    const {log} = await load_logger(undefined);
    const written = [];
    t.mock.method(process.stdout, 'write', (chunk)=>{
        written.push(chunk);
        return true;
    });
    t.mock.method(console, 'error', ()=>{});
    log('zone').error('boom');
    log('zone').info('hello');
    assert.deepEqual(written, [],
        'stdout carries the MCP protocol and must stay clean');
});
