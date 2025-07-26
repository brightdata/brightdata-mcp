'use strict'; /*jslint node:true es9:true*/
import {UserError, imageContent as image_content} from 'fastmcp';
import {z} from 'zod';
import axios from 'axios';
import {Browser_session} from './browser_session.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
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
        const page = await (await require_browser()).get_page({url});
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

let scraping_browser_click = {
    name: 'scraping_browser_click',
    description: [
        'Click on an element.',
        'Avoid calling this unless you know the element selector (you can use '
        +'other tools to find those)',
    ].join('\n'),
    parameters: z.object({
        selector: z.string().describe('CSS selector for the element to click'),
    }),
    execute: async({selector})=>{
        const page = await (await require_browser()).get_page();
        try {
            await page.click(selector, {timeout: 5000});
            return `Successfully clicked element: ${selector}`;
        } catch(e){
            throw new UserError(`Error clicking element ${selector}: ${e}`);
        }
    },
};

let scraping_browser_links = {
    name: 'scraping_browser_links',
    description: [
        'Get all links on the current page, text and selectors',
        "It's strongly recommended that you call the links tool to check that "
        +'your click target is valid',
    ].join('\n'),
    parameters: z.object({}),
    execute: async()=>{
        const page = await (await require_browser()).get_page();
        try {
            const links = await page.$$eval('a', elements=>{
                return elements.map(el=>{
                    return {
                        text: el.innerText,
                        href: el.href,
                        selector: el.outerHTML,
                    };
                });
            });
            return JSON.stringify(links, null, 2);
        } catch(e){
            throw new UserError(`Error getting links: ${e}`);
        }
    },
};

let scraping_browser_type = {
    name: 'scraping_browser_type',
    description: 'Type text into an element',
    parameters: z.object({
        selector: z.string()
            .describe('CSS selector for the element to type into'),
        text: z.string().describe('Text to type'),
        submit: z.boolean().optional()
            .describe('Whether to submit the form after typing (press Enter)'),
    }),
    execute: async({selector, text, submit})=>{
        const page = await (await require_browser()).get_page();
        try {
            await page.fill(selector, text);
            if (submit)
                await page.press(selector, 'Enter');
            return `Successfully typed "${text}" into element: `
            +`${selector}${submit ? ' and submitted the form' : ''}`;
        } catch(e){
            throw new UserError(`Error typing into element ${selector}: ${e}`);
        }
    },
};

let scraping_browser_wait_for = {
    name: 'scraping_browser_wait_for',
    description: 'Wait for an element to be visible on the page',
    parameters: z.object({
        selector: z.string().describe('CSS selector to wait for'),
        timeout: z.number().optional()
            .describe('Maximum time to wait in milliseconds (default: 30000)'),
    }),
    execute: async({selector, timeout})=>{
        const page = await (await require_browser()).get_page();
        try {
            await page.waitForSelector(selector, {timeout: timeout||30000});
            return `Successfully waited for element: ${selector}`;
        } catch(e){
            throw new UserError(`Error waiting for element ${selector}: ${e}`);
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
        save_to_desktop: z.boolean().optional().describe([
            'Whether to save the screenshot to desktop (default: false)',
            'If true, saves the screenshot as a PNG file on your desktop',
        ].join('\n')),
        filename: z.string().optional().describe([
            'Custom filename for the saved screenshot (without extension)',
            'If not provided, uses timestamp-based filename',
        ].join('\n')),
    }),
    execute: async({full_page = false, save_to_desktop = false, filename})=>{
        const page = await (await require_browser()).get_page();
        try {
            const buffer = await page.screenshot({fullPage: full_page});
            
            // Save to desktop if requested
            if (save_to_desktop) {
                const desktopPath = path.join(os.homedir(), 'Desktop');
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const finalFilename = filename ? `${filename}.png` : `screenshot-${timestamp}.png`;
                const fullPath = path.join(desktopPath, finalFilename);
                
                fs.writeFileSync(fullPath, buffer);
                console.log(`Screenshot saved to: ${fullPath}`);
            }
            
            return image_content({buffer});
        } catch(e){
            throw new UserError(`Error taking screenshot: ${e}`);
        }
    },
};

