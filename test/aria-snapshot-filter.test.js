'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {Aria_snapshot_filter} from '../aria_snapshot_filter.js';
import {Browser_session} from '../browser_session.js';

const SNAPSHOT = [
    '- button "Add to cart" [ref=e5]',
    '- link "Docs" [ref=e7]',
    '  - /url: https://example.com/docs',
    '- banner "decoration" [ref=e9]',
    '- textbox [ref=e11]',
].join('\n');

test('parses interactive elements into compact lines', ()=>{
    const out = Aria_snapshot_filter.filter_snapshot(SNAPSHOT);
    assert.ok(out.includes('[e5] button "Add to cart"'), 'button with name');
    assert.ok(out.includes('[e7] link "Docs" -> https://example.com/docs'),
        'link picks up its /url: line');
    assert.ok(out.includes('[e11] textbox'), 'nameless element');
    assert.ok(!out.includes('e9'), 'non-interactive roles are skipped');
});

test('element-free snapshots return the empty-case value', ()=>{
    assert.equal(Aria_snapshot_filter.filter_snapshot('- banner "x" [ref=e1]'),
        'No interactive elements found');
    assert.equal(Aria_snapshot_filter.filter_snapshot(''),
        'No interactive elements found');
});

test('long names are truncated', ()=>{
    const long = '- button "'+'x'.repeat(70)+'" [ref=e2]';
    assert.equal(Aria_snapshot_filter.filter_snapshot(long),
        '[e2] button "'+'x'.repeat(57)+'..."');
});

// The fix: a parse failure must throw, not be returned as content -- the old
// catch returned "Error filtering snapshot: <message>\n<stack>" in the same
// slot as the page's elements, and the model received a stack trace presented
// as the page.
test('a parse failure throws instead of returning an error string', ()=>{
    assert.throws(()=>Aria_snapshot_filter.filter_snapshot(null), TypeError);
});

// The fallback: when filtering fails, capture_snapshot must degrade to the
// full unfiltered snapshot (real content we already hold) with a visible
// note -- never fail the whole snapshot, never return garbage as the page.
test('capture_snapshot falls back to the unfiltered snapshot when filtering '
    +'fails', async()=>{
    const fake_page = {
        ariaSnapshot: async()=>'FULL SNAPSHOT TEXT',
        url: ()=>'http://example.com',
        title: async()=>'Example',
        evaluate: async()=>{
            throw new Error('evaluate must not run on the fallback path');
        },
    };
    const s = new Browser_session({cdp_endpoint: 'wss://x'});
    s._domainSessions.set('default', {browser: {}, page: fake_page,
        browserClosed: false, requests: new Map()});
    const original = Aria_snapshot_filter.filter_snapshot;
    Aria_snapshot_filter.filter_snapshot = ()=>{ throw new Error('boom'); };
    try {
        const out = await s.capture_snapshot({filtered: true});
        assert.ok(out.aria_snapshot.startsWith(
            '[note: snapshot filtering failed (boom)'),
            'model-visible note leads the content');
        assert.ok(out.aria_snapshot.includes('FULL SNAPSHOT TEXT'),
            'the real page follows the note');
        assert.ok(!('dom_snapshot' in out), 'no DOM pass on the fallback path');
        assert.equal(out.url, 'http://example.com');
        assert.equal(out.title, 'Example');
    } finally {
        Aria_snapshot_filter.filter_snapshot = original;
    }
});
