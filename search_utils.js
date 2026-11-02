'use strict'; /*jslint node:true es9:true*/
import {UserError} from 'fastmcp';
import {z} from 'zod';
import {line} from './fetch_api.js';

const google_tbs = {hour: 'h', day: 'd', week: 'w', month: 'm', year: 'y'};
const bing_filters = {day: 'ez1', week: 'ez2', year: 'ez3'};
const renamed = {geo_location: 'country', cursor: 'page (a number from 0)'};

const unknown_keys_error = keys=>{
    const key = keys.find(k=>renamed[k]);
    return key ? line('invalid_input', `${key} was renamed to `
        +renamed[key], 'Retry with the new name.')
        : line('invalid_input', `Unknown argument ${keys.join(', ')}`,
            'Retry without it.');
};

const error_map = (issue, ctx)=>({message: issue.code=='unrecognized_keys'
    ? unknown_keys_error(issue.keys) : ctx.defaultError});

export const search_schema = z.object({
    query: z.string(),
    engine: z.enum(['bing', 'google']).optional().default('bing'),
    country: z.string().length(2).optional()
        .describe('2-letter country code, e.g. "us", "de"'),
    page: z.number().int().min(0).optional().default(0)
        .describe('Results page, 10 results per page, starting at 0'),
    time_range: z.enum(['hour', 'day', 'week', 'month', 'year', 'any'])
        .optional().default('any')
        .describe('Bing supports only day, week, year and any'),
}, {errorMap: error_map}).strict().superRefine((args, ctx)=>{
    if (args.engine=='bing' && args.time_range!='any'
        && !bing_filters[args.time_range])
    {
        ctx.addIssue({code: z.ZodIssueCode.custom, path: ['time_range'],
            message: line('invalid_input', `time_range ${args.time_range} `
                +'is not supported on bing', 'Use day, week, year or any, '
                +'or use engine google.')});
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
    if (country)
        params.set('cc', country);
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
        throw new UserError(line('service_unavailable', `${engine} search `
            +'failed for this query', 'Try again in about 30 seconds'
            +(engine=='google' ? ', or use engine bing.' : '.')));
    }
    return clean_search_payload(data);
};