let scraping_browser_get_html = {
    name: 'scraping_browser_get_html',
    description: 'Get the HTML content of the current page. Avoid using the '
    +'full_page option unless it is important to see things like script tags '
    +'since this can be large',
    parameters: z.object({
        full_page: z.boolean().optional().describe([
            'Whether to get the full page HTML including head and script tags',
            'Avoid this if you only need the extra HTML, since it can be '
            +'quite large',
        ].join('\n')),
    }),
    execute: async({full_page = false})=>{
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

let scraping_browser_activation_instructions = {
    name: 'scraping_browser_activation_instructions',
    description: 'Instructions for activating the scraping browser',
    parameters: z.object({}),
    execute: async()=>{
        return 'You need to run this MCP server with the BROWSER_AUTH '
        +'environment varialbe before the browser tools will become '
        +'available';
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

let scraping_browser_scroll_to = {
    name: 'scraping_browser_scroll_to',
    description: 'Scroll to a specific element on the page',
    parameters: z.object({
        selector: z.string().describe('CSS selector for the element to scroll to'),
    }),
    execute: async({selector})=>{
        const page = await (await require_browser()).get_page();
        try {
            await page.evaluate(sel=>{
                const element = document.querySelector(sel);
                if (element)
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                else 
                    throw new Error(`Element with selector "${sel}" not found`);
                
            }, selector);
            return `Successfully scrolled to element: ${selector}`;
        } catch(e){
            throw new UserError(`Error scrolling to element ${selector}: ${e}`);
        }
    },
};

let scraping_browser_screenshot_ocr = {
    name: 'scraping_browser_screenshot_ocr',
    description: 'Take a screenshot of the current page and extract text using OCR',
    parameters: z.object({
        full_page: z.boolean().optional().describe([
            'Whether to screenshot the full page (default: false)',
            'You should avoid fullscreen if it\'s not important, since the '
            +'images can be quite large',
        ].join('\n')),
        save_to_desktop: z.boolean().optional().describe([
            'Whether to save the screenshot to desktop (default: false)',
            'If true, saves the screenshot as a PNG file on your desktop',
        ].join('\n')),
        filename: z.string().optional().describe([
            'Custom filename for the saved screenshot (without extension)',
            'If not provided, uses timestamp-based filename',
        ].join('\n')),
        ocr_prompt: z.string().optional().describe([
            'Custom prompt for OCR extraction (default: extracts all visible text)',
            'Example: "Extract only the text from tables" or "Extract email addresses"',
        ].join('\n')),
    }),
    execute: async({full_page = false, save_to_desktop = false, filename, ocr_prompt})=>{
        const openai_api_key = process.env.OPENAI_API_KEY;
        if (!openai_api_key) {
            throw new UserError('OPENAI_API_KEY environment variable is required for OCR functionality');
        }

        const page = await (await require_browser()).get_page();
        try {
            // Take screenshot
            const buffer = await page.screenshot({fullPage: full_page});
            
            // Save to desktop if requested
            let savedPath = null;
            if (save_to_desktop) {
                const desktopPath = path.join(os.homedir(), 'Desktop');
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const finalFilename = filename ? `${filename}.png` : `screenshot-ocr-${timestamp}.png`;
                const fullPath = path.join(desktopPath, finalFilename);
                
                fs.writeFileSync(fullPath, buffer);
                savedPath = fullPath;
                console.log(`Screenshot saved to: ${fullPath}`);
            }

            // Convert buffer to base64 for OpenAI API
            const base64Image = buffer.toString('base64');
            
            // Prepare OCR prompt
            const defaultPrompt = 'Extract all visible text from this screenshot. Return the text in a clean, readable format, preserving the structure and layout as much as possible.';
            const finalPrompt = ocr_prompt || defaultPrompt;

            // Call OpenAI GPT-4o for OCR
            const ocrResponse = await axios({
                url: 'https://api.openai.com/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${openai_api_key}`,
                    'Content-Type': 'application/json',
                },
                data: {
                    model: 'gpt-4o',
                    messages: [
                        {
                            role: 'user',
                            content: [
                                {
                                    type: 'text',
                                    text: finalPrompt
                                },
                                {
                                    type: 'image_url',
                                    image_url: {
                                        url: `data:image/png;base64,${base64Image}`
                                    }
                                }
                            ]
                        }
                    ],
                    max_tokens: 4000
                }
            });

            const extractedText = ocrResponse.data.choices[0]?.message?.content || 'No text extracted';
            
            // Return simple string response with OCR text and optional save info
            let result = `OCR Extracted Text:\n\n${extractedText}`;
            if (savedPath) {
                result += `\n\n--- Screenshot saved to: ${savedPath} ---`;
            }
            
            return result;
        } catch(e){
            if (e.response?.status === 401) {
                throw new UserError('Invalid OpenAI API key. Please check your OPENAI_API_KEY environment variable.');
            } else if (e.response?.status === 429) {
                throw new UserError('OpenAI API rate limit exceeded. Please try again later.');
            } else if (e.response?.data?.error) {
                throw new UserError(`OpenAI API error: ${e.response.data.error.message}`);
            }
            throw new UserError(`Error taking screenshot and performing OCR: ${e.message}`);
        }
    },
};

export const tools = process.env.API_TOKEN ? [
    scraping_browser_navigate,
    scraping_browser_go_back,
    scraping_browser_go_forward,
    scraping_browser_links,
    scraping_browser_click,
    scraping_browser_type,
    scraping_browser_wait_for,
    scraping_browser_screenshot,
    scraping_browser_get_text,
    scraping_browser_get_html,
    scraping_browser_scroll,
    scraping_browser_scroll_to,
    scraping_browser_screenshot_ocr,
] : [scraping_browser_activation_instructions];
