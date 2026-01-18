#!/usr/bin/env node
'use strict'; /*jslint node:true es9:true*/
import {FastMCP} from 'fastmcp';
import {z} from 'zod';
import axios from 'axios';
import {tools as browser_tools} from './browser_tools.js';
import {GROUPS} from './tool_groups.js';
import {createRequire} from 'node:module';
import {remark} from 'remark';
import strip from 'strip-markdown';
const require = createRequire(import.meta.url);
const package_json = require('./package.json');
const api_token = process.env.API_TOKEN;
const unlocker_zone = process.env.WEB_UNLOCKER_ZONE || 'mcp_unlocker';
const browser_zone = process.env.BROWSER_ZONE || 'mcp_browser';
const pro_mode = process.env.PRO_MODE === 'true';
const polling_timeout = parseInt(process.env.POLLING_TIMEOUT || '600', 10);
const pro_mode_tools = ['search_engine', 'scrape_as_markdown',
    'search_engine_batch', 'scrape_batch'];
const tool_groups = process.env.GROUPS ?
    process.env.GROUPS.split(',').map(g=>g.trim().toLowerCase())
        .filter(Boolean) : [];
const custom_tools = process.env.TOOLS ?
    process.env.TOOLS.split(',').map(t=>t.trim()).filter(Boolean) : [];

function build_allowed_tools(groups = [], custom_tools = []){
    const allowed = new Set();
    for (const group_id of groups)
    {
        const group = Object.values(GROUPS)
            .find(g=>g.id===group_id);
        if (!group)
            continue;
        for (const tool of group.tools)
            allowed.add(tool);
    }
    for (const tool of custom_tools)
        allowed.add(tool);
    return allowed;
}

const allowed_tools = build_allowed_tools(tool_groups, custom_tools);
function parse_rate_limit(rate_limit_str) {
    if (!rate_limit_str) 
        return null;
    
    const match = rate_limit_str.match(/^(\d+)\/(\d+)([mhs])$/);
    if (!match) 
        throw new Error('Invalid RATE_LIMIT format. Use: 100/1h or 50/30m');
    
    const [, limit, time, unit] = match;
    const multiplier = unit==='h' ? 3600 : unit==='m' ? 60 : 1;
    
    return {
        limit: parseInt(limit),
        window: parseInt(time) * multiplier * 1000, 
        display: rate_limit_str
    };
}

const rate_limit_config = parse_rate_limit(process.env.RATE_LIMIT);

if (!api_token)
    throw new Error('Cannot run MCP server without API_TOKEN env');

const api_headers = (clientName=null, tool_name=null)=>({
    'user-agent': `${package_json.name}/${package_json.version}`,
    authorization: `Bearer ${api_token}`,
    ...clientName ? {'x-mcp-client-name': clientName} : {},
    ...tool_name ? {'x-mcp-tool': tool_name} : {},
});

function check_rate_limit(){
    if (!rate_limit_config) 
        return true;
    
    const now = Date.now();
    const window_start = now - rate_limit_config.window;
    
    debug_stats.call_timestamps = debug_stats.call_timestamps
        .filter(timestamp=>timestamp>window_start);
    
    if (debug_stats.call_timestamps.length>=rate_limit_config.limit)
        throw new Error(`Rate limit exceeded: ${rate_limit_config.display}`);
    
    debug_stats.call_timestamps.push(now);
    return true;
}

async function ensure_required_zones(){
    try {
        console.error('Checking for required zones...');
        let response = await axios({
            url: 'https://api.brightdata.com/zone/get_active_zones',
            method: 'GET',
            headers: api_headers(),
        });
        let zones = response.data || [];
        let has_unlocker_zone = zones.some(zone=>zone.name==unlocker_zone);
        let has_browser_zone = zones.some(zone=>zone.name==browser_zone);
        
        if (!has_unlocker_zone)
        {
            console.error(`Required zone "${unlocker_zone}" not found, `
                +`creating it...`);
            await axios({
                url: 'https://api.brightdata.com/zone',
                method: 'POST',
                headers: {
                    ...api_headers(),
                    'Content-Type': 'application/json',
                },
                data: {
                    zone: {name: unlocker_zone, type: 'unblocker'},
                    plan: {type: 'unblocker'},
                },
            });
            console.error(`Zone "${unlocker_zone}" created successfully`);
        }
        else
            console.error(`Required zone "${unlocker_zone}" already exists`);
            
        if (!has_browser_zone)
        {
            console.error(`Required zone "${browser_zone}" not found, `
                +`creating it...`);
            await axios({
                url: 'https://api.brightdata.com/zone',
                method: 'POST',
                headers: {
                    ...api_headers(),
                    'Content-Type': 'application/json',
                },
                data: {
                    zone: {name: browser_zone, type: 'browser_api'},
                    plan: {type: 'browser_api'},
                },
            });
            console.error(`Zone "${browser_zone}" created successfully`);
        }
        else
            console.error(`Required zone "${browser_zone}" already exists`);
    } catch(e){
        console.error('Error checking/creating zones:',
            e.response?.data||e.message);
    }
}

