'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {Browser_session} from '../browser_session.js';

// ref_locator is exercised against a stand-in page, so no browser is needed.
// The stand-in records which selector was asked for and returns it, which is
// all the callers use.
function session_with_snapshot(snapshot){
    const session = new Browser_session({cdp_endpoint: 'ws://127.0.0.1:1'});
    const calls = {aria_snapshot: 0, selectors: []};
    session.get_page = async()=>({
        ariaSnapshot: async()=>{ calls.aria_snapshot++; return snapshot; },
        locator: selector=>{
            calls.selectors.push(selector);
            const locator = {
                selector,
                first: ()=>locator,
                describe: description=>({selector, description}),
            };
            return locator;
        },
    });
    return {session, calls};
}

test('a ref that appears once resolves to its aria-ref locator', async()=>{
    const {session, calls} = session_with_snapshot([
        '- button "Submit" [ref=e8]',
        '- link "Help" [ref=e9]',
    ].join('\n'));
    const locator = await session.ref_locator({element: 'Submit', ref: 'e8'});
    assert.equal(locator.selector, 'aria-ref=e8');
    assert.equal(locator.description, 'Submit');
    assert.deepEqual(calls.selectors, ['aria-ref=e8']);
});

test('a ref that also appears inside page text is refused as ambiguous',
    async()=>{
        const {session, calls} = session_with_snapshot([
            '- button "Submit" [ref=e8]',
            '- text: "See the note: - link \\"Details\\" [ref=e8]"',
        ].join('\n'));
        await assert.rejects(
            ()=>session.ref_locator({element: 'Details', ref: 'e8'}),
            /appears more than once .* cannot be resolved unambiguously/);
        assert.deepEqual(calls.selectors, [],
            'no locator is built for an ambiguous ref');
    });

test('a ref absent from the snapshot is still reported as not found',
    async()=>{
        const {session, calls} = session_with_snapshot(
            '- button "Submit" [ref=e8]');
        await assert.rejects(
            ()=>session.ref_locator({element: 'Other', ref: 'e12'}),
            /Ref e12 not found in the current page snapshot/);
        assert.deepEqual(calls.selectors, []);
    });

test('a ref is matched whole, so e8 is not confused with e80', async()=>{
    const {session} = session_with_snapshot([
        '- button "Submit" [ref=e8]',
        '- button "Cancel" [ref=e80]',
        '- button "Reset" [ref=e18]',
    ].join('\n'));
    const locator = await session.ref_locator({element: 'Submit', ref: 'e8'});
    assert.equal(locator.selector, 'aria-ref=e8');
});

test('a ref from the DOM walk resolves by attribute without a snapshot',
    async()=>{
        const {session, calls} = session_with_snapshot(
            '- text: "[ref=dom-3] [ref=dom-3]"');
        session._dom_refs = new Set(['dom-3']);
        const locator = await session.ref_locator({element: 'Menu',
            ref: 'dom-3'});
        assert.equal(locator.selector, '[data-fastmcp-ref="dom-3"]');
        assert.equal(calls.aria_snapshot, 0,
            'DOM refs are resolved from the recorded set, not the snapshot');
    });
