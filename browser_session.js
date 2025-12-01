'use strict'; /*jslint node:true es9:true*/
import * as playwright from 'playwright';
import {Aria_snapshot_filter} from './aria_snapshot_filter.js';

export class Browser_session {
    constructor({cdp_endpoint}){
        this.cdp_endpoint = cdp_endpoint;
        this._domainSessions = new Map();
        this._currentDomain = 'default';
        this._dom_refs = new Set();
    }

    _getDomain(url){
        try {
            const urlObj = new URL(url);
            return urlObj.hostname;
        } catch(e){
            console.error(`Error extracting domain from ${url}:`, e);
            return 'default';
        }
    }

    async _getDomainSession(domain, {log}={}){
        if (!this._domainSessions.has(domain)) 
        {
            this._domainSessions.set(domain, {
                browser: null,
                page: null,
                browserClosed: true,
                requests: new Map()
            });
        }
        return this._domainSessions.get(domain);
    }

    async get_browser({log, domain='default'}={}){
        try {
            const session = await this._getDomainSession(domain, {log});
            if (session.browser)
            {
                try { await session.browser.contexts(); }
                catch(e){
                    log?.(`Browser connection lost for domain ${domain} (${e.message}), `
                        +`reconnecting...`);
                    session.browser = null;
                    session.page = null;
                    session.browserClosed = true;
                }
            }
            if (!session.browser)
            {
                log?.(`Connecting to Bright Data Scraping Browser for domain ${domain}.`);
                session.browser = await playwright.chromium.connectOverCDP(
                    this.cdp_endpoint);
                session.browserClosed = false;
                session.browser.on('disconnected', ()=>{
                    log?.(`Browser disconnected for domain ${domain}`);
                    session.browser = null;
                    session.page = null;
                    session.browserClosed = true;
                });
                log?.(`Connected to Bright Data Scraping Browser for domain ${domain}`);
            }
            return session.browser;
        } catch(e){
            console.error(`Error connecting to browser for domain ${domain}:`, e);
            const session = this._domainSessions.get(domain);
            if (session) 
            {
                session.browser = null;
                session.page = null;
                session.browserClosed = true;
            }
            throw e;
        }
    }

    async get_page({url=null}={}){
        if (url) 
        {
            this._currentDomain = this._getDomain(url);
        }
        const domain = this._currentDomain;
        try {
            const session = await this._getDomainSession(domain);
            if (session.browserClosed || !session.page)
            {
                const browser = await this.get_browser({domain});
                const existingContexts = browser.contexts();
                if (existingContexts.length === 0)
                {
                    const context = await browser.newContext();
                    session.page = await context.newPage();
                }
                else
                {
                    const existingPages = existingContexts[0]?.pages();
                    if (existingPages && existingPages.length > 0)
                        session.page = existingPages[0];
                    else
                        session.page = await existingContexts[0].newPage();
                }
                session.page.on('request', request=>
                    session.requests.set(request, null));
                session.page.on('response', response=>
                    session.requests.set(response.request(), response));
                session.browserClosed = false;
                session.page.once('close', ()=>{
                    session.page = null;
                });
            }
            return session.page;
        } catch(e){
            console.error(`Error getting page for domain ${domain}:`, e);
            const session = this._domainSessions.get(domain);
            if (session) 
            {
                session.browser = null;
                session.page = null;
                session.browserClosed = true;
            }
            throw e;
        }
    }

