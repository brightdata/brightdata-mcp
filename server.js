#!/usr/bin/env node
'use strict'; /*jslint node:true es9:true*/
import {FastMCP, UserError} from 'fastmcp';
import {z} from 'zod';
import axios from 'axios';
import {tools as browser_tools} from './browser_tools.js';
import prompts from './prompts.js';
import {gate_page_content, refusal_text} from './content_gate.js';
import {wrap_untrusted} from './untrusted_content.js';
import {redact_url_creds, redact_token, safe_error} from './safe_error.js';
import {GROUPS, resolve_tool} from './tool_groups.js';
import {create_scraper_catalog} from './scraper_catalog.js';
import {create_scraper_run} from './scraper_run.js';
import {scraper_tools} from './scraper_tools.js';
import {sophie_assistant_tool, ask_sophie} from './sophie_assistant.js';
import {fetch_dataset_id, fetch_formats, to_page, FETCH_RULES, page_error,
    batch_pages, batch_cancel_s, single_max_chars, UNLOCKER_RULES,
    unlocker_body} from './fetch_api.js';
import {api_error, describe, read_error} from './errors.js';
import {search_schema, search_request, parse_search_response, search_batch,
    SEARCH_RULES} from './search_utils.js';
import {dataset_id_schema, filter_schema, metadata_to_fields, FILTER_OPERATORS,
    DATASET_RULES}
    from './search_dataset_schema.js';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const package_json = require('./package.json');
const api_token = process.env.API_TOKEN;
const unlocker_zone = process.env.WEB_UNLOCKER_ZONE || 'mcp_unlocker';
const browser_zone = process.env.BROWSER_ZONE || 'mcp_browser';
const serp_zone = process.env.SERP_ZONE || 'mcp_serp';
const base_timeout = process.env.BASE_TIMEOUT
    ? parseInt(process.env.BASE_TIMEOUT, 10) * 1000 : 0;
const base_max_retries = Math.min(
    parseInt(process.env.BASE_MAX_RETRIES || '0', 10), 3);
// Tools whose result is page-derived content. Their return passes through the
// content gate (see content_gate.js); every other tool is untouched.
const page_content_tools = new Set(['scrape_as_markdown', 'search_engine',
    'extract', 'scrape_batch', 'search_engine_batch']);
// Tools that return attacker-controllable external web content. Their
// output is wrapped as untrusted data so the model never treats embedded
// text as instructions (indirect prompt injection). Scraper, dataset and
// browser tools add themselves to this set below.
const external_content_tools = new Set(['search_engine',
    'scrape_as_markdown', 'scrape_as_html', 'search_engine_batch',
    'scrape_batch', 'extract']);
// only an unlocker error body can be the target site's own page; other
// error details are Bright Data's messages
const site_error_tools = new Set(['scrape_as_html', 'extract']);
const wrap_external = (name, result)=>
    external_content_tools.has(name) && typeof result=='string'
        ? wrap_untrusted(result) : result;
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
        resolve_tool(tool).forEach(t=>allowed.add(t));
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

const zone_timeout = base_timeout || 10*1000;
async function ensure_zone(zones, name, zone, plan){
    if (zones.some(z=>z.name==name))
        return console.error(`Required zone "${name}" already exists`);
    console.error(`Required zone "${name}" not found, creating it...`);
    try {
        await axios({
            url: 'https://api.brightdata.com/zone',
            method: 'POST',
            timeout: zone_timeout,
            headers: {...api_headers(), 'Content-Type': 'application/json'},
            data: {zone: {name, ...zone}, plan},
        });
        console.error(`Zone "${name}" created successfully`);
    } catch(e){
        console.error(`Error creating zone "${name}":`,
            e.response?.data||e.message);
    }
}

async function ensure_required_zones(){
    let zones;
    try {
        console.error('Checking for required zones...');
        const response = await axios({
            url: 'https://api.brightdata.com/zone/get_active_zones',
            method: 'GET',
            timeout: zone_timeout,
            headers: api_headers(),
        });
        zones = response.data || [];
    } catch(e){
        return console.error('Error checking zones:',
            e.response?.data||e.message);
    }
    await ensure_zone(zones, serp_zone, {type: 'unblocker'},
        {type: 'unblocker', serp: true});
    await ensure_zone(zones, unlocker_zone, {type: 'unblocker'},
        {type: 'unblocker', ub_premium: true});
    await ensure_zone(zones, browser_zone, {type: 'browser_api'},
        {type: 'browser_api'});
}

