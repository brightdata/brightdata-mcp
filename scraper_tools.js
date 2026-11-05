'use strict'; /*jslint node:true es9:true*/
import {z} from 'zod';

export const scraper_tool_names = ['search_scrapers', 'get_scraper_details',
    'run_scraper', 'get_scraper_progress', 'get_scraper_results',
    'refresh_scrapers'];

export const COLLECTION_RULES = [
    {reason: 'collection_failed', title: 'Collection failed',
        what: 'Bright Data couldn\'t collect the data',
        todo: 'Retry once. If it fails again, tell the user.'},
    {reason: 'collection_timeout', title: 'Collection timed out',
        what: 'The data wasn\'t ready after 10 minutes',
        todo: 'Don\'t start a new run. If get_scraper_results is '
            +'available, call it later with the snapshot_id in the details.'},
];

export const SCRAPER_RULES = [
    {reason: 'scraper_not_found', title: 'Scraper not found',
        what: 'No scraper has dataset_id {dataset_id}',
        todo: 'Call search_scrapers to find the right dataset_id.'},
    {reason: 'method_not_found', title: 'Method not found',
        what: 'This scraper has no method {method}',
        todo: 'Use one of the methods listed in the details.'},
    {step: 'trigger', status: 400, title: 'Scraper input rejected',
        what: 'The scraper rejected the input',
        todo: 'Call get_scraper_details for the required fields, fix the '
            +'input, then retry.'},
    {reason: 'snapshot_not_found', title: 'Snapshot not found',
        what: 'No run has snapshot_id {snapshot_id}',
        todo: 'Use the snapshot_id that run_scraper returned.'},
    ...COLLECTION_RULES,
];

const annotations = (name, title)=>{
    const job = name=='run_scraper';
    return {title, readOnlyHint: !job, destructiveHint: false,
        openWorldHint: job};
};
const dataset_id = z.string().describe('dataset_id from search_scrapers');
const method = z.string().describe('One of the scraper collection_methods, '
    +'exactly as listed (some names are misspelled on purpose)');
const snapshot_id = z.string().describe('snapshot_id from run_scraper');

export function scraper_tools({catalog, runner, tool_fn, headers}){
    const tool = (name, title, description, parameters, fn)=>({name,
        description, annotations: annotations(name, title),
        parameters: z.object(parameters),
        execute: tool_fn(name, async(data, ctx)=>{
            const meta = ctx.tool_meta||{};
            Object.assign(meta, {dataset_id: data.dataset_id,
                method: data.method});
            try {
                return JSON.stringify(await fn(data, headers(ctx, name)));
            } catch(e){
                Object.assign(meta, {failed_step: e.step,
                    error_code: e.error_code});
                throw e;
            }
        }, SCRAPER_RULES),
    });
    return [
        tool('search_scrapers', 'Search Scrapers', 'Find a Bright Data '
            +'pre-built scraper (Web Scraper API, 1,200+ sites) for a site '
            +'or data type, e.g. "amazon reviews" or "linkedin.com". Returns '
            +'dataset_id, name, domain and collection_methods. Next: call '
            +'get_scraper_details with a dataset_id and one method.',
        {query: z.string(), limit: z.number().int().min(1).max(50)
            .optional().default(10)},
        d=>catalog.search(d.query, d.limit)),
        tool('get_scraper_details', 'Get Scraper Details', 'Show the '
            +'scraper description, input fields, example input and main '
            +'output fields for one method. Call before run_scraper and '
            +'build the input from sample_input or input_fields. Records may '
            +'contain more fields than output_fields lists.',
        {dataset_id, method},
        (d, h)=>catalog.get_details(d.dataset_id, d.method, h)),
        tool('run_scraper', 'Run Scraper', 'Run a scraper method. input is '
            +'a list of objects shaped like sample_input from '
            +'get_scraper_details, one per URL or query. collect_by_url '
            +'returns one record per input; discover_by_* methods return up '
            +'to limit_per_input records per input, and every record is '
            +'billed. Waits up to 45 seconds; if still running it returns '
            +'snapshot_id with status "running": then poll '
            +'get_scraper_progress and call get_scraper_results when ready. '
            +'Records with an "error" field explain failed inputs.',
        {dataset_id, method, input: z.array(z.record(z.string(), z.any()))
            .min(1), limit_per_input: z.number().int().min(1).max(1000)
            .optional().default(10).describe('discover_by_* only')},
        (d, h)=>runner.run({...d, headers: h})),
        tool('get_scraper_progress', 'Get Scraper Progress', 'Status of a '
            +'run: starting, running, ready, failed or canceled.',
        {snapshot_id}, (d, h)=>runner.progress(d.snapshot_id, h)),
        tool('get_scraper_results', 'Get Scraper Results', 'Records of a '
            +'finished run. Returns status "running" if not ready yet.',
        {snapshot_id}, (d, h)=>runner.results(d.snapshot_id, h)),
        tool('refresh_scrapers', 'Refresh Scrapers', 'Reload the scraper '
            +'list now instead of waiting for the daily refresh.',
        {}, async()=>({scrapers: (await catalog.load_catalog({force: true}))
            .length})),
    ];
}
