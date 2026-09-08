#!/usr/bin/env node
'use strict'; /*jslint node:true es9:true*/
import {FastMCP} from 'fastmcp';
import {z} from 'zod';
import axios from 'axios';
import {tools as browser_tools} from './browser_tools.js';
import prompts from './prompts.js';
import {GROUPS} from './tool_groups.js';
import {parse_google_search_response} from './search_utils.js';
import {dataset_id_schema, filter_schema, metadata_to_fields, FILTER_OPERATORS}
    from './search_dataset_schema.js';
import {createRequire} from 'node:module';
import {remark} from 'remark';
import strip from 'strip-markdown';
const require = createRequire(import.meta.url);
const package_json = require('./package.json');
const api_token = process.env.API_TOKEN;
const unlocker_zone = process.env.WEB_UNLOCKER_ZONE || 'mcp_unlocker';
const browser_zone = process.env.BROWSER_ZONE || 'mcp_browser';
const pro_mode = process.env.PRO_MODE === 'true';
// Reads a whole positive integer or falls back, and is strict on purpose.
// parseInt takes the leading digits of anything, so "45s" is not the NaN it
// looks like, it is 45, and a 45ms wait budget expires before the first poll
// can answer: the collection is triggered and billed and the caller is told
// it is still running without a single poll ever having been made. "0" and
// "-1" end the same way, with a deadline already in the past. A value that is
// not simply a number has to fall back to the default, never silently
// disable the wait.
const positive_int_env = (raw, fallback)=>{
    if (!/^\s*\d+\s*$/.test(raw||''))
        return fallback;
    let parsed = parseInt(raw, 10);
    return parsed>0 ? parsed : fallback;
};
const polling_timeout = positive_int_env(process.env.POLLING_TIMEOUT, 600);
// How long the server blocks waiting for a dataset collection before it
// hands the caller a snapshot ID instead of the records. This is a server
// setting and not a tool parameter on purpose: the same input can take 3x to
// 8x longer from one run to the next, so a caller cannot pick a sensible
// number, and a big one only walks back into the client timeout. The
// portable MCP client tool call budget is 60s (the TypeScript SDK's
// DEFAULT_REQUEST_TIMEOUT_MSEC, matched by Cursor and Continue) and progress
// notifications do not reset it, so the server has to be the one to stop
// waiting. 45s is what Buildkite chose for the same reason: it leaves
// headroom inside a 60s client budget.
const dataset_wait_budget_ms = positive_int_env(
    process.env.DATASET_WAIT_BUDGET_MS, 45000);
const base_timeout = process.env.BASE_TIMEOUT
    ? parseInt(process.env.BASE_TIMEOUT, 10) * 1000 : 0;
const base_max_retries = Math.min(
    parseInt(process.env.BASE_MAX_RETRIES || '0', 10), 3);
const pro_mode_tools = ['search_engine', 'scrape_as_markdown',
    'search_engine_batch', 'scrape_batch', 'discover'];
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