await ensure_required_zones();

let server = new FastMCP({
    name: 'Bright Data',
    version: package_json.version,
});
let debug_stats = {tool_calls: {}, session_calls: 0, call_timestamps: []};

const addTool = (tool) => {
    if (pro_mode)
    {
        server.addTool(tool);
        return;
    }

    if (allowed_tools.size>0)
    {
        if (allowed_tools.has(tool.name))
            server.addTool(tool);
        return;
    }

    if (pro_mode_tools.includes(tool.name))
        server.addTool(tool);
};

addTool({
    name: 'search_engine',
    description: 'Scrape search results from Google, Bing or Yandex. Returns '
        +'SERP results in JSON or Markdown (URL, title, description), Ideal for'
        +'gathering current information, news, and detailed search results.',
    annotations: {
        title: 'Search Engine',
        readOnlyHint: true,
        openWorldHint: true,
    },
    parameters: z.object({
        query: z.string(),
        engine: z.enum(['google', 'bing', 'yandex'])
            .optional()
            .default('google'),
        cursor: z.string()
            .optional()
            .describe('Pagination cursor for next page'),
    }),
    execute: tool_fn('search_engine', async({query, engine, cursor}, ctx)=>{
        const is_google = engine=='google';
        const url = search_url(engine, query, cursor);
        let response = await axios({
            url: 'https://api.brightdata.com/request',
            method: 'POST',
            data: {
                url: url,
                zone: unlocker_zone,
                format: 'raw',
                data_format: is_google ? 'parsed_light' : 'markdown',
            },
            headers: api_headers(ctx.clientName, 'search_engine'),
            responseType: 'text',
        });
        if (!is_google)
            return response.data;
        try {
            const search_data = JSON.parse(response.data);
            return JSON.stringify(
                clean_google_search_payload(search_data), null, 2);
        } catch(e){
            return JSON.stringify({
                organic: []
            }, null, 2);
        }
    }),
});

addTool({
    name: 'scrape_as_markdown',
    description: 'Scrape a single webpage URL with advanced options for '
    +'content extraction and get back the results in MarkDown language. '
    +'This tool can unlock any webpage even if it uses bot detection or '
    +'CAPTCHA.',
    annotations: {
        title: 'Scrape as Markdown',
        readOnlyHint: true,
        openWorldHint: true,
    },
    parameters: z.object({url: z.string().url()}),
    execute: tool_fn('scrape_as_markdown', async({url}, ctx)=>{
        let response = await axios({
            url: 'https://api.brightdata.com/request',
            method: 'POST',
            data: {
                url,
                zone: unlocker_zone,
                format: 'raw',
                data_format: 'markdown',
            },
            headers: api_headers(ctx.clientName, 'scrape_as_markdown'),
            responseType: 'text',
        });
        const minified_data = await remark()
            .use(strip, {keep: ['link', 'linkReference', 'code',
                'inlineCode']})
            .process(response.data);
        return minified_data.value;
    }),
});

