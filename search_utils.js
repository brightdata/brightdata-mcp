'use strict'; /*jslint node:true es9:true*/
import {UserError} from 'fastmcp';
import {z} from 'zod';
import {tool_error} from './errors.js';

export const search_batch_s = 55;

export const SEARCH_RULES = [
    {kind: 'timeout', title: 'Search timed out',
        what: `The search for "{query}" didn't finish within `
            +`${search_batch_s} s`,
        todo: 'Retry this query.'},
    {status: 400, title: 'Search rejected',
        what: 'Bright Data rejected the search for "{query}"',
        todo: 'Read the details. Check the query and its options, then '
            +'retry.'},
    {reason: 'google_failed', title: 'Search failed',
        what: 'Google search failed for "{query}"',
        todo: 'Try again in about 30 seconds, or use engine bing.'},
    {reason: 'bing_failed', title: 'Search failed',
        what: 'Bing search failed for "{query}"',
        todo: 'Try again in about 30 seconds.'},
];

const ARG_RULES = {
    renamed: {title: 'Invalid argument', what: '{key} was renamed to {to}',
        todo: 'Retry with the new name.'},
    unknown: {title: 'Invalid argument', what: 'Unknown argument {keys}',
        todo: 'Retry without it.'},
    time_range: {title: 'Invalid argument',
        what: 'time_range {time_range} is not supported on bing',
        todo: 'Use day, week, year or any, or use engine google.'},
};

const google_tbs ={hour: 'h', day: 'd', week: 'w', month: 'm', year: 'y'};
const bing_filters = {day: 'ez1', week: 'ez2', year: 'ez3'};
const renamed = {geo_location: 'country', cursor: 'page (a number from 0)'};

const unknown_keys_error = keys=>{
    const key = keys.find(k=>renamed[k]);
    const details = `got ${keys.join(', ')}`;
    return key ? tool_error(ARG_RULES.renamed, details, {key, to: renamed[key]})
        : tool_error(ARG_RULES.unknown, details, {keys: keys.join(', ')});
};

const error_map = (issue, ctx)=>({message: issue.code=='unrecognized_keys'
    ? unknown_keys_error(issue.keys) : ctx.defaultError});

export const search_schema = z.object({
    query: z.string().min(1),
    engine: z.enum(['bing', 'google']).optional().default('bing'),
    country: z.string().length(2).optional()
        .describe('2-letter country code, e.g. "us", "de"'),
    page: z.number().int().min(0).optional().default(0)
        .describe('Results page, starting at 0. The number of results on a '
            +'page varies.'),
    time_range: z.enum(['hour', 'day', 'week', 'month', 'year', 'any'])
        .optional().default('any')
        .describe('Bing supports only day, week, year and any'),
}, {errorMap: error_map}).strict().superRefine((args, ctx)=>{
    if (args.engine=='bing' && args.time_range!='any'
        && !bing_filters[args.time_range])
    {
        ctx.addIssue({code: z.ZodIssueCode.custom, path: ['time_range'],
            message: tool_error(ARG_RULES.time_range,
                `engine bing, time_range ${args.time_range}`, args)});
    }
});

export const search_request = ({query, engine, country, page, time_range})=>{
    const url = new URL(`https://www.${engine}.com/search`);
    const params = url.searchParams;
    params.set('q', query);
    if (engine=='google')
    {
        params.set('brd_json', '1');
        params.set('start', page*10);
        if (country)
            params.set('gl', country);
        if (google_tbs[time_range])
            params.set('tbs', `qdr:${google_tbs[time_range]}`);
        return {url: url.href, format: 'raw', data_format: 'parsed_light'};
    }
    params.set('first', page*10+1);
    if (bing_filters[time_range])
        params.set('filters', `ex1:"${bing_filters[time_range]}"`);
    return {url: url.href, format: 'raw', data_format: 'parsed_bing',
        ...country && {country}};
};

export const clean_search_payload = raw_data=>{
    const organic = Array.isArray(raw_data?.organic) ? raw_data.organic : [];
    return {organic: organic
        .map(entry=>{
            const field = name=>typeof entry?.[name]=='string'
                ? entry[name].trim() : '';
            const [link, title] = [field('link'), field('title')];
            return link && title
                ? {link, title, description: field('description')} : null;
        })
        .filter(Boolean)};
};

export const parse_search_response = (response_text, engine)=>{
    let data;
    try { data = JSON.parse(response_text); }
    catch(e){ data = null; }
    if (!data || typeof data!='object')
    {
        throw Object.assign(new Error('the search engine answer was not '
            +'JSON'), {reason: `${engine}_failed`});
    }
    return clean_search_payload(data);
};

export const search_batch = async({queries, run, to_error,
    ms = search_batch_s*1000})=>
{
    const signal = AbortSignal.timeout(ms);
    const timeout = Object.assign(new Error(`no answer within ${ms/1000} s`),
        {name: 'TimeoutError'});
    const items = await Promise.all(queries.map(async q=>{
        const item = {query: q.query, engine: q.engine};
        try { item.result = await run(q, signal); }
        catch(e){ item.error = to_error(signal.aborted ? timeout : e, q); }
        return item;
    }));
    const errors = new Set(items.map(item=>item.error));
    if (items.every(item=>item.error) && errors.size==1)
        throw new UserError(items[0].error);
    return items;
};
