'use strict'; /*jslint node:true es9:true*/
import {UserError, imageContent as image_content} from 'fastmcp';
import {z} from 'zod';
import axios from 'axios';
import {Browser_session} from './browser_session.js';
let browser_zone = process.env.BROWSER_ZONE || 'mcp_browser';

let open_session;
const require_browser = async()=>{
    if (!open_session)
    {
        open_session = new Browser_session({
            cdp_endpoint: await calculate_cdp_endpoint(),
        });
    }
    return open_session;
};

const calculate_cdp_endpoint = async()=>{
    try {
        const status_response = await axios({
            url: 'https://api.brightdata.com/status',
            method: 'GET',
            headers: {authorization: `Bearer ${process.env.API_TOKEN}`},
        });
        const customer = status_response.data.customer;
        const password_response = await axios({
            url: `https://api.brightdata.com/zone/passwords?zone=${browser_zone}`,
            method: 'GET',
            headers: {authorization: `Bearer ${process.env.API_TOKEN}`},
        });
        const password = password_response.data.passwords[0];

        return `wss://brd-customer-${customer}-zone-${browser_zone}:`
            +`${password}@brd.superproxy.io:9222`;
    } catch(e){
        if (e.response?.status===422)
            throw new Error(`Browser zone '${browser_zone}' does not exist`);
        throw new Error(`Error retrieving browser credentials: ${e.message}`);
    }
};

let scraping_browser_navigate = {
    name: 'scraping_browser_navigate',
    description: 'Navigate a scraping browser session to a new URL',
    parameters: z.object({
        url: z.string().describe('The URL to navigate to'),
    }),
    execute: async({url})=>{
        const browser_session = await require_browser();
        const page = await browser_session.get_page({url});
        await browser_session.clear_requests();
        try {
            await page.goto(url, {
                timeout: 120000,
                waitUntil: 'domcontentloaded',
            });
            return [
                `Successfully navigated to ${url}`,
                `Title: ${await page.title()}`,
                `URL: ${page.url()}`,
            ].join('\n');
        } catch(e){
            throw new UserError(`Error navigating to ${url}: ${e}`);
        }
    },
};

let scraping_browser_go_back = {
    name: 'scraping_browser_go_back',
    description: 'Go back to the previous page',
    parameters: z.object({}),
    execute: async()=>{
        const page = await (await require_browser()).get_page();
        try {
            await page.goBack();
            return [
                'Successfully navigated back',
                `Title: ${await page.title()}`,
                `URL: ${page.url()}`,
            ].join('\n');
        } catch(e){
            throw new UserError(`Error navigating back: ${e}`);
        }
    },
};

const scraping_browser_go_forward = {
    name: 'scraping_browser_go_forward',
    description: 'Go forward to the next page',
    parameters: z.object({}),
    execute: async()=>{
        const page = await (await require_browser()).get_page();
        try {
            await page.goForward();
            return [
                'Successfully navigated forward',
                `Title: ${await page.title()}`,
                `URL: ${page.url()}`,
            ].join('\n');
        } catch(e){
            throw new UserError(`Error navigating forward: ${e}`);
        }
    },
};

let scraping_browser_snapshot = {
    name: 'scraping_browser_snapshot',
    description: [
        'Capture an ARIA snapshot of the current page showing all interactive '
        +'elements with their refs.',
        'This provides accurate element references that can be used with '
        +'ref-based tools.',
        'Use this before interacting with elements to get proper refs instead '
        +'of guessing selectors.'
    ].join('\n'),
    parameters: z.object({}),
    execute: async()=>{
        const browser_session = await require_browser();
        try {
            const snapshot = await browser_session.capture_snapshot();
            return [
                `Page: ${snapshot.url}`,
                `Title: ${snapshot.title}`,
                '',
                'Interactive Elements:',
                snapshot.aria_snapshot
            ].join('\n');
        } catch(e){
            throw new UserError(`Error capturing snapshot: ${e}`);
        }
    },
};

