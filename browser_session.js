'use strict'; /*jslint node:true es9:true*/
import * as playwright from 'playwright';
import {Aria_snapshot_filter} from './aria_snapshot_filter.js';

export class Browser_session {
    constructor({cdp_endpoint}){
        this.cdp_endpoint = cdp_endpoint;
        this._domainSessions = new Map();
        this._currentDomain = 'default';
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
            return {
                url: page.url(),
                title: await page.title(),
                aria_snapshot: filtered_snapshot,
            };
        } catch(e){
            throw new Error(`Error capturing ARIA snapshot: ${e.message}`);
        }
    }

    async ref_locator({element, ref}){
        const page = await this.get_page();
        try {
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

