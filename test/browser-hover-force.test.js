'use strict'; /*jslint node:true es9:true*/
import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import axios from 'axios';
import {chromium} from 'playwright';
import {Browser_session} from '../browser_session.js';
import {tools} from '../browser_tools.js';

const tool = name=>{
    const found = tools.find(t=>t.name==name);
    assert.ok(found, `missing tool ${name}`);
    return found;
};
const click_ref = tool('scraping_browser_click_ref');
const hover_ref = tool('scraping_browser_hover_ref');

test('hover_ref and click_ref force are declared tool parameters', ()=>{
    assert.deepEqual(click_ref.parameters.parse({ref: '1', element: 'x'}),
        {ref: '1', element: 'x'});
    assert.equal(click_ref.parameters.parse({ref: '1', element: 'x',
        force: true}).force, true);
    assert.throws(()=>click_ref.parameters.parse({ref: '1', element: 'x',
        force: 'yes'}));
    assert.deepEqual(hover_ref.parameters.parse({ref: '1', element: 'x'}),
        {ref: '1', element: 'x'});
    assert.throws(()=>hover_ref.parameters.parse({element: 'x'}));
});

const refs_from = snapshot=>{
    assert.ok(snapshot.dom_snapshot, 'fixture must emit DOM references');
    return new Map(snapshot.dom_snapshot.split('\n').map(line=>{
        const match = line.match(/^\[([^\]]+)\] \S+ "([^"]+)"$/);
        assert.ok(match, `Unexpected fixture snapshot line: ${line}`);
        return [match[2], match[1]];
    }));
};
const have_browser = existsSync(chromium.executablePath());

test('hover_ref and click_ref force act on a real page', {
    skip: !have_browser && !process.env.CI
        ? 'no Chromium available; run npx playwright install chromium' : false,
    timeout: 60000,
}, async t=>{
    assert.ok(have_browser, 'Chromium is required in CI; run '
        +'npx playwright install --with-deps chromium');
    const profile = await mkdtemp(path.join(tmpdir(), 'bd-hover-test-'));
    let host, session;
    t.after(async()=>{
        try {
            await session?.close();
            await host?.close();
        } finally { await rm(profile, {recursive: true, force: true}); }
    });
    host = await chromium.launchPersistentContext(profile, {
        headless: true,
        args: ['--remote-debugging-port=0'],
    });
    const [port] = (await readFile(path.join(profile, 'DevToolsActivePort'),
        'utf8')).trim().split('\n');
    session = new Browser_session({cdp_endpoint: `http://127.0.0.1:${port}`});
    const page = await session.get_page();
    await page.setViewportSize({width: 1100, height: 800});

    // The tools open their own remote session. Answer its credential
    // lookups without a network call and resolve refs on the local page.
    const fake_api = axios.interceptors.request.use(config=>({...config,
        adapter: async c=>({status: 200, statusText: 'OK', headers: {},
            config: c, data: c.url.includes('/zone/passwords')
                ? {passwords: ['test']} : {customer: 'test'}})}));
    t.after(()=>axios.interceptors.request.eject(fake_api));
    const ref_locator = Browser_session.prototype.ref_locator;
    mock.method(Browser_session.prototype, 'ref_locator',
        args=>ref_locator.call(session, args));
    t.after(()=>mock.restoreAll());

    const setup = async html=>{
        await page.goto('data:text/html,'+encodeURIComponent(html));
        await page.evaluate(()=>{
            window.clicked = [];
            document.addEventListener('click', e=>{
                window.clicked.push(e.target.id);
            });
        });
    };
    const refs = async()=>refs_from(
        await session.capture_snapshot({filtered: true}));
    const clicked = ()=>page.evaluate(()=>window.clicked);

    await t.test('hover reveals content shown only on :hover', async()=>{
        await setup('<style>#items{display:none}'
            +'#menu:hover #items{display:block}</style>'
            +'<div id="menu"><button id="account">Account</button>'
            +'<div id="items"><button id="settings">Settings</button></div>'
            +'</div>');
        const before = await refs();
        assert.equal(before.has('Settings'), false);
        const result = await hover_ref.execute({ref: before.get('Account'),
            element: 'Account'});
        assert.match(result, /Successfully hovered over element: Account/);
        const after = await refs();
        assert.ok(after.has('Settings'), 'hover must reveal the menu item');
        await click_ref.execute({ref: after.get('Settings'),
            element: 'Settings'});
        assert.deepEqual(await clicked(), ['settings']);
    });

    await t.test('hover fires mouseenter handlers', async()=>{
        await setup('<span id="badge" role="button" tabindex="0" '
            +'onmouseenter="this.textContent=\'Badge open\'">Badge</span>');
        const before = await refs();
        await hover_ref.execute({ref: before.get('Badge'), element: 'Badge'});
        assert.equal(await page.locator('#badge').textContent(),
            'Badge open');
    });

    await t.test('force clicks an element that fails the enabled check',
    async()=>{
        await setup('<button id="custom" aria-disabled="true">Custom</button>');
        const ref = (await refs()).get('Custom');
        await assert.rejects(()=>click_ref.execute({ref, element: 'Custom'}),
            /not enabled/);
        assert.deepEqual(await clicked(), []);
        await click_ref.execute({ref, element: 'Custom', force: true});
        assert.deepEqual(await clicked(), ['custom']);
    });

    await t.test('force does not reach an element under a cover',
    async()=>{
        await setup('<button id="target">Target</button>'
            +'<div id="cover" style="position:fixed;inset:0"></div>');
        const ref = (await refs()).get('Target');
        await assert.rejects(()=>click_ref.execute({ref, element: 'Target'}),
            /intercepts pointer events/);
        await click_ref.execute({ref, element: 'Target', force: true});
        assert.deepEqual(await clicked(), ['cover']);
    });
});