let scraping_browser_click_ref = {
    name: 'scraping_browser_click_ref',
    description: [
        'Click on an element using its ref from the ARIA snapshot.',
        'Use scraping_browser_snapshot first to get the correct ref values.',
        'This is more reliable than CSS selectors.'
    ].join('\n'),
    parameters: z.object({
        ref: z.string().describe('The ref attribute from the ARIA snapshot (e.g., "23")'),
        element: z.string().describe('Description of the element being clicked for context'),
    }),
    execute: async({ref, element})=>{
        const browser_session = await require_browser();
        try {
            const locator = await browser_session.ref_locator({element, ref});
            await locator.click({timeout: 5000});
            return `Successfully clicked element: ${element} (ref=${ref})`;
        } catch(e){
            throw new UserError(`Error clicking element ${element} with ref ${ref}: ${e}`);
        }
    },
};

let scraping_browser_type_ref = {
    name: 'scraping_browser_type_ref',
    description: [
        'Type text into an element using its ref from the ARIA snapshot.',
        'Use scraping_browser_snapshot first to get the correct ref values.',
        'This is more reliable than CSS selectors.'
    ].join('\n'),
    parameters: z.object({
        ref: z.string().describe('The ref attribute from the ARIA snapshot (e.g., "23")'),
        element: z.string().describe('Description of the element being typed into for context'),
        text: z.string().describe('Text to type'),
        submit: z.boolean().optional()
            .describe('Whether to submit the form after typing (press Enter)'),
    }),
    execute: async({ref, element, text, submit})=>{
        const browser_session = await require_browser();
        try {
            const locator = await browser_session.ref_locator({element, ref});
            await locator.fill(text);
            if (submit)
                await locator.press('Enter');
            const suffix = submit ? ' and submitted the form' : '';
            return 'Successfully typed "'+text+'" into element: '+element
                +' (ref='+ref+')'+suffix;
        } catch(e){
            throw new UserError(`Error typing into element ${element} with ref ${ref}: ${e}`);
        }
    },
};

let scraping_browser_screenshot = {
    name: 'scraping_browser_screenshot',
    description: 'Take a screenshot of the current page',
    parameters: z.object({
        full_page: z.boolean().optional().describe([
            'Whether to screenshot the full page (default: false)',
            'You should avoid fullscreen if it\'s not important, since the '
            +'images can be quite large',
        ].join('\n')),
    }),
    execute: async({full_page=false})=>{
        const page = await (await require_browser()).get_page();
        try {
            const buffer = await page.screenshot({fullPage: full_page});
            return image_content({buffer});
        } catch(e){
            throw new UserError(`Error taking screenshot: ${e}`);
        }
    },
};

let scraping_browser_get_html = {
    name: 'scraping_browser_get_html',
    description: 'Get the HTML content of the current page. Avoid using this '
    +'tool and if used, use full_page option unless it is important to see '
    +'things like script tags since this can be large',
    parameters: z.object({
        full_page: z.boolean().optional().describe([
            'Whether to get the full page HTML including head and script tags',
            'Avoid this if you only need the extra HTML, since it can be '
            +'quite large',
        ].join('\n')),
    }),
    execute: async({full_page=false})=>{
        const page = await (await require_browser()).get_page();
        try {
            if (!full_page)
                return await page.$eval('body', body=>body.innerHTML);
            const html = await page.content();
            if (!full_page && html)
                return html.split('<body>')[1].split('</body>')[0];
            return html;
        } catch(e){
            throw new UserError(`Error getting HTML content: ${e}`);
        }
    },
};

let scraping_browser_get_text = {
    name: 'scraping_browser_get_text',
    description: 'Get the text content of the current page',
    parameters: z.object({}),
    execute: async()=>{
        const page = await (await require_browser()).get_page();
        try { return await page.$eval('body', body=>body.innerText); }
        catch(e){ throw new UserError(`Error getting text content: ${e}`); }
    },
};

