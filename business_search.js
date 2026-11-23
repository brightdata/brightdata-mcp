'use strict'; /*jslint node:true es9:true*/
import {z} from 'zod';
import {tool_error} from './errors.js';

export const BUSINESS_SEARCH_TIMEOUT_MS = 50*1000;

export const BUSINESS_SEARCH_RULES = [
    {kind: 'timeout', title: 'Search timed out',
        what: 'Business Search didn\'t answer within 50 s',
        todo: 'Narrow the query, or use mode ludicrous with exact filters.'},
    {status: 403, details: /Access denied/,
        title: 'Business Search not enabled',
        what: 'this account cannot use Business Search (beta, needs an '
            +'account with a business email)',
        todo: 'To find companies or people, use search_dataset (exact '
            +'filters on LinkedIn company and people datasets); for one '
            +'known profile, use run_scraper with its URL.'},
    {status: 502, title: 'Query not understood',
        what: 'Business Search couldn\'t interpret the query',
        todo: 'Rephrase the query, or use mode ludicrous with exact '
            +'filters.'},
    {status: 504, title: 'Search timed out',
        what: 'Business Search didn\'t finish in time',
        todo: 'Narrow the query, for example add a filter.'},
];

const ARG_RULES = {
    query: {title: 'Invalid argument',
        what: 'mode ludicrous takes a JSON query; instant and smart take '
            +'plain text',
        todo: 'Change the query or the mode.'},
    window: {title: 'Invalid argument',
        what: 'Instant and Smart reach only the first 100 matches',
        todo: 'Use mode ludicrous to page further.'},
    full: {title: 'Invalid argument',
        what: 'view full allows limit 5 or less',
        todo: 'Use summary or a field list for more records.'},
};

const description = [
    'Find companies or people (LinkedIn data) by description or criteria. '
        +'Ranked results in one call. First choice to find companies or '
        +'people.',
    'Up to 10 records per call; each call is billed.',
    'Result: JSON with meta and documents. meta.matched is a lower bound, '
        +'not a total. meta.coverage_percent below 100 means a partial '
        +'result. Empty documents means no match, not that the company or '
        +'person does not exist. A missing field means no stored value.',
].join('\n');

const query_desc = [
    'instant and smart: plain text, 1-200 characters, for example '
        +'"fintech startups in Berlin". ludicrous: a JSON object.',
    'Operators: {"and": [..]}, {"or": [..]}, {"not": cond}, '
        +'{"equals": {field: value}}, {"in": {field: [values]}}, '
        +'{"range": {field: {">=": n, "<=": n}}}, '
        +'{"text": {field: "words"}} or '
        +'{"text": {field: {"value": "words", "mode": "all"}}}.',
    'Example: {"and": [{"text": {"industry": "software"}}, '
        +'{"in": {"headquarters_country_code": ["US", "GB"]}}]}',
    'Company fields. text: name industry about slogan specialties '
        +'headquarters_location. equals/in: headquarters_country_code '
        +'funding_stage. equals: headquarters_city organization_type. in: '
        +'offices_country_codes offices_cities. range: employees_in_linkedin '
        +'company_size_from company_size_to funding_raised '
        +'linkedin_followers. range/equals: founded_year.',
    'People fields. text: name current_title about location '
        +'current_company_name current_company_industry past_job_titles '
        +'past_company_names certification_names education_schools '
        +'education_details all_text role company skill. equals/in: city '
        +'country_code linkedin_person_id. range: current_tenure_months '
        +'followers. range/equals/in: experience_years.',
    'Each field list belongs to one category.',
].join('\n');

const mode_desc = [
    'How the query runs. Default instant.',
    'instant: query is plain text. An AI planner turns it into filters and '
        +'ranks the matches. Use it for most questions.',
    'smart: as instant, then an AI reranks the best 50 matches for fit to '
        +'the question. Slower and costs more. Use it when the order '
        +'matters, for example "the best fit" or "the most relevant".',
    'ludicrous: query is a JSON object (see query). Exact filters, no AI, '
        +'fastest. Use it when you know the fields and values, when '
        +'instant gives wrong matches, or to page past 100 matches.',
].join('\n');

