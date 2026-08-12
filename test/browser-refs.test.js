'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import * as playwright from 'playwright';
import {Browser_session} from '../browser_session.js';

// These tests drive the real Browser_session against a locally-launched
// browser. They prefer the system Chrome (channel: 'chrome') and fall back to
// a Playwright-managed chromium; when neither is available the tests skip.
const launch_browser = async()=>{
    for (const opts of [{channel: 'chrome'}, {}])
    {
        try { return await playwright.chromium.launch(
            {headless: true, ...opts}); }
        catch(e){ /* try next */ }
    }
    return null;
};

const page_session = page=>{
    const session = new Browser_session({cdp_endpoint: 'wss://unused'});
    session.get_page = async()=>page;
    return session;
};

const ref_pairs = page=>page.$$eval('[data-fastmcp-ref]',
    els=>els.map(el=>({ref: el.dataset.fastmcpRef, text: el.textContent})));

test('dom refs stay unique when the page mutates between snapshots',
    async t=>{
    const browser = await launch_browser();
    if (!browser)
        return t.skip('no local Chrome/Chromium available');
    try {
        const page = await browser.newPage();
        await page.setContent('<button>Alpha</button><button>Beta</button>'
            +'<button>Gamma</button>');
        const session = page_session(page);

        await session.capture_snapshot({filtered: true});
        // New elements appear BEFORE the old ones (modal, banner, fresh
        // results) -- the shape that used to produce duplicate refs.
        await page.evaluate(()=>{
            for (const name of ['NewTwo', 'NewOne'])
            {
                const b = document.createElement('button');
                b.textContent = name;
                document.body.prepend(b);
            }
        });
        const snapshot = await session.capture_snapshot({filtered: true});

        const pairs = await ref_pairs(page);
        const refs = pairs.map(p=>p.ref);
        assert.equal(new Set(refs).size, refs.length,
            'every element carries a unique ref: '+JSON.stringify(pairs));

        // The list shown to the model and the page agree, and resolution
        // hits exactly the element the list names.
        for (const {ref, text} of pairs)
        {
            assert.match(snapshot.dom_snapshot,
                new RegExp(`\\[${ref}\\] button "${text}"`),
                `model-facing list names ${ref} as "${text}"`);
            const locator = await session.ref_locator({element: text, ref});
            assert.equal(await locator.textContent(), text,
                `${ref} resolves to the element the list names`);
        }
    } finally {
        await browser.close();
    }
});

test('a dom ref from before a navigation fails with a clear stale error',
    async t=>{
    const browser = await launch_browser();
    if (!browser)
        return t.skip('no local Chrome/Chromium available');
    try {
        const page = await browser.newPage();
        await page.setContent('<button>Alpha</button>');
        const session = page_session(page);
        await session.capture_snapshot({filtered: true});

        // Replacing the document wipes the data-fastmcp-ref attributes.
        await page.setContent('<p>a different page</p>');
        await assert.rejects(session.ref_locator(
            {element: 'Alpha', ref: 'dom-1'}),
            /stale.*Try capturing new snapshot/s,
            'stale ref names the remedy instead of timing out');
    } finally {
        await browser.close();
    }
});

test('an unfiltered snapshot invalidates earlier dom refs', async t=>{
    const browser = await launch_browser();
    if (!browser)
        return t.skip('no local Chrome/Chromium available');
    try {
        const page = await browser.newPage();
        await page.setContent('<button>Alpha</button>');
        const session = page_session(page);
        await session.capture_snapshot({filtered: true});
        await session.capture_snapshot({filtered: false});

        // The registry is reset, so the old dom ref routes to the ARIA
        // branch and gets its clear re-snapshot error.
        await assert.rejects(session.ref_locator(
            {element: 'Alpha', ref: 'dom-1'}),
            /not found in the current page snapshot/,
            'old dom refs are not silently resolved after a raw snapshot');
    } finally {
        await browser.close();
    }
});