let scraping_browser_scroll = {
    name: 'scraping_browser_scroll',
    description: 'Scroll to the bottom of the current page',
    parameters: z.object({}),
    execute: async()=>{
        const page = await (await require_browser()).get_page();
        try {
            await page.evaluate(()=>{
                window.scrollTo(0, document.body.scrollHeight);
            });
            return 'Successfully scrolled to the bottom of the page';
        } catch(e){
            throw new UserError(`Error scrolling page: ${e}`);
        }
    },
};

let scraping_browser_scroll_to_ref = {
    name: 'scraping_browser_scroll_to_ref',
    description: [
        'Scroll to a specific element using its ref from the ARIA snapshot.',
        'Use scraping_browser_snapshot first to get the correct ref values.',
        'This is more reliable than CSS selectors.'
    ].join('\n'),
    parameters: z.object({
        ref: z.string().describe('The ref attribute from the ARIA snapshot (e.g., "23")'),
        element: z.string().describe('Description of the element to scroll to'),
    }),
    execute: async({ref, element})=>{
        const browser_session = await require_browser();
        try {
            const locator = await browser_session.ref_locator({element, ref});
            await locator.scrollIntoViewIfNeeded();
            return `Successfully scrolled to element: ${element} (ref=${ref})`;
        } catch(e){
            throw new UserError(`Error scrolling to element ${element} with `
                +`ref ${ref}: ${e}`);
        }
    },
};

let scraping_browser_network_requests = {
    name: 'scraping_browser_network_requests',
    description: [
        'Get all network requests made since loading the current page.',
        'Shows HTTP method, URL, status code and status text for each request.',
        'Useful for debugging API calls, tracking data fetching, and '
        +'understanding page behavior.'
    ].join('\n'),
    parameters: z.object({}),
    execute: async()=>{
        const browser_session = await require_browser();
        try {
            const requests = await browser_session.get_requests();
            if (requests.size==0) 
                return 'No network requests recorded for the current page.';

            const results = [];
            requests.forEach((response, request)=>{
                const result = [];
                result.push(`[${request.method().toUpperCase()}] ${request.url()}`);
                if (response)
                    result.push(`=> [${response.status()}] ${response.statusText()}`);

                results.push(result.join(' '));
            });
            
            return [
                `Network Requests (${results.length} total):`,
                '',
                ...results
            ].join('\n');
        } catch(e){
            throw new UserError(`Error getting network requests: ${e}`);
        }
    },
};

let scraping_browser_wait_for_ref = {
    name: 'scraping_browser_wait_for_ref',
    description: [
        'Wait for an element to be visible using its ref from the ARIA snapshot.',
        'Use scraping_browser_snapshot first to get the correct ref values.',
        'This is more reliable than CSS selectors.'
    ].join('\n'),
    parameters: z.object({
        ref: z.string().describe('The ref attribute from the ARIA snapshot (e.g., "23")'),
        element: z.string().describe('Description of the element being waited for'),
        timeout: z.number().optional()
            .describe('Maximum time to wait in milliseconds (default: 30000)'),
    }),
    execute: async({ref, element, timeout})=>{
        const browser_session = await require_browser();
        try {
            const locator = await browser_session.ref_locator({element, ref});
            await locator.waitFor({timeout: timeout || 30000});
            return `Successfully waited for element: ${element} (ref=${ref})`;
        } catch(e){
            throw new UserError(`Error waiting for element ${element} with ref ${ref}: ${e}`);
        }
    },
};

export const tools = [
    scraping_browser_navigate,
    scraping_browser_go_back,
    scraping_browser_go_forward,
    scraping_browser_snapshot,
    scraping_browser_click_ref,
    scraping_browser_type_ref,
    scraping_browser_screenshot,
    scraping_browser_network_requests,
    scraping_browser_wait_for_ref,
    scraping_browser_get_text,
    scraping_browser_get_html,
    scraping_browser_scroll,
    scraping_browser_scroll_to_ref,
];