await ensure_required_zones();

const instructions = 'Bright Data tools fetch live web data. For a known '
    +'site (Amazon, LinkedIn, Instagram, Zillow, ...), call search_scrapers '
    +'first, then get_scraper_details and run_scraper for structured JSON. '
    +'Otherwise use scrape_as_markdown, or scrape_batch for several URLs. '
    +'Use the scraping_browser_* tools only when the task needs clicks, '
    +'typing or screenshots. If run_scraper returns a snapshot_id that is '
    +'still running, poll get_scraper_progress, then call '
    +'get_scraper_results.';

let server = new FastMCP({
    name: 'Bright Data',
    version: package_json.version,
    instructions,
});
let debug_stats = {tool_calls: {}, session_calls: 0, call_timestamps: []};

const addTool = (tool) => {
    if (allowed_tools.size>0 && !allowed_tools.has(tool.name))
        return;
    server.addTool(tool);
};

addTool({
    ...sophie_assistant_tool,
    execute: tool_fn('ask_brightdata_assistant', async({question,
        dialog_id})=>
    {
        const {answer, dialog_id: returned_id} = await ask_sophie({
            question,
            dialog_id,
            api_token,
        });
        return JSON.stringify({answer, dialog_id: returned_id});
    }),
});

async function run_search(args, ctx, tool, signal){
    const response = await base_request({
        url: 'https://api.brightdata.com/request',
        method: 'POST',
        data: {...search_request(args), zone: serp_zone},
        headers: api_headers(ctx.clientName, tool),
        responseType: 'text',
        signal,
    });
    return parse_search_response(response.data, args.engine);
}

addTool({
    name: 'search_engine',
    description: 'Search Bing (default) or Google. Returns JSON: organic '
        +'results with link, title and description, 10 per page. Ideal for '
        +'gathering current information, news, and detailed search results.',
    annotations: {
        title: 'Search Engine',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
    },
    parameters: search_schema,
    execute: tool_fn('search_engine', async(args, ctx)=>
        JSON.stringify(await run_search(args, ctx, 'search_engine'), null,
            2), SEARCH_RULES),
});

const fetch_deadline_ms = 45000;
const scrape_url = 'https://api.brightdata.com/datasets/v3/scrape';

async function fetch_scrape(url, headers){
    const deadline = Date.now()+fetch_deadline_ms;
    for (let attempt = 0; ; attempt++)
    {
        try {
            return await axios({url: scrape_url, method: 'POST',
                params: {dataset_id: fetch_dataset_id, format: 'json',
                    include_errors: true},
                data: [{url}], headers,
                signal: AbortSignal.timeout(deadline-Date.now())});
        } catch(e){
            if (attempt || !(e.response?.status>=500)
                || deadline-Date.now()<1000)
            {
                throw e;
            }
        }
    }
}

async function fetch_page(url, format, headers, max){
    let response;
    try { response = await fetch_scrape(url, headers); }
    catch(e){ return {url, error: api_error(e, FETCH_RULES, {url})}; }
    if (response.status==202)
    {
        return {url, error: describe({kind: 'timeout',
            details: 'HTTP 202: still running'}, FETCH_RULES, {url})};
    }
    const record = Array.isArray(response.data) && response.data[0];
    return record ? to_page(record, format, max)
        : {url, error: page_error('no_data', url, 'empty response')};
}

async function scrape_page(url, format, headers){
    const page = await fetch_page(url, format, headers, single_max_chars);
    if (page.error)
        throw new UserError(page.error);
    return JSON.stringify(page);
}

const fetch_runner = create_scraper_run();

async function scrape_urls(urls, format, headers){
    const unique = [...new Set(urls)];
    if (unique.length==1)
    {
        const page = await fetch_page(unique[0], format, headers);
        return urls.map(()=>page);
    }
    return batch_pages({runner: fetch_runner, urls, format, headers});
}

