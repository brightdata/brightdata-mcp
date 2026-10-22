'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';
import {Browser_session} from '../browser_session.js';

// Parse emitted fixture refs, not the attributes used internally by the locator.
const refs_from = snapshot=>{
    assert.ok(snapshot.dom_snapshot, 'fixture must emit DOM references');
    return new Map(snapshot.dom_snapshot.split('\n').map(line=>{
        const match = line.match(/^\[([^\]]+)\] \S+ "([^"]+)"$/);
        assert.ok(match, `Unexpected fixture snapshot line: ${line}`);
        return [match[2], match[1]];
    }));
};
const ref_for = (snapshot, label)=>{
    const ref = refs_from(snapshot).get(label);
    assert.ok(ref, `Missing emitted reference for ${label}`);
    return ref;
};
const have_browser = existsSync(chromium.executablePath());

test('filtered snapshot references preserve targets over real CDP', {
    skip: !have_browser && !process.env.CI
        ? 'no Chromium available; run npx playwright install chromium' : false,
    timeout: 60000,
}, async t=>{
    assert.ok(have_browser, 'Chromium is required in CI; run '
        +'npx playwright install --with-deps chromium');
    const profile = await mkdtemp(path.join(tmpdir(), 'bd-reference-test-'));
    const sessions = [];
    let host;
    t.after(async()=>{
        const results = await Promise.allSettled(sessions.map(s=>s.close()));
        try { await host?.close(); }
        finally { await rm(profile, {recursive: true, force: true}); }
        const errors = results.filter(r=>r.status==='rejected')
            .map(r=>r.reason);
        if (errors.length)
            throw new AggregateError(errors, 'CDP session cleanup failed');
    });
    // Chromium owns its ephemeral port; no fixed port or reserve/release race.
    host = await chromium.launchPersistentContext(profile, {
        headless: true,
        args: ['--remote-debugging-port=0'],
    });
    const [port] = (await readFile(path.join(profile, 'DevToolsActivePort'),
        'utf8')).trim().split('\n');
    assert.match(port, /^\d+$/);
    assert.ok(Number(port)>0 && Number(port)<65536, 'valid CDP port');
    const new_session = (Session=Browser_session)=>{
        const session = new Session({cdp_endpoint: `http://127.0.0.1:${port}`});
        sessions.push(session);
        return session;
    };
    const session = new_session();
    const page = await session.get_page();
    await page.setViewportSize({width: 1100, height: 800});
    page.setDefaultTimeout(3000);
    const setup = async html=>{
        // Navigation creates a new document, including its registry and observer.
        await page.goto('data:text/html,'+encodeURIComponent(html));
        await page.evaluate(()=>{
            window.clicked = [];
            document.addEventListener('click', e=>{
                window.clicked.push(e.target.id);
            });
        });
    };
    const snapshot = ()=>session.capture_snapshot({filtered: true});
    const click = async(ref, element, owner=session)=>{
        const locator = await owner.ref_locator({ref, element});
        await locator.click({timeout: 3000});
    };
    const clicked = ()=>page.evaluate(()=>window.clicked);

    await t.test('append preserves existing refs and targets the new node',
    async()=>{
        await setup('<button id="a">Cancel</button>');
        const old = ref_for(await snapshot(), 'Cancel');
        await page.evaluate(()=>document.body.insertAdjacentHTML('beforeend',
            '<button id="b">Continue</button>'));
        const current = await snapshot();
        const fresh = ref_for(current, 'Continue');
        assert.equal(ref_for(current, 'Cancel'), old);
        assert.notEqual(fresh, old);
        await click(fresh, 'Continue');
        assert.deepEqual(await clicked(), ['b']);
    });

    await t.test('prepend and reorder preserve node identity', async()=>{
        await setup('<button id="a">First</button>'
            +'<button id="b">Second</button>');
        const before = refs_from(await snapshot());
        await page.evaluate(()=>document.body.insertAdjacentHTML('afterbegin',
            '<button id="c">Inserted</button>'));
        const inserted = refs_from(await snapshot());
        assert.equal(inserted.get('First'), before.get('First'));
        assert.equal(inserted.get('Second'), before.get('Second'));
        assert.equal(new Set(inserted.values()).size, 3);
        await page.evaluate(()=>document.body.prepend(
            document.querySelector('#b')));
        const reordered = refs_from(await snapshot());
        assert.deepEqual(reordered, inserted);
        await click(before.get('First'), 'First');
        assert.deepEqual(await clicked(), ['a']);
    });

    await t.test('removed node refs are not reassigned after a fresh capture',
    async()=>{
        await setup('<button id="a">First</button>'
            +'<button id="b">Second</button>');
        const old = ref_for(await snapshot(), 'Second');
        await page.evaluate(()=>{
            document.querySelector('#b').remove();
            document.body.insertAdjacentHTML('beforeend',
                '<button id="c">Replacement</button>');
        });
        const fresh = ref_for(await snapshot(), 'Replacement');
        assert.notEqual(fresh, old);
        await assert.rejects(()=>click(old, 'Old second'),
            /not found in the current page snapshot/);
        await click(fresh, 'Replacement');
        assert.deepEqual(await clicked(), ['c']);
    });

    await t.test('a fresh capture repairs cloned reference attributes',
    async()=>{
        await setup('<button id="a">Original</button>');
        const old = ref_for(await snapshot(), 'Original');
        await page.evaluate(()=>{
            const copy = document.querySelector('#a').cloneNode(true);
            copy.id = 'b';
            copy.textContent = 'Copy';
            document.body.prepend(copy);
        });
        const current = await snapshot();
        assert.equal(ref_for(current, 'Original'), old);
        assert.notEqual(ref_for(current, 'Copy'), old);
        await click(old, 'Original');
        assert.deepEqual(await clicked(), ['a']);
        // Replacement after capture is a separate, existing lookup limitation.
    });

    await t.test('hidden refs do not collide when nodes are added and revealed',
    async()=>{
        await setup('<button id="a">First</button>'
            +'<button id="b">Second</button>');
        const old = ref_for(await snapshot(), 'First');
        await page.locator('#a').evaluate(el=>el.style.display='none');
        await page.evaluate(()=>document.body.insertAdjacentHTML('beforeend',
            '<button id="c">New</button>'));
        assert.notEqual(ref_for(await snapshot(), 'New'), old);
        await page.locator('#a').evaluate(el=>el.style.display='');
        const current = refs_from(await snapshot());
        assert.equal(current.get('First'), old);
        assert.equal(new Set(current.values()).size, 3);
        await click(old, 'First');
        assert.deepEqual(await clicked(), ['a']);
    });

    await t.test('navigation does not alias a previous document ref', async()=>{
        await setup('<button id="a">Old page</button>');
        const old = ref_for(await snapshot(), 'Old page');
        await setup('<button id="b">New page</button>');
        const fresh = ref_for(await snapshot(), 'New page');
        assert.notEqual(fresh, old);
        await assert.rejects(()=>click(old, 'Old page'),
            /not found in the current page snapshot/);
        await click(fresh, 'New page');
        assert.deepEqual(await clicked(), ['b']);
    });

    await t.test('ambiguous attributes fail without clicking either match',
    async()=>{
        await setup('<button id="a">First</button>'
            +'<button id="b">Second</button>');
        const ref = ref_for(await snapshot(), 'First');
        await page.locator('#b').evaluate((el, value)=>{
            el.dataset.fastmcpRef = value;
        }, ref);
        await assert.rejects(()=>click(ref, 'First'), /strict mode violation/);
        assert.deepEqual(await clicked(), []);
    });

    await t.test('concurrent captures keep stable unique emitted refs',
    async()=>{
        await setup('<button id="a">Anchor</button>');
        const anchor = ref_for(await snapshot(), 'Anchor');
        for (let n = 0; n<10; n++)
        {
            await page.evaluate(n=>document.body.insertAdjacentHTML('beforeend',
                `<button id="b${n}">Added ${n}</button>`), n);
            const captures = await Promise.all([snapshot(), snapshot()]);
            const first = refs_from(captures[0]);
            assert.deepEqual(refs_from(captures[1]), first);
            assert.equal(first.size, n+2);
            assert.equal(new Set(first.values()).size, first.size);
            assert.equal(first.get('Anchor'), anchor);
        }
        await click(anchor, 'Anchor');
        assert.deepEqual(await clicked(), ['a']);
    });

    await t.test('full ARIA refs work after filtered snapshots', async()=>{
        await setup('<button id="a">Target</button>');
        await snapshot();
        const full = await session.capture_snapshot({filtered: false});
        const match = full.aria_snapshot.match(
            /button "Target".*\[ref=([^\]]+)\]/);
        assert.ok(match, 'full snapshot must emit the target ARIA reference');
        await click(match[1], 'Target');
        assert.deepEqual(await clicked(), ['a']);
    });

    await t.test('unchanged captures do not mutate reference attributes',
    async()=>{
        await setup('<button id="a">Alpha</button>'
            +'<button id="b">Beta</button>');
        const before = await snapshot();
        await page.evaluate(()=>{
            window.ref_mutations = [];
            const observer = new MutationObserver(records=>{
                window.ref_mutations.push(...records.map(r=>r.target.id));
            });
            observer.observe(document.body, {subtree: true, attributes: true,
                attributeFilter: ['data-fastmcp-ref']});
        });
        const after = await snapshot();
        assert.equal(after.dom_snapshot, before.dom_snapshot);
        assert.deepEqual(await page.evaluate(()=>window.ref_mutations), []);
    });

    await t.test('shared-page wrappers preserve each other\'s saved refs',
    async()=>{
        await setup('<button id="a">Alpha</button>'
            +'<button id="b">Beta</button>');
        const first = new_session(), second = new_session();
        const before = await first.capture_snapshot({filtered: true});
        const alpha = ref_for(before, 'Alpha');
        await page.evaluate(()=>document.body.prepend(
            document.querySelector('#b')));
        const after = await second.capture_snapshot({filtered: true});
        assert.deepEqual(refs_from(after), refs_from(before));
        await click(alpha, 'Alpha', first);
        await click(ref_for(after, 'Beta'), 'Beta', second);
        assert.deepEqual(await clicked(), ['a', 'b']);
    });

    await t.test('emitted refs drive text, checkbox and select actions',
    async()=>{
        await setup('<label for="name">Name</label><input id="name">'
            +'<label for="check">Consent</label>'
            +'<input id="check" type="checkbox">'
            +'<label for="select">Choice</label><select id="select">'
            +'<option>A</option><option>B</option></select>');
        const current = await snapshot();
        const field = label=>session.ref_locator({
            ref: ref_for(current, label), element: label,
        });
        await (await field('Name')).fill('Example', {timeout: 3000});
        await (await field('Consent')).setChecked(true, {timeout: 3000});
        await (await field('Choice')).selectOption({label: 'B'}, {timeout: 3000});
        assert.deepEqual(await page.evaluate(()=>({
            name: document.querySelector('#name').value,
            checked: document.querySelector('#check').checked,
            choice: document.querySelector('#select').value,
        })), {name: 'Example', checked: true, choice: 'B'});
    });

    await t.test('non-extensible DOM nodes retain working refs', async()=>{
        await setup('<button id="a">Frozen node</button>');
        await page.locator('#a').evaluate(el=>Object.preventExtensions(el));
        await click(ref_for(await snapshot(), 'Frozen node'), 'Frozen node');
        assert.deepEqual(await clicked(), ['a']);
    });

    await t.test('independent allocator modules share document identities',
    async()=>{
        await setup('<button id="a">Alpha</button>');
        const source = new URL('../browser_session.js', import.meta.url);
        source.searchParams.set('reference-test', 'one');
        const {Browser_session: One} = await import(source.href);
        source.searchParams.set('reference-test', 'two');
        const {Browser_session: Two} = await import(source.href);
        const first = new_session(One), second = new_session(Two);
        const alpha = ref_for(await first.capture_snapshot({filtered: true}),
            'Alpha');
        await page.evaluate(()=>document.body.insertAdjacentHTML('beforeend',
            '<button id="b">Beta</button>'));
        const current = await second.capture_snapshot({filtered: true});
        const beta = ref_for(current, 'Beta');
        assert.equal(ref_for(current, 'Alpha'), alpha);
        assert.notEqual(beta, alpha);
        await click(beta, 'Beta', second);
        await click(alpha, 'Alpha', first);
        assert.deepEqual(await clicked(), ['b', 'a']);
    });

    await t.test('fresh captures preserve identity across cached page switches',
    async()=>{
        await setup('<button id="a">First page</button>');
        const first = ref_for(await snapshot(), 'First page');
        const second_page = await page.context().newPage();
        try {
            await second_page.setContent('<button id="b">Second page</button>');
            await second_page.evaluate(()=>{
                window.clicked = [];
                document.addEventListener('click', e=>{
                    window.clicked.push(e.target.id);
                });
            });
            // Seed only the existing domain cache with a second real page.
            // Snapshot allocation, membership and action resolution stay real.
            session._domainSessions.set('second', {
                browser: await session.get_browser(), page: second_page,
                browserClosed: false, requests: new Map(),
            });
            session._currentDomain = 'second';
            const second = ref_for(await snapshot(), 'Second page');
            assert.notEqual(second, first);
            await click(second, 'Second page');
            assert.deepEqual(await second_page.evaluate(()=>window.clicked),
                ['b']);
            session._currentDomain = 'default';
            // Membership is session-wide: refresh the selected page first.
            assert.equal(ref_for(await snapshot(), 'First page'), first);
            await click(first, 'First page');
            assert.deepEqual(await clicked(), ['a']);
        } finally {
            session._currentDomain = 'default';
            session._domainSessions.delete('second');
            await second_page.close();
        }
    });
});