    async capture_snapshot({filtered=true}={}){
        const page = await this.get_page();
        try {
            const full_snapshot = await page._snapshotForAI();
            if (!filtered)
            {
                return {
                    url: page.url(),
                    title: await page.title(),
                    aria_snapshot: full_snapshot,
                };
            }
            const filtered_snapshot = Aria_snapshot_filter.filter_snapshot(
                full_snapshot);
            const dom_snapshot = await page.evaluate(()=>{
                const selectors = [
                    'a[href]', 'button', 'input', 'select', 'textarea',
                    'option', '.radio-item', '[role]', '[tabindex]',
                    '[onclick]', '[data-spm-click]', '[data-click]',
                    '[data-action]', '[data-spm-anchor-id]',
                    '[aria-pressed]', '[aria-label]', '[aria-haspopup]'
                ];
                const nodes = Array.from(document.querySelectorAll(
                    selectors.join(',')));
                const elements = [];
                let counter = 0;

                const collapse = text => (text || '')
                    .replace(/\s+/g, ' ').trim();

                const get_labelledby = el=>{
                    const ids = (el.getAttribute('aria-labelledby') || '')
                        .split(/\s+/);
                    return ids.map(id=>{
                        const ref = document.getElementById(id);
                        return ref ? collapse(ref.innerText
                            || ref.textContent || '') : '';
                    }).filter(Boolean).join(' ');
                };

                const get_label_for = el=>{
                    const id = el.id && el.id.trim();
                    if (!id)
                        return '';
                    const lbl = document.querySelector(
                        `label[for="${CSS.escape(id)}"]`);
                    return lbl ? collapse(lbl.innerText
                        || lbl.textContent || '') : '';
                };

                const is_intrinsic = el=>{
                    const tag = el.tagName.toLowerCase();
                    if (['a', 'input', 'button', 'select', 'textarea',
                        'option'].includes(tag))
                    {
                        return true;
                    }
                    const role = (el.getAttribute('role') || '')
                        .toLowerCase();
                    if (['button', 'link', 'radio', 'option', 'tab',
                        'checkbox', 'menuitem'].includes(role))
                    {
                        return true;
                    }
                    if (el.classList.contains('radio-item'))
                        return true;
                    return el.hasAttribute('onclick')
                        || el.hasAttribute('data-click')
                        || el.hasAttribute('data-action')
                        || el.hasAttribute('data-spm-click')
                        || el.hasAttribute('data-spm-anchor-id');
                };

                const is_clickable = el=>{
                    const style = window.getComputedStyle(el);
                    if (style.display=='none' || style.visibility=='hidden'
                        || style.pointerEvents=='none')
                    {
                        return false;
                    }
                    const rect = el.getBoundingClientRect();
                    if (!rect || rect.width==0 || rect.height==0)
                        return false;
                    const center_x = rect.left + rect.width/2;
                    const center_y = rect.top + rect.height/2;
                    if (center_x<0 || center_x>window.innerWidth
                        || center_y<0 || center_y>window.innerHeight)
                    {
                        return false;
                    }
                    const top_el = document.elementFromPoint(center_x,
                        center_y);
                    if (top_el && (top_el==el || top_el.contains(el)
                        || el.contains(top_el)))
                    {
                        return true;
                    }
                    return is_intrinsic(el);
                };

                for (const el of nodes)
                {
                    if (!is_clickable(el))
                        continue;

                    let name = collapse(el.getAttribute('aria-label'))
                        || collapse(get_labelledby(el))
                        || collapse(el.getAttribute('title'))
                        || collapse(el.getAttribute('alt'))
                        || collapse(el.getAttribute('placeholder'))
                        || collapse(get_label_for(el));

                    if (!name)
                        name = collapse(el.innerText
                            || el.textContent || '');

                    if (name.length>80)
                        name = name.slice(0, 77)+'...';

                    const url = (el.href || el.getAttribute('data-url') || '')
                        .toString();

                    if (!name && !url)
                        continue;
                    if (!el.dataset.fastmcpRef)
                        el.dataset.fastmcpRef = `dom-${++counter}`;
                    elements.push({
                        ref: el.dataset.fastmcpRef,
                        role: el.getAttribute('role')
                            || el.tagName.toLowerCase(),
                        name,
                        url,
                    });
                }
                return elements;
            });
            this._dom_refs = new Set(dom_snapshot.map(el=>el.ref));
            return {
                url: page.url(),
                title: await page.title(),
                aria_snapshot: filtered_snapshot,
                dom_snapshot: Aria_snapshot_filter.format_dom_elements(
                    dom_snapshot),
            };
        } catch(e){
            throw new Error(`Error capturing ARIA snapshot: ${e.message}`);
        }
    }

    async ref_locator({element, ref}){
        const page = await this.get_page();
        try {
            if (this._dom_refs.has(ref))
            {
                return page.locator(`[data-fastmcp-ref="${ref}"]`)
                    .first().describe(element);
            }
            const snapshot = await page._snapshotForAI();
            if (!snapshot.includes(`[ref=${ref}]`))
                throw new Error('Ref '+ref+' not found in the current page '
                    +'snapshot. Try capturing new snapshot.');
            return page.locator(`aria-ref=${ref}`).describe(element);
        } catch(e){
            throw new Error(`Error creating ref locator for ${element} with ref ${ref}: ${e.message}`);
        }
    }

    async get_requests(){
        const domain = this._currentDomain;
        const session = await this._getDomainSession(domain);
        return session.requests;
    }

    async clear_requests(){
        const domain = this._currentDomain;
        const session = await this._getDomainSession(domain);
        session.requests.clear();
    }

    async close(domain=null){
        if (domain){
            const session = this._domainSessions.get(domain);
            if (session && session.browser) 
            {
                try { await session.browser.close(); }
                catch(e){ console.error(`Error closing browser for domain ${domain}:`, e); }
                session.browser = null;
                session.page = null;
                session.browserClosed = true;
                session.requests.clear();
                this._domainSessions.delete(domain);
            }
        }
        else {
            for (const [domain, session] of this._domainSessions.entries()) {
                if (session.browser) 
                {
                    try { await session.browser.close(); }
                    catch(e){ console.error(`Error closing browser for domain ${domain}:`, e); }
                    session.browser = null;
                    session.page = null;
                    session.browserClosed = true;
                    session.requests.clear();
                }
            }
            this._domainSessions.clear();
        }
        if (!domain) 
        {
            this._currentDomain = 'default';
        }
    }
}