addTool({
    name: 'search_engine_batch',
    description: 'Run multiple search queries simultaneously. Returns '
    +'JSON for Google, Markdown for Bing/Yandex.',
    annotations: {
        title: 'Search Engine Batch',
        readOnlyHint: true,
        openWorldHint: true,
    },
    parameters: z.object({
        queries: z.array(z.object({
            query: z.string(),
            engine: z.enum(['google', 'bing', 'yandex'])
                .optional()
                .default('google'),
            cursor: z.string()
                .optional(),
        })).min(1).max(5),
    }),
    execute: tool_fn('search_engine_batch', async ({queries}, ctx)=>{
        const search_promises = queries.map(({query, engine, cursor})=>{
            const is_google = (engine || 'google') === 'google';
            const url = search_url(engine || 'google', query, cursor);

            return axios({
                url: 'https://api.brightdata.com/request',
                method: 'POST',
                data: {
                    url,
                    zone: unlocker_zone,
                    format: 'raw',
                    data_format: is_google ? 'parsed_light' : 'markdown',
                },
                headers: api_headers(ctx.clientName, 'search_engine_batch'),
                responseType: 'text',
            }).then(response=>{
                if (is_google)
                {
                    try {
                        const search_data = JSON.parse(response.data);
                        return {
                            query,
                            engine: engine || 'google',
                            result: clean_google_search_payload(search_data),
                        };
                    } catch(e){
                        return {
                            query,
                            engine: engine || 'google',
                            result: clean_google_search_payload(null),
                        };
                    }
                }
                return {
                    query,
                    engine: engine || 'google',
                    result: response.data
                };
            });
        });

        const results = await Promise.allSettled(search_promises);
        return JSON.stringify(results, null, 2);
    }),
});

addTool({
   name: 'scrape_batch',
   description: 'Scrape multiple webpages URLs with advanced options for '
        +'content extraction and get back the results in MarkDown language. '
        +'This tool can unlock any webpage even if it uses bot detection or '
        +'CAPTCHA.',
   annotations: {
       title: 'Scrape Batch',
       readOnlyHint: true,
       openWorldHint: true,
   },
   parameters: z.object({
       urls: z.array(z.string().url()).min(1).max(5).describe('Array of URLs to scrape (max 5)')
   }),
   execute: tool_fn('scrape_batch', async ({urls}, ctx)=>{
       const scrapePromises = urls.map(url =>
           axios({
               url: 'https://api.brightdata.com/request',
               method: 'POST',
               data: {
                   url,
                   zone: unlocker_zone,
                   format: 'raw',
                   data_format: 'markdown',
               },
               headers: api_headers(ctx.clientName, 'scrape_batch'),
               responseType: 'text',
           }).then(response => ({
               url,
               content: response.data
           }))
       );

       const results = await Promise.allSettled(scrapePromises);
       return JSON.stringify(results, null, 2);
   }),
});

addTool({
    name: 'scrape_as_html',
    description: 'Scrape a single webpage URL with advanced options for '
    +'content extraction and get back the results in HTML. '
    +'This tool can unlock any webpage even if it uses bot detection or '
    +'CAPTCHA.',
    annotations: {
        title: 'Scrape as HTML',
        readOnlyHint: true,
        openWorldHint: true,
    },
    parameters: z.object({url: z.string().url()}),
    execute: tool_fn('scrape_as_html', async({url}, ctx)=>{
        let response = await axios({
            url: 'https://api.brightdata.com/request',
            method: 'POST',
            data: {
                url,
                zone: unlocker_zone,
                format: 'raw',
            },
            headers: api_headers(ctx.clientName, 'scrape_as_html'),
            responseType: 'text',
        });
        return response.data;
    }),
});

addTool({
    name: 'extract',
    description: 'Scrape a webpage and extract structured data as JSON. '
        + 'First scrapes the page as markdown, then uses AI sampling to convert '
        + 'it to structured JSON format. This tool can unlock any webpage even '
        + 'if it uses bot detection or CAPTCHA.',
    annotations: {
        title: 'Extract Structured Data',
        readOnlyHint: true,
        openWorldHint: true,
    },
    parameters: z.object({
        url: z.string().url(),
        extraction_prompt: z.string().optional().describe(
            'Custom prompt to guide the extraction process. If not provided, '
            + 'will extract general structured data from the page.'
        ),
    }),
    execute: tool_fn('extract', async ({ url, extraction_prompt }, ctx) => {
        let scrape_response = await axios({
            url: 'https://api.brightdata.com/request',
            method: 'POST',
            data: {
                url,
                zone: unlocker_zone,
                format: 'raw',
                data_format: 'markdown',
            },
            headers: api_headers(ctx.clientName, 'extract'),
            responseType: 'text',
        });

        let markdown_content = scrape_response.data;

        let system_prompt = 'You are a data extraction specialist. You MUST respond with ONLY valid JSON, no other text or formatting. '
            + 'Extract the requested information from the markdown content and return it as a properly formatted JSON object. '
            + 'Do not include any explanations, markdown formatting, or text outside the JSON response.';

        let user_prompt = extraction_prompt ||
            'Extract the requested information from this markdown content and return ONLY a JSON object:';

        let session = server.sessions[0]; // Get the first active session
        if (!session) throw new Error('No active session available for sampling');

        let sampling_response = await session.requestSampling({
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: `${user_prompt}\n\nMarkdown content:\n${markdown_content}\n\nRemember: Respond with ONLY valid JSON, no other text.`,
                    },
                },
            ],
            systemPrompt: system_prompt,
            includeContext: "thisServer",
        });

        return sampling_response.content.text;
    }),
});

