'use strict'; /*jslint node:true es9:true*/
import {z} from 'zod';

export const scraper_tool_names = ['search_scrapers', 'get_scraper_details',
    'run_scraper', 'get_scraper_progress', 'get_scraper_results',
    'refresh_scrapers'];

const read_only = title=>({title, readOnlyHint: true, openWorldHint: true});
const dataset_id = z.string().describe('dataset_id from search_scrapers');
const method = z.string().describe('One of the scraper collection_methods, '
    +'exactly as listed (some names are misspelled on purpose)');
const snapshot_id = z.string().describe('snapshot_id from run_scraper');

export function scraper_tools({catalog, runner, tool_fn, headers}){
    const tool = (name, title, description, parameters, fn)=>({name,
        description, annotations: read_only(title),
        parameters: z.object(parameters),
        execute: tool_fn(name, async(data, ctx)=>JSON.stringify(
            await fn(data, headers(ctx.clientName, name)))),
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
            +'billed. Waits up to 60 seconds; if still running it returns '
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