const format_param = z.enum(Object.keys(fetch_formats)).optional()
    .default('markdown');

addTool({
    name: 'scrape_as_markdown',
    description: 'Fetch one web page. Returns JSON: url, title, format, '
    +'content. content is the page in one format, markdown by default. '
    +'Pick another with the format param:\n'
    +'- text: plain text, no links or headings\n'
    +'- html: raw HTML, for CSS selectors or data hidden in the markup\n'
    +'- ld_json: schema.org data (price, rating, author...)\n'
    +'If the page has no data in that format, markdown is returned instead, '
    +'with a note. No JavaScript rendering. Pages that take longer than '
    +'45 s time out.',
    annotations: {
        title: 'Scrape as Markdown',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
    },
    parameters: z.object({url: z.string().url(), format: format_param}),
    execute: tool_fn('scrape_as_markdown', async({url, format}, ctx)=>
        scrape_page(url, format,
            api_headers(ctx.clientName, 'scrape_as_markdown'))),
});

addTool({
    name: 'search_engine_batch',
    description: 'Run up to 5 searches at once, on Bing (default) or '
    +'Google. Returns a JSON array in input order: query, engine, and '
    +'result (organic link, title, description) or error. Searches not '
    +'done within 45 s return a timeout error.',
    annotations: {
        title: 'Search Engine Batch',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
    },
    parameters: z.object({queries: z.array(search_schema).min(1).max(5)}),
    execute: tool_fn('search_engine_batch', async({queries}, ctx)=>
        JSON.stringify(await search_batch({queries,
            run: (q, signal)=>run_search(q, ctx, 'search_engine_batch',
                signal),
            to_error: (e, q)=>error_text(e, SEARCH_RULES, q)}), null,
            2)),
});

addTool({
    name: 'scrape_batch',
    description: 'Fetch up to 5 web pages at once. Returns a JSON array in '
    +'input order, one item per URL: url, title, format, content, or url '
    +'and error if that page failed. content is the page in one format, '
    +'markdown by default. Pick another with the format param:\n'
    +'- text: plain text, no links or headings\n'
    +'- html: raw HTML, for CSS selectors or data hidden in the markup\n'
    +'- ld_json: schema.org data (price, rating, author...)\n'
    +'If a page has no data in that format, markdown is returned instead, '
    +'with a note. No JavaScript rendering. Pages that take longer than '
    +`${batch_cancel_s} s time out.`,
    annotations: {
        title: 'Scrape Batch',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
    },
    parameters: z.object({
        urls: z.array(z.string().url()).min(1).max(5),
        format: format_param,
    }),
    execute: tool_fn('scrape_batch', async({urls, format}, ctx)=>{
        const items = await scrape_urls(urls, format,
            api_headers(ctx.clientName, 'scrape_batch'));
        return JSON.stringify(items);
    }),
});

addTool({
    name: 'scrape_as_html',
    description: 'Scrape a single webpage URL and get back the results in '
    +'HTML.',
    annotations: {
        title: 'Scrape as HTML',
        readOnlyHint: true,
        destructiveHint: false,
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
        return unlocker_body(response);
    }, UNLOCKER_RULES),
});

addTool({
    name: 'extract',
    description: 'Scrape a webpage and extract structured data as JSON. '
        + 'First scrapes the page as markdown, then uses AI sampling to convert '
        + 'it to structured JSON format.',
    annotations: {
        title: 'Extract Structured Data',
        readOnlyHint: true,
        destructiveHint: false,
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

        let markdown_content = unlocker_body(scrape_response);

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
    }, UNLOCKER_RULES),
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
        destructiveHint: false,
        openWorldHint: false,
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
        +'to run_scraper which collects fresh records by URL.\n'
        +'First call list_dataset_fields to get valid field names.\n'
        +'A filter is a tree: a group {operator:"and"|"or", filters:[...]} '
        +'or a leaf {name, value, operator}. Max nesting depth 3.\n'
        +'Leaf operators: '+FILTER_OPERATORS.join(', ')+'.\n'
        +SEARCHABLE_DATASETS_DESC,
    annotations: {
        title: 'Search Dataset',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
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
    }, DATASET_RULES),
});