addTool({
    name: 'session_stats',
    description: 'Tell the user about the tool usage during this session',
    annotations: {
        title: 'Session Stats',
        readOnlyHint: true,
    },
    parameters: z.object({}),
    execute: tool_fn('session_stats', async()=>{
        let used_tools = Object.entries(debug_stats.tool_calls);
        let lines = ['Tool calls this session:'];
        for (let [name, calls] of used_tools)
            lines.push(`- ${name} tool: called ${calls} times`);
        return lines.join('\n');
    }),
});

const datasets = [{
    id: 'amazon_product',
    dataset_id: 'gd_l7q7dkf244hwjntr0',
    description: [
        'Quickly read structured amazon product data.',
        'Requires a valid product URL with /dp/ in it.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
}, {
    id: 'amazon_product_reviews',
    dataset_id: 'gd_le8e811kzy4ggddlq',
    description: [
        'Quickly read structured amazon product review data.',
        'Requires a valid product URL with /dp/ in it.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
}, {
    id: 'amazon_product_search',
    dataset_id: 'gd_lwdb4vjm1ehb499uxs',
    description: [
        'Quickly read structured amazon product search data.',
        'Requires a valid search keyword and amazon domain URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['keyword', 'url'],
    fixed_values: {pages_to_search: '1'}, 
}, {
    id: 'walmart_product',
    dataset_id: 'gd_l95fol7l1ru6rlo116',
    description: [
        'Quickly read structured walmart product data.',
        'Requires a valid product URL with /ip/ in it.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
}, {
    id: 'walmart_seller',
    dataset_id: 'gd_m7ke48w81ocyu4hhz0',
    description: [
        'Quickly read structured walmart seller data.',
        'Requires a valid walmart seller URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
}, {
    id: 'ebay_product',
    dataset_id: 'gd_ltr9mjt81n0zzdk1fb',
    description: [
        'Quickly read structured ebay product data.',
        'Requires a valid ebay product URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
}, {
    id: 'homedepot_products',
    dataset_id: 'gd_lmusivh019i7g97q2n',
    description: [
        'Quickly read structured homedepot product data.',
        'Requires a valid homedepot product URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
}, {
    id: 'zara_products',
    dataset_id: 'gd_lct4vafw1tgx27d4o0',
    description: [
        'Quickly read structured zara product data.',
        'Requires a valid zara product URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
}, {
    id: 'etsy_products',
    dataset_id: 'gd_ltppk0jdv1jqz25mz',
    description: [
        'Quickly read structured etsy product data.',
        'Requires a valid etsy product URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
}, {
    id: 'bestbuy_products',
    dataset_id: 'gd_ltre1jqe1jfr7cccf',
    description: [
        'Quickly read structured bestbuy product data.',
        'Requires a valid bestbuy product URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
}, {
    id: 'linkedin_person_profile',
    dataset_id: 'gd_l1viktl72bvl7bjuj0',
    description: [
        'Quickly read structured linkedin people profile data.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
}, {
    id: 'linkedin_company_profile',
    dataset_id: 'gd_l1vikfnt1wgvvqz95w',
    description: [
        'Quickly read structured linkedin company profile data',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
}, {
    id: 'linkedin_job_listings',
    dataset_id: 'gd_lpfll7v5hcqtkxl6l',
    description: [
        'Quickly read structured linkedin job listings data',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
}, {
    id: 'linkedin_posts',
    dataset_id: 'gd_lyy3tktm25m4avu764',
    description: [
        'Quickly read structured linkedin posts data',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
}, {
    id: 'linkedin_people_search',
    dataset_id: 'gd_m8d03he47z8nwb5xc',
    description: [
        'Quickly read structured linkedin people search data',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url', 'first_name', 'last_name'],
}, {
    id: 'crunchbase_company',
    dataset_id: 'gd_l1vijqt9jfj7olije',
    description: [
        'Quickly read structured crunchbase company data',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
},
{
    id: 'zoominfo_company_profile',
    dataset_id: 'gd_m0ci4a4ivx3j5l6nx',
    description: [
        'Quickly read structured ZoomInfo company profile data.',
        'Requires a valid ZoomInfo company URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
},
{
    id: 'instagram_profiles',
    dataset_id: 'gd_l1vikfch901nx3by4',
    description: [
        'Quickly read structured Instagram profile data.',
        'Requires a valid Instagram URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
},
{
    id: 'instagram_posts',
    dataset_id: 'gd_lk5ns7kz21pck8jpis',
    description: [
        'Quickly read structured Instagram post data.',
        'Requires a valid Instagram URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
},
{
    id: 'instagram_reels',
    dataset_id: 'gd_lyclm20il4r5helnj',
    description: [
        'Quickly read structured Instagram reel data.',
        'Requires a valid Instagram URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
},
{
    id: 'instagram_comments',
    dataset_id: 'gd_ltppn085pokosxh13',
    description: [
        'Quickly read structured Instagram comments data.',
        'Requires a valid Instagram URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
},
{
    id: 'facebook_posts',
    dataset_id: 'gd_lyclm1571iy3mv57zw',
    description: [
        'Quickly read structured Facebook post data.',
        'Requires a valid Facebook post URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
},
{
    id: 'facebook_marketplace_listings',
    dataset_id: 'gd_lvt9iwuh6fbcwmx1a',
    description: [
        'Quickly read structured Facebook marketplace listing data.',
        'Requires a valid Facebook marketplace listing URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
},
{
    id: 'facebook_company_reviews',
    dataset_id: 'gd_m0dtqpiu1mbcyc2g86',
    description: [
        'Quickly read structured Facebook company reviews data.',
        'Requires a valid Facebook company URL and number of reviews.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url', 'num_of_reviews'],
}, {
    id: 'facebook_events',
    dataset_id: 'gd_m14sd0to1jz48ppm51',
    description: [
        'Quickly read structured Facebook events data.',
        'Requires a valid Facebook event URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
}, {
    id: 'tiktok_profiles',
    dataset_id: 'gd_l1villgoiiidt09ci',
    description: [
        'Quickly read structured Tiktok profiles data.',
        'Requires a valid Tiktok profile URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
}, {
    id: 'tiktok_posts',
    dataset_id: 'gd_lu702nij2f790tmv9h',
    description: [
        'Quickly read structured Tiktok post data.',
        'Requires a valid Tiktok post URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
}, {
    id: 'tiktok_shop',
    dataset_id: 'gd_m45m1u911dsa4274pi',
    description: [
        'Quickly read structured Tiktok shop data.',
        'Requires a valid Tiktok shop product URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
}, {
    id: 'tiktok_comments',
    dataset_id: 'gd_lkf2st302ap89utw5k',
    description: [
        'Quickly read structured Tiktok comments data.',
        'Requires a valid Tiktok video URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
}, {
    id: 'google_maps_reviews',
    dataset_id: 'gd_luzfs1dn2oa0teb81',
    description: [
        'Quickly read structured Google maps reviews data.',
        'Requires a valid Google maps URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url', 'days_limit'],
    defaults: {days_limit: '3'},
}, {
    id: 'google_shopping',
    dataset_id: 'gd_ltppk50q18kdw67omz',
    description: [
        'Quickly read structured Google shopping data.',
        'Requires a valid Google shopping product URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
}, {
    id: 'google_play_store',
    dataset_id: 'gd_lsk382l8xei8vzm4u',
    description: [
        'Quickly read structured Google play store data.',
        'Requires a valid Google play store app URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
}, {
    id: 'apple_app_store',
    dataset_id: 'gd_lsk9ki3u2iishmwrui',
    description: [
        'Quickly read structured apple app store data.',
        'Requires a valid apple app store app URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
}, {
    id: 'reuter_news',
    dataset_id: 'gd_lyptx9h74wtlvpnfu',
    description: [
        'Quickly read structured reuter news data.',
        'Requires a valid reuter news report URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
}, {
    id: 'github_repository_file',
    dataset_id: 'gd_lyrexgxc24b3d4imjt',
    description: [
        'Quickly read structured github repository data.',
        'Requires a valid github repository file URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
}, {
    id: 'yahoo_finance_business',
    dataset_id: 'gd_lmrpz3vxmz972ghd7',
    description: [
        'Quickly read structured yahoo finance business data.',
        'Requires a valid yahoo finance business URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
},
{
    id: 'x_posts',
    dataset_id: 'gd_lwxkxvnf1cynvib9co',
    description: [
        'Quickly read structured X post data.',
        'Requires a valid X post URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
},
{
    id: 'zillow_properties_listing',
    dataset_id: 'gd_lfqkr8wm13ixtbd8f5',
    description: [
        'Quickly read structured zillow properties listing data.',
        'Requires a valid zillow properties listing URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
},
{
    id: 'booking_hotel_listings',
    dataset_id: 'gd_m5mbdl081229ln6t4a',
    description: [
        'Quickly read structured booking hotel listings data.',
        'Requires a valid booking hotel listing URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
}, {
    id: 'youtube_profiles',
    dataset_id: 'gd_lk538t2k2p1k3oos71',
    description: [
        'Quickly read structured youtube profiles data.',
        'Requires a valid youtube profile URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
}, {
    id: 'youtube_comments',
    dataset_id: 'gd_lk9q0ew71spt1mxywf',
    description: [
        'Quickly read structured youtube comments data.',
        'Requires a valid youtube video URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url', 'num_of_comments'],
    defaults: {num_of_comments: '10'},
}, {
    id: 'reddit_posts',
    dataset_id: 'gd_lvz8ah06191smkebj4',
    description: [
        'Quickly read structured reddit posts data.',
        'Requires a valid reddit post URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
},
{
    id: 'youtube_videos',
    dataset_id: 'gd_lk56epmy2i5g7lzu0k',
    description: [
        'Quickly read structured YouTube videos data.',
        'Requires a valid YouTube video URL.',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url'],
}];
const dataset_id_to_title = id=>{
    return id.split('_')
        .map(word=>word.charAt(0).toUpperCase()+word.slice(1))
        .join(' ');
};

for (let {dataset_id, id, description, inputs, defaults = {}, fixed_values = {}} of datasets)
{
    const tool_name = `web_data_${id}`;
    let parameters = {};
    for (let input of inputs)
    {
        let param_schema = input=='url' ? z.string().url() : z.string();
        parameters[input] = defaults[input] !== undefined ?
            param_schema.default(defaults[input]) : param_schema;
    }
    addTool({
        name: tool_name,
        description,
        annotations: {
            title: dataset_id_to_title(id),
            readOnlyHint: true,
            openWorldHint: true,
        },
        parameters: z.object(parameters),
        execute: tool_fn(tool_name, async(data, ctx)=>{
            data = {...data, ...fixed_values};
            let trigger_response = await axios({
                url: 'https://api.brightdata.com/datasets/v3/trigger',
                params: {dataset_id, include_errors: true},
                method: 'POST',
                data: [data],
                headers: api_headers(ctx.clientName, tool_name),
            });
            if (!trigger_response.data?.snapshot_id)
                throw new Error('No snapshot ID returned from request');
            let snapshot_id = trigger_response.data.snapshot_id;
            console.error(`[${tool_name}] triggered collection with `
                +`snapshot ID: ${snapshot_id}`);
            let max_attempts = polling_timeout;
            let attempts = 0;
            while (attempts < max_attempts)
            {
                try {
                    if (ctx && ctx.reportProgress)
                    {
                        await ctx.reportProgress({
                            progress: attempts,
                            total: max_attempts,
                            message: `Polling for data (attempt `
                                +`${attempts + 1}/${max_attempts})`,
                        });
                    }
                    let snapshot_response = await axios({
                        url: `https://api.brightdata.com/datasets/v3`
                            +`/snapshot/${snapshot_id}`,
                        params: {format: 'json'},
                        method: 'GET',
                        headers: api_headers(ctx.clientName, tool_name),
                    });
                    if (['running', 'building', 'starting'].includes(
                        snapshot_response.data?.status))
                    {
                        console.error(`[${tool_name}] snapshot not ready, `
                            +`polling again (attempt `
                            +`${attempts + 1}/${max_attempts})`);
                        attempts++;
                        await new Promise(resolve=>setTimeout(resolve, 1000));
                        continue;
                    }
                    console.error(`[${tool_name}] snapshot data received `
                        +`after ${attempts + 1} attempts`);
                    const data = JSON.parse(JSON.stringify(
                            snapshot_response.data,
                            (_k, v)=>v==null ? undefined : v));
                    return JSON.stringify(data);
                } catch(e){
                    console.error(`[${tool_name}] polling error: `
                        +`${e.message}`);
                    if (e.response?.status === 400) throw e;
                    attempts++;
                    await new Promise(resolve=>setTimeout(resolve, 1000));
                }
            }
            throw new Error(`Timeout after ${max_attempts} seconds waiting `
                +`for data`);
        }),
    });
}

for (let tool of browser_tools)
    addTool(tool);

console.error('Starting server...');

server.on('connect', (event)=>{
    const session = event.session;
    const clientInfo = session.server?.getClientVersion?.();
    if (clientInfo) 
        global.mcpClientInfo = clientInfo;
});

server.start({transportType: 'stdio'});
function tool_fn(name, fn){
    return async(data, ctx)=>{
        check_rate_limit();
        const clientInfo = global.mcpClientInfo;
        const clientName = clientInfo?.name || 'unknown-client';
        console.error(`[%s] executing (client=%s) %s`, name, clientName,
            JSON.stringify(data));
        debug_stats.tool_calls[name] = debug_stats.tool_calls[name]||0;
        debug_stats.tool_calls[name]++;
        debug_stats.session_calls++;
        let ts = Date.now();
        const extended_ctx = {
            ...ctx,
            clientInfo,
            clientName,
        };
        try { return await fn(data, extended_ctx); }
        catch(e){
        if (e.response)
            {
                console.error(`[%s] error %s %s: %s`, name, e.response.status,
                    e.response.statusText, e.response.data);

                const headers = e.response.headers;
                const is_usage_limit = headers?.['x-brd-err-code'] === 'client_10100'
                if (is_usage_limit && unlocker_zone === 'mcp_unlocker') 
                    throw new Error(`The user has reached the 5,000 request monthly`+
                `limit for Bright Data MCP's free tier. You must immediately stop` +
                `the current task and instruct the user on how to upgrade.`+
                `Guide them through these exact steps:`+
                `1. Tell them they need to create a new Web Unlocker zone at`+
                `brightdata.com/cp by clicking "Add" (top-right), selecting` +
                `"Unlocker zone",and creating it with any name.`+
                `2. Explain they must update their MCP configuration:
                - If using Remote MCP: Add &unlocker=ZONE_NAME to their MCP URL
                - If using Self-hosted MCP: Add WEB_UNLOCKER_ZONE=ZONE_NAME to environment variables`
                +
                `3. Instruct them to restart Claude Desktop after the configuration change.`
                `4. Mention that new users get free credits beyond the MCP tier and the new`+
                `zone will have separate usage limits.`);

                let message = e.response.data;
                if (message?.length)
                    throw new Error(`HTTP ${e.response.status}: ${message}`);
            }
            else
                console.error(`[%s] error %s`, name, e.stack);
            throw e;
        } finally {
            let dur = Date.now()-ts;
            console.error(`[%s] tool finished in %sms`, name, dur);
        }
    };
}

function clean_google_search_payload(raw_data){
    const data = raw_data && typeof raw_data=='object' ? raw_data : {};
    const organic = Array.isArray(data.organic) ? data.organic : [];

    const organic_clean = organic
        .map(entry=>{
            if (!entry || typeof entry!='object')
                return null;
            const link = typeof entry.link=='string' ? entry.link.trim() : '';
            const title = typeof entry.title=='string'
                ? entry.title.trim() : '';
            const description = typeof entry.description=='string'
                ? entry.description.trim() : '';
            if (!link || !title)
                return null;
            return {link, title, description};
        })
        .filter(Boolean);

    return {organic: organic_clean};
}

function search_url(engine, query, cursor){
    let q = encodeURIComponent(query);
    let page = cursor ? parseInt(cursor) : 0;
    let start = page * 10;
    if (engine=='yandex')
        return `https://yandex.com/search/?text=${q}&p=${page}`;
    if (engine=='bing')
        return `https://www.bing.com/search?q=${q}&first=${start + 1}`;
    return `https://www.google.com/search?q=${q}&start=${start}`;
}