async function base_request(config){
    let last_err;
    for (let attempt = 0; attempt <= base_max_retries; attempt++)
    {
        try {
            return await axios({...config, timeout: base_timeout});
        } catch(e){
            last_err = e;
            if (e.response?.status && e.response.status >= 400
                && e.response.status < 500)
            {
                throw e;
            }
        }
    }
    throw last_err;
}

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
                    plan: {type: 'unblocker', ub_premium: true},
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
        +'SERP results in JSON or Markdown (URL, title, description),Ideal for'
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
        geo_location: z.string()
            .length(2)
            .optional()
            .describe('2-letter country code for geo-targeted results '
                +'(e.g., "us", "uk")'),
    }),
    execute: tool_fn('search_engine', async({query, engine, cursor,
        geo_location}, ctx)=>
    {
        const is_google = engine=='google';
        const url = search_url(engine, query, cursor, geo_location);
        let response = await base_request({
            url: 'https://api.brightdata.com/request',
            method: 'POST',
            data: {
                url: is_google ? `${url}&brd_json=1` : url,
                zone: unlocker_zone,
                format: 'raw',
                data_format: is_google ? 'parsed_light' : 'markdown',
            },
            headers: api_headers(ctx.clientName, 'search_engine'),
            responseType: 'text',
        });
        if (!is_google)
            return response.data;
        return JSON.stringify(parse_google_search_response(response.data,
            'search_engine'), null, 2);
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
        let response = await base_request({
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
            geo_location: z.string()
                .length(2)
                .optional()
                .describe('2-letter country code for geo-targeted results '
                    +'(e.g., "us", "uk")'),
        })).min(1).max(5),
    }),
    execute: tool_fn('search_engine_batch', async({queries}, ctx)=>{
        const search_promises = queries.map(({query, engine, cursor,
            geo_location})=>{
            const normalized_engine = engine || 'google';
            const is_google = normalized_engine === 'google';
            const url = search_url(normalized_engine, query, cursor,
                geo_location);
            return (async()=>{
                try {
                    const response = await base_request({
                        url: 'https://api.brightdata.com/request',
                        method: 'POST',
                        data: {
                            url: is_google ? `${url}&brd_json=1` : url,
                            zone: unlocker_zone,
                            format: 'raw',
                            data_format: is_google ? 'parsed_light'
                                : 'markdown',
                        },
                        headers: api_headers(ctx.clientName,
                            'search_engine_batch'),
                        responseType: 'text',
                    });
                    if (is_google)
                    {
                        return {
                            query,
                            engine: normalized_engine,
                            result: parse_google_search_response(response.data,
                                'search_engine_batch'),
                        };
                    }
                    return {
                        query,
                        engine: normalized_engine,
                        result: response.data,
                    };
                } catch(e){
                    return {
                        query,
                        engine: normalized_engine,
                        error: e instanceof Error ? e.message : String(e),
                    };
                }
            })();
        });

        const results = await Promise.all(search_promises);
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
           base_request({
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
           }).then(async response=>({
               url,
               content: (await remark()
                   .use(strip, {keep: ['link', 'linkReference', 'code',
                       'inlineCode']})
                   .process(response.data)).value,
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
    name: 'discover',
    description: 'Search the web and rank results by AI-driven relevance. '
        +'Returns scored results with title, description, and URL. Supports '
        +'intent-based ranking, geo-targeting, date filtering, and keyword '
        +'filtering.',
    annotations: {
        title: 'Discover',
        readOnlyHint: true,
        openWorldHint: true,
    },
    parameters: z.object({
        query: z.string().describe('The search query'),
        intent: z.string().optional().describe('Describes the specific goal '
            +'of the search to help the AI evaluate and rank result relevance.'
            +'If not provided, the query string is used as the intent'),
        country: z.string().length(2).optional()
            .describe('2-letter ISO country code for localized results '
                +'(e.g., "US", "GB", "DE")'),
        city: z.string().optional()
            .describe('City for localized results (e.g., "New York", '
                +'"Berlin")'),
        language: z.string().optional()
            .describe('Language code (e.g., "en", "es", "fr")'),
        num_results: z.number().int().optional()
            .describe('Exact number of search results to return'),
        filter_keywords: z.array(z.string()).optional()
            .describe('Keywords that must appear in search results'),
        remove_duplicates: z.boolean().optional()
            .describe('Remove duplicate results (default: true)'),
        start_date: z.string().optional()
            .describe('Only content updated from this date (YYYY-MM-DD)'),
        end_date: z.string().optional()
            .describe('Only content updated until this date (YYYY-MM-DD)'),
    }),
    execute: tool_fn('discover', async(data, ctx)=>{
        let body = {query: data.query, format: 'json'};
        if (data.intent)
            body.intent = data.intent;
        if (data.country)
            body.country = data.country;
        if (data.city)
            body.city = data.city;
        if (data.language)
            body.language = data.language;
        if (data.num_results)
            body.num_results = data.num_results;
        if (data.filter_keywords)
            body.filter_keywords = data.filter_keywords;
        if (data.remove_duplicates===false)
            body.remove_duplicates = false;
        if (data.start_date)
            body.start_date = data.start_date;
        if (data.end_date)
            body.end_date = data.end_date;
        let trigger_response = await axios({
            url: 'https://api.brightdata.com/discover',
            method: 'POST',
            data: body,
            headers: {
                ...api_headers(ctx.clientName, 'discover'),
                'Content-Type': 'application/json',
            },
        });
        let task_id = trigger_response.data?.task_id;
        if (!task_id)
            throw new Error('No task_id returned from discover request');
        console.error(`[discover] triggered with task ID: ${task_id}`);
        let max_attempts = polling_timeout;
        let attempts = 0;
        let started_at = Date.now();
        while (attempts<max_attempts)
        {
            try {
                if (ctx && ctx.reportProgress)
                {
                    await ctx.reportProgress({
                        progress: attempts,
                        total: max_attempts,
                        message: `Polling for discover results (attempt `
                            +`${attempts+1}/${max_attempts})`,
                    });
                }
                let poll_response = await axios({
                    url: 'https://api.brightdata.com/discover',
                    params: {task_id},
                    method: 'GET',
                    headers: api_headers(ctx.clientName, 'discover'),
                });
                if (poll_response.data?.status==='processing')
                {
                    console.error(`[discover] still processing, polling `
                        +`again (attempt ${attempts+1}/${max_attempts})`);
                    attempts++;
                    await new Promise(resolve=>setTimeout(resolve, 1000));
                    continue;
                }
                console.error(`[discover] results received after `
                    +`${attempts+1} attempts`);
                let results = poll_response.data?.results || [];
                results = results.map(r=>({
                    link: r.link,
                    title: r.title,
                    description: r.description,
                    relevance_score: r.relevance_score,
                }));
                return JSON.stringify(results);
            } catch(e){
                console.error(`[discover] polling error: ${e.message}`);
                if (e.response?.status===400)
                    throw e;
                attempts++;
                await new Promise(resolve=>setTimeout(resolve, 1000));
            }
        }
        // max_attempts counts polls of about a second plus latency each, so
        // it is not the elapsed time; report what actually elapsed.
        throw new Error(`Timeout after `
            +`${Math.round((Date.now()-started_at)/1000)} seconds waiting `
            +`for discover results`);
    }),
});

const SEARCHABLE_DATASETS_DESC = [
    'Supported dataset_id values:',
    '- gd_l1viktl72bvl7bjuj0: LinkedIn people profiles',
    '- gd_me5ppxjr2ge6icjuh0: LinkedIn people profiles (contact-enriched)',
    '- gd_l1vikfnt1wgvvqz95w: LinkedIn company information',
].join('\n');

addTool({
    name: 'list_dataset_fields',
    description: 'List the filterable fields of a searchable dataset '
        +'(field name, type, and description). Call this before '
        +'search_dataset to learn which field names and types you can '
        +'filter on.\n'+SEARCHABLE_DATASETS_DESC,
    annotations: {
        title: 'List Dataset Fields',
        readOnlyHint: true,
        openWorldHint: true,
    },
    parameters: z.object({dataset_id: dataset_id_schema}),
    execute: tool_fn('list_dataset_fields', async({dataset_id}, ctx)=>{
        let response = await base_request({
            url: `https://api.brightdata.com/datasets/${dataset_id}`
                +`/metadata`,
            method: 'GET',
            headers: api_headers(ctx.clientName, 'list_dataset_fields'),
        });
        return JSON.stringify(metadata_to_fields(response.data));
    }),
});

addTool({
    name: 'search_dataset',
    description: 'Search a Bright Data dataset by a filter and get matching '
        +'records back directly (fast Elasticsearch-backed search; no '
        +'snapshot). Use this to FIND MANY records by criteria, as opposed '
        +'to the web_data_* tools which fetch ONE record by URL.\n'
        +'First call list_dataset_fields to get valid field names.\n'
        +'A filter is a tree: a group {operator:"and"|"or", filters:[...]} '
        +'or a leaf {name, value, operator}. Max nesting depth 3.\n'
        +'Leaf operators: '+FILTER_OPERATORS.join(', ')+'.\n'
        +SEARCHABLE_DATASETS_DESC,
    annotations: {
        title: 'Search Dataset',
        readOnlyHint: true,
        openWorldHint: true,
    },
    parameters: z.object({
        dataset_id: dataset_id_schema,
        filter: filter_schema.describe('Filter tree describing which '
            +'records to match. Required, cannot be empty.'),
        size: z.number().int().positive().max(10).optional().default(10)
            .describe('Number of records to return (max 10, default 10)'),
        sort: z.union([
            z.enum(['default', 'random']),
            z.array(z.record(z.enum(['asc', 'desc']))),
        ]).optional().describe('Sorting: "default", "random", or a custom '
            +'array like [{"timestamp":"asc"}]. Use "default" or custom '
            +'sort to paginate with search_after.'),
        search_after: z.array(z.any()).optional().describe('Pagination '
            +'cursor from a previous response\'s search_after value.'),
    }),
    execute: tool_fn('search_dataset', async({dataset_id, filter, size, sort,
        search_after}, ctx)=>
    {
        let body = {mode: 'sync', filter, size};
        if (sort!==undefined)
            body.sort = sort;
        if (search_after!==undefined)
            body.search_after = search_after;
        let response = await base_request({
            url: `https://api.brightdata.com/datasets/search/${dataset_id}`,
            method: 'POST',
            data: body,
            headers: {
                ...api_headers(ctx.clientName, 'search_dataset'),
                'Content-Type': 'application/json',
            },
        });
        let {hits, total_hits, took, search_after: next_cursor}
            = response.data || {};
        let result = {hits, total_hits, took};
        if (next_cursor!==undefined)
            result.search_after = next_cursor;
        return JSON.stringify(result);
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
        'Quickly read structured linkedin posts data.',
        'Requires a real LinkedIn post URL, for example:',
        'linkedin.com/pulse/... or linkedin.com/posts/...',
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
}, {
    id: 'x_profile_posts',
    dataset_id: 'gd_lwxkxvnf1cynvib9co',
    description: [
        'Quickly read structured X posts from a profile.',
        'Requires a valid X profile URL (e.g. https://x.com/username).',
        'Returns the most recent posts from the profile.',
        'Optionally filter by date range using start_date and end_date',
        '(format: YYYY-MM-DD).',
    ].join('\n'),
    inputs: ['url', 'start_date', 'end_date'],
    defaults: {start_date: '', end_date: ''},
    trigger_params: {
        type: 'discover_new',
        discover_by: 'profile_url_most_recent_posts',
        limit_per_input: 10,
    },
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
    id: 'reddit_comments',
    dataset_id: 'gd_lvzdpsdlw09j6t702',
    description: [
        'Quickly read structured Reddit comments data.',
        'Requires a valid Reddit post or comment thread URL.',
        'Optionally filter by recency using days_back (number of days).',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['url', 'days_back'],
    defaults: {days_back: ''},
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
}, {
    id: 'chatgpt_ai_insights',
    dataset_id: 'gd_m7aof0k82r803d5bjm',
    description: [
        'Send a prompt to ChatGPT and get back AI-generated insights.',
        'Returns structured answer text, citations, recommendations,'
        +' and markdown. Useful for GEO and LLM as a judge.',
    ].join('\n'),
    inputs: ['prompt'],
    fixed_values: {
        url: 'https://chatgpt.com/',
        country: '',
        web_search: false,
        additional_prompt: '',
    },
    trigger_params: {custom_output_fields: 'answer_text_markdown'},
}, {
    id: 'grok_ai_insights',
    dataset_id: 'gd_m8ve0u141icu75ae74',
    description: [
        'Send a prompt to Grok and get back AI-generated insights.',
        'Returns structured answer text in markdown format.',
        'Useful for GEO and LLM as a judge.',
    ].join('\n'),
    inputs: ['prompt'],
    fixed_values: {url: 'https://grok.com/', index: ''},
    trigger_params: {custom_output_fields: 'answer_text_markdown'},
}, {
    id: 'perplexity_ai_insights',
    dataset_id: 'gd_m7dhdot1vw9a7gc1n',
    description: [
        'Send a prompt to Perplexity and get back AI-generated insights.',
        'Returns structured answer text in markdown format.',
        'Useful for GEO and LLM as a judge.',
    ].join('\n'),
    inputs: ['prompt'],
    fixed_values: {url: 'https://www.perplexity.ai', index: '', country: ''},
    trigger_params: {custom_output_fields: 'answer_text_markdown'},
}, {
    id: 'npm_package',
    dataset_id: 'gd_mk57m0301khq4jmsul',
    description: [
        'Quickly read structured npm package data.',
        'Requires a valid npm package name (e.g., @brightdata/sdk).',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['package_name'],
}, {
    id: 'pypi_package',
    dataset_id: 'gd_mk57kc3t1wwgmnepp9',
    description: [
        'Quickly read structured PyPI package data.',
        'Requires a valid PyPI package name (e.g., langchain-brightdata).',
        'This can be a cache lookup, so it can be more reliable than scraping',
    ].join('\n'),
    inputs: ['package_name'],
}];
const dataset_id_to_title = id=>{
    return id.split('_')
        .map(word=>word.charAt(0).toUpperCase()+word.slice(1))
        .join(' ');
};

const snapshot_poll_interval_ms = 1000;
// POLLING_TIMEOUT stays an upper bound in seconds for anyone who lowered it,
// but the wait budget is what normally decides when we stop blocking.
const snapshot_wait_budget_ms = Math.min(dataset_wait_budget_ms,
    polling_timeout*1000);
// The upstream statuses that mean "not finished yet". Only these produce a
// pending envelope. Everything else, including every error, is an error.
const snapshot_pending_statuses = ['running', 'building', 'starting',
    'closing'];
// The one status that never resolves itself inside a wait budget: a snapshot
// ID the API will not even parse. Retrying it only burns the budget and hides
// the reason from the caller. 401, 403 and 404 deliberately stay out: a
// snapshot the trigger created seconds ago is routinely not readable yet, and
// the loop before this change retried all three, so treating them as terminal
// would abandon a collection that is already billed.
const snapshot_fatal_statuses = [400];
// fastmcp emits a progress notification whether or not the client asked for
// one, and the hosted server keeps every one of them in a bounded event
// store, so report on a timer rather than once per poll.
const snapshot_progress_interval_ms = 10000;
// axios reads a timeout of 0 as "wait forever", so never let the remaining
// budget floor out to zero.
const request_timeout = deadline=>Math.max(1000, deadline-Date.now());
// How long to suggest waiting between web_data_snapshot calls. Each call
// already long-polls for the whole budget, so this only matters to a caller
// that wants to go do something else in between.
const snapshot_polling_interval_seconds = 15;
// snapshot_id -> {started_at, label} for the collection behind it, so a later
// web_data_snapshot call can report the time since the collection started and
// not just the time it spent in the current call, and can say what the opaque
// ID is collecting. Only the triggering call knows either of those; the
// collecting call is handed nothing but the ID. Best effort: an entry is
// dropped once the records are delivered, and the map is capped so snapshots
// that are never collected cannot grow it without bound.
const snapshot_started_at = new Map();
const snapshot_started_at_max = 1000;
// Long enough for a tool name and a recognisable URL, short enough that one
// pathological input cannot bloat every envelope that follows it.
const snapshot_label_max = 200;
const elapsed_s = started_at=>Math.round((Date.now()-started_at)/1000);

// Turns the tool call into something an agent can read back later, because
// "sd_mtsosz7n1fexitzavy" on its own says nothing about what was asked for.
// data has fixed_values already merged in, so this is the input that was
// actually sent.
function snapshot_label(tool_name, data){
    let input = data.url ?? Object.values(data)[0];
    // A tool whose inputs are all fixed still gets a useful label: the tool
    // name alone says what is being collected.
    let label = input==null || `${input}`=='' ? tool_name
        : `${tool_name} for ${input}`;
    // Marked when cut, never silently shortened. A truncated URL that still
    // looks whole is one an agent will copy back out as the real input.
    return label.length>snapshot_label_max ?
        `${label.slice(0, snapshot_label_max-3)}...` : label;
}

function remember_snapshot(snapshot_id, started_at, label){
    if (snapshot_started_at.size>=snapshot_started_at_max)
        snapshot_started_at.delete(snapshot_started_at.keys().next().value);
    snapshot_started_at.set(snapshot_id, {started_at, label});
}

// Polls a dataset snapshot until the records are ready or the deadline
// passes. Returns {records} as a JSON string once they are ready, else
// {last_error} where last_error is null when the collection was observed to
// be pending. Never throws, and that is the whole point: the collection is
// billed the moment it is triggered and keeps running after the client hangs
// up, so the caller has to be left holding a way back to it, and the caller
// is the only place that still knows the snapshot ID. last_error is set only
// when the last poll of the window failed and no poll after it saw a pending
// status, which is the one case where "still running" would be a guess
// rather than an observation. The caller decides what to do with it; an
// error is never dressed up as a pending envelope.
async function poll_snapshot(snapshot_id, tool_name, ctx, deadline){
    let started_at = Date.now();
    let budget_s = Math.round((deadline-started_at)/1000);
    let last_progress_at = started_at;
    let last_error = null;
    while (Date.now()<deadline)
    {
        try {
            if (ctx && ctx.reportProgress
                && Date.now()-last_progress_at>=snapshot_progress_interval_ms)
            {
                last_progress_at = Date.now();
                await ctx.reportProgress({
                    progress: elapsed_s(started_at),
                    total: budget_s,
                    message: `Polling for data (${elapsed_s(started_at)}s `
                        +`of ${budget_s}s)`,
                });
            }
            let snapshot_response = await axios({
                url: `https://api.brightdata.com/datasets/v3`
                    +`/snapshot/${encodeURIComponent(snapshot_id)}`,
                params: {format: 'json'},
                method: 'GET',
                headers: api_headers(ctx.clientName, tool_name),
                timeout: request_timeout(deadline),
            });
            last_error = null;
            if (snapshot_pending_statuses.includes(
                snapshot_response.data?.status))
            {
                console.error(`[${tool_name}] snapshot not ready, `
                    +`polling again (${elapsed_s(started_at)}s of `
                    +`${budget_s}s)`);
                await new Promise(resolve=>setTimeout(resolve,
                    snapshot_poll_interval_ms));
                continue;
            }
            // An empty body must not reach the null stripper below.
            // JSON.stringify of a top-level null with that replacer returns
            // undefined, not a string, and JSON.parse of undefined throws a
            // SyntaxError that the catch would file as a transient network
            // hiccup and retry until the whole budget is gone, on a
            // snapshot that is answering instantly.
            if (snapshot_response.data==null)
            {
                return {last_error: new Error(`Snapshot ${snapshot_id} `
                    +`returned an empty body`)};
            }
            console.error(`[${tool_name}] snapshot data received `
                +`after ${elapsed_s(started_at)}s`);
            const data = JSON.parse(JSON.stringify(
                    snapshot_response.data,
                    (_k, v)=>v==null ? undefined : v));
            return {records: JSON.stringify(data)};
        } catch(e){
            console.error(`[${tool_name}] polling error: `
                +`${e.message}`);
            // Return, never throw. The caller is the only place that still
            // knows the snapshot ID is worth keeping, and its error message
            // is what puts that ID back in front of the agent; a throw from
            // in here walks straight past it and the billed collection is
            // lost.
            if (snapshot_fatal_statuses.includes(e.response?.status))
                return {last_error: e};
            last_error = e;
            await new Promise(resolve=>setTimeout(resolve,
                snapshot_poll_interval_ms));
        }
    }
    console.error(`[${tool_name}] wait budget of ${budget_s}s spent, `
        +`handing back snapshot ID ${snapshot_id}`);
    return {last_error};
}

// The pending hand-off, returned both by a web_data_* tool that spent its
// budget and by web_data_snapshot on a follow-up poll. Both carry the whole
// polling contract rather than only the fields that changed: an agent whose
// context was compacted between the two, or one simply handed a snapshot_id,
// sees only this response, and that is exactly the agent most likely to
// re-trigger a billable collection because it lost the history saying not
// to. The three contract fields are short; the records they stand in for
// are not.
function snapshot_pending_result(snapshot_id, started_at, label){
    return JSON.stringify({
        status: 'running',
        snapshot_id,
        // What that opaque ID is collecting, sitting right next to it so the
        // two read together. An agent running two collections at once holds
        // two "sd_..." strings it cannot tell apart, and an agent whose
        // context was compacted has no history left saying what it asked
        // for. That second one is exactly the agent that re-triggers and
        // pays twice.
        ...label ? {collecting: label} : {},
        // Omitted rather than guessed when the trigger time is unknown, for
        // instance after a restart or an eviction from snapshot_started_at.
        // A missing field can be ignored; a wrong number gets reasoned from.
        // The label is unknown in those same cases and is left out for the
        // same reason: a guessed URL is worse than no URL.
        ...started_at ? {elapsed_s: elapsed_s(started_at)} : {},
        polling_interval_seconds: snapshot_polling_interval_seconds,
        next: 'Call web_data_snapshot with this snapshot_id to collect the '
            +'records.',
        warning: 'Do NOT re-trigger the web_data_* tool for the same input. '
            +'Every trigger starts a second billable collection. Use this '
            +'snapshot_id.',
    });
}

// web_data_snapshot is the only way back to a collection any web_data_* tool
// started, so it has to be enabled wherever those are. pro_mode adds every
// tool anyway; an explicit GROUPS/TOOLS selection has to pull it in.
if ([...allowed_tools].some(name=>name.startsWith('web_data_')))
    allowed_tools.add('web_data_snapshot');

addTool({
    name: 'web_data_snapshot',
    description: 'Collect the records of a dataset collection that a '
        +'web_data_* tool already triggered but could not finish in time '
        +'(its result was {"status":"running","snapshot_id":...} instead of '
        +'the records).\n'
        +'The collection keeps running on Bright Data and is already paid '
        +'for, so this is how you get the data you were billed for. Waits '
        +'server-side and returns the records as soon as they are ready.\n'
        +'If the result is still "status":"running", just call this again '
        +'with the same snapshot_id, as many times as it takes. NEVER re-run '
        +'the original web_data_* tool to retry: that starts a second '
        +'billable collection and abandons this one.\n'
        +'Example: web_data_amazon_product returned {"status":"running",'
        +'"snapshot_id":"sd_mtsosz7n1fexitzavy","elapsed_s":45,...}, so call '
        +'web_data_snapshot with snapshot_id "sd_mtsosz7n1fexitzavy".',
    annotations: {
        title: 'Web Data Snapshot',
        readOnlyHint: true,
        openWorldHint: true,
    },
    parameters: z.object({
        // A positive allowlist, not a blocklist, and enforced by the schema
        // so a bad value never reaches execute(). This ID is interpolated
        // into the snapshot URL path, and both dot segments and their
        // percent-encoded spellings normalise away ("%2e%2e/" is "../"), so
        // any character outside this set would turn the tool into an
        // authenticated GET against any Bright Data endpoint. That matters
        // here because the value can come from scraped, attacker-controlled
        // text sitting in the caller's context.
        snapshot_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/,
            'snapshot_id must be 1 to 64 characters of letters, digits, '
            +'underscore or hyphen')
            .describe('The snapshot_id from the "status":"running" result '
                +'of a web_data_* tool or of an earlier web_data_snapshot '
                +'call (e.g. "sd_mtsosz7n1fexitzavy"). Pass it back exactly '
                +'as it was given.'),
    }),
    execute: tool_fn('web_data_snapshot', async({snapshot_id}, ctx)=>{
        // Both are unknown for an ID this process did not trigger, which is
        // a real flow: a restart, an eviction, or an ID pasted in by hand.
        let remembered = snapshot_started_at.get(snapshot_id) || null;
        let started_at = remembered?.started_at || null;
        let label = remembered?.label || null;
        let poll = await poll_snapshot(snapshot_id, 'web_data_snapshot', ctx,
            Date.now()+snapshot_wait_budget_ms);
        if (poll.records!==undefined)
        {
            snapshot_started_at.delete(snapshot_id);
            return poll.records;
        }
        // The last poll of the window failed, so "running" would be a guess.
        // Reporting it as pending would send the caller round an endless
        // polling loop on an ID that is most likely wrong or expired. The
        // raw axios message is "Request failed with status code 404" and
        // names nothing, so say which snapshot it was: an agent waiting on
        // two collections cannot otherwise tell which one it just lost.
        if (poll.last_error)
        {
            throw new Error(`Polling snapshot ${snapshot_id} failed: `
                +`${poll.last_error.message}`);
        }
        return snapshot_pending_result(snapshot_id, started_at, label);
    }),
});

for (let {dataset_id, id, description, inputs, defaults = {},
    fixed_values = {}, trigger_params = {}} of datasets)
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
            let started_at = Date.now();
            let label = snapshot_label(tool_name, data);
            // Deliberately no timeout on this POST. The snapshot ID exists
            // in exactly one place, this response body, and the collection
            // is billed as soon as Bright Data accepts the request. Aborting
            // the read loses the ID while the charge stands, and nothing on
            // our side ever learns what to collect, so waiting for the
            // answer is always cheaper than giving up on it. Do not add a
            // timeout back: the wait budget bounds the polling that follows,
            // which is the part that can legitimately run long.
            let trigger_response = await axios({
                url: 'https://api.brightdata.com/datasets/v3/trigger',
                params: {dataset_id, include_errors: true, ...trigger_params},
                method: 'POST',
                data: [data],
                headers: api_headers(ctx.clientName, tool_name),
            });
            if (!trigger_response.data?.snapshot_id)
                throw new Error('No snapshot ID returned from request');
            let snapshot_id = trigger_response.data.snapshot_id;
            remember_snapshot(snapshot_id, started_at, label);
            console.error(`[${tool_name}] triggered collection with `
                +`snapshot ID: ${snapshot_id}`);
            let poll = await poll_snapshot(snapshot_id, tool_name, ctx,
                started_at+snapshot_wait_budget_ms);
            if (poll.records!==undefined)
            {
                snapshot_started_at.delete(snapshot_id);
                return poll.records;
            }
            // A failed poll is an error and never a pending envelope, but
            // the trigger succeeded, so this collection exists and is billed:
            // the snapshot ID has to survive the error or the records are
            // lost for good. A terminal status lands here too: poll_snapshot
            // returns it as last_error rather than throwing, precisely so
            // this message can name the ID.
            if (poll.last_error)
            {
                throw new Error(`Polling snapshot ${snapshot_id} failed: `
                    +`${poll.last_error.message}. The collection was `
                    +`triggered and is already billed, so retry with `
                    +`web_data_snapshot and snapshot_id ${snapshot_id} `
                    +`instead of triggering it again.`);
            }
            // Out of budget, not out of luck: the collection is running and
            // billed, so hand back the snapshot ID rather than dropping it.
            return snapshot_pending_result(snapshot_id, started_at, label);
        }),
    });
}

server.addPrompts(prompts);

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
                `3. Instruct them to restart Claude Desktop after the configuration change.`+
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

function search_url(engine, query, cursor, geo_location){
    let q = encodeURIComponent(query);
    let page = cursor ? parseInt(cursor) : 0;
    let start = page * 10;
    if (engine=='yandex')
        return `https://yandex.com/search/?text=${q}&p=${page}`;
    if (engine=='bing')
        return `https://www.bing.com/search?q=${q}&first=${start + 1}`;
    let gl = geo_location ? `&gl=${geo_location}` : '';
    return `https://www.google.com/search?q=${q}&start=${start}${gl}`;
}