for (const tool of scraper_tools({catalog: create_scraper_catalog(),
    runner: create_scraper_run(), tool_fn,
    headers: (ctx, name)=>api_headers(ctx.clientName, name)}))
{
    addTool(tool);
}
external_content_tools.add('run_scraper');
external_content_tools.add('get_scraper_results');

addTool({
    name: 'session_stats',
    description: 'Tell the user about the tool usage during this session',
    annotations: {
        title: 'Session Stats',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
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
}];
const dataset_id_to_title = id=>{
    return id.split('_')
        .map(word=>word.charAt(0).toUpperCase()+word.slice(1))
        .join(' ');
};

for (let {dataset_id, id, description, inputs, defaults = {},
    fixed_values = {}, trigger_params = {}} of datasets)
{
    const tool_name = id;
    external_content_tools.add(tool_name);
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
            readOnlyHint: false,
            destructiveHint: false,
            openWorldHint: true,
        },
        parameters: z.object(parameters),
        execute: tool_fn(tool_name, async(data, ctx)=>{
            data = {...data, ...fixed_values};
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
            console.error(`[${tool_name}] triggered collection with `
                +`snapshot ID: ${snapshot_id}`);
            let max_attempts = 600;
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
                    if (snapshot_response.data?.status=='failed')
                    {
                        throw Object.assign(new Error(`Data collection `
                            +`failed (snapshot ${snapshot_id})`),
                            {snapshot_failed: true});
                    }
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
                    if (e.response?.status === 400 || e.snapshot_failed)
                        throw e;
                    attempts++;
                    await new Promise(resolve=>setTimeout(resolve, 1000));
                }
            }
            throw new Error(`Timeout after ${max_attempts} seconds waiting `
                +`for data`);
        }),
    });
}

server.addPrompts(prompts);

for (let tool of browser_tools)
{
    external_content_tools.add(tool.name);
    addTool({...tool, execute: async(params, ctx)=>{
        try {
            return wrap_external(tool.name, await tool.execute(params, ctx));
        } catch(e){
            throw new UserError(error_text(e, [], params));
        }
    }});
}

console.error('Starting server...');

server.on('connect', (event)=>{
    const session = event.session;
    const clientInfo = session.server?.getClientVersion?.();
    if (clientInfo) 
        global.mcpClientInfo = clientInfo;
});

server.start({transportType: 'stdio'});
function error_text(e, rules, vars, untrusted){
    if (e instanceof UserError)
        return safe_error(e, api_token);
    const facts = read_error(e);
    if (facts.brd_code=='client_10100' && unlocker_zone=='mcp_unlocker')
        facts.reason = 'free_tier';
    // error bodies from a scraped origin are also untrusted
    if (untrusted)
        facts.details = '\n'+wrap_untrusted(facts.details);
    return redact_token(describe(facts, rules, vars), api_token);
}

function log_error(name, e){
    if (e.response)
    {
        console.error(`[%s] error %s %s: %s`, name, e.response.status,
            e.response.statusText, redact_url_creds(e.response.data));
    }
    else if (!(e instanceof UserError))
        console.error(`[%s] error %s`, name, redact_url_creds(e.stack));
}

function tool_fn(name, fn, rules = []){
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
        try {
            let result = await fn(data, extended_ctx);
            if (page_content_tools.has(name))
            {
                result = await gate_page_content({name, result,
                    ctx: extended_ctx, sessions: server.sessions});
                // a refusal is the server speaking to the agent, not page
                // content, so it must not be wrapped as untrusted
                if (result===refusal_text(name))
                    return result;
            }
            return wrap_external(name, result);
        }
        catch(e){
            log_error(name, e);
            const message = error_text(e, rules, data,
                site_error_tools.has(name));
            console.error(`[%s] error %s`, name, message);
            throw new UserError(message);
        } finally {
            let dur = Date.now()-ts;
            console.error(`[%s] tool finished in %sms`, name, dur);
        }
    };
}