const view_desc = [
    'Which fields each record returns. Default summary.',
    'summary: the main fields.',
    '  company: company_id url name slogan about industry specialties '
        +'organization_type company_size_from company_size_to founded_year '
        +'headquarters_location headquarters_country_code offices_cities '
        +'linkedin_followers employees_in_linkedin funding_stage '
        +'funding_raised domain website logo scraped_at.',
    '  people: name url current_title current_company_name '
        +'current_tenure_months about past_job_titles location city '
        +'country_code experience_years followers connections.',
    'full: all fields, the summary fields plus others, for example the '
        +'fields below. Records are large: use limit 5 or less.',
    '  company: headquarters_city offices_country_codes offices_addresses '
        +'directions_urls alumni_count alumni_information '
        +'linkedin_follower_to_employee_ratio investor_names crunchbase_id '
        +'image linkedin_id.',
    '  people: first_name recommendations_count recommendations influencer '
        +'patent_count past_company_names education_schools '
        +'education_details certification_names languages '
        +'current_company_industry current_company_specialties '
        +'current_company_description current_company_slogan '
        +'current_company_headquarters current_company_country_code '
        +'current_company_size_from current_company_size_to '
        +'current_company_funding_stage current_company_funding_raised '
        +'avatar linkedin_num_id linkedin_person_id.',
    '{"fields": [..]}: only the named fields, any of the summary or full '
        +'fields of the category. The smallest result. Example for people: '
        +'{"fields": ["name", "url", "current_title", '
        +'"current_company_name"]}.',
].join('\n');

const view = z.union([z.enum(['summary', 'full']),
    z.object({fields: z.array(z.string()).min(1)}).strict()]);

export const business_search_schema = z.object({
    category: z.enum(['company', 'people'])
        .describe('company or people. Required.'),
    query: z.union([z.string().trim().min(1).max(200),
        z.record(z.string(), z.unknown())]).describe(query_desc),
    mode: z.enum(['instant', 'smart', 'ludicrous']).default('instant')
        .describe(mode_desc),
    view: view.default('summary').describe(view_desc),
    offset: z.number().int().min(0).max(1000).default(0)
        .describe('Records to skip, default 0. For the next page, add '
            +'limit to offset. instant and smart: offset+limit 100 or less. '
            +'ludicrous: offset 1000 or less.'),
    limit: z.number().int().min(1).max(10).default(10)
        .describe('Records per call, 1-10, default 10. With view full: 5 '
            +'or less.'),
}).strict().superRefine((args, ctx)=>{
    const issue = (path, rule)=>ctx.addIssue({code: z.ZodIssueCode.custom,
        path: [path], message: tool_error(rule, `mode ${args.mode}, `
            +`offset ${args.offset}, limit ${args.limit}`)});
    if ((typeof args.query=='string')==(args.mode=='ludicrous'))
        issue('query', ARG_RULES.query);
    if (args.mode!='ludicrous' && args.offset+args.limit>100)
        issue('offset', ARG_RULES.window);
    if (args.view=='full' && args.limit>5)
        issue('limit', ARG_RULES.full);
});

export const business_search_tool = ({tool_fn, headers, request})=>({
    name: 'business_search',
    description,
    annotations: {
        title: 'Business Search',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
    },
    parameters: business_search_schema,
    execute: tool_fn('business_search', async({category, ...body}, ctx)=>{
        const res = await request({
            url: `https://api.brightdata.com/search/${category}`,
            method: 'POST',
            data: body,
            timeout: BUSINESS_SEARCH_TIMEOUT_MS,
            headers: {
                ...headers(ctx, 'business_search'),
                'Content-Type': 'application/json',
            },
        }, ctx);
        return JSON.stringify(res.data);
    }, BUSINESS_SEARCH_RULES),
});
