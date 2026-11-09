'use strict'; /*jslint node:true es9:true*/
import {redact_url_creds} from './safe_error.js';

// Every error the agent sees: "<Title>: <what happened>. <what to do>
// Details: <details>". Rules are checked in order, first match wins:
// account rules, then the tool's own rules, then the defaults.
export const ACCOUNT_RULES = [
    {brd_code: 'client_10100', title: 'Usage limit reached',
        what: 'The Bright Data account is out of free credits or funds, '
            +'or the zone hit a limit set on it',
        todo: 'Tell the user to check billing (https://brightdata.com/cp/'
            +'billing) and zone limits (https://brightdata.com/cp/zones). '
            +'Don\'t retry.'},
    {details: /zone ".*" not found/, title: 'Zone not found',
        what: 'The Bright Data zone this tool uses doesn\'t exist',
        todo: 'Tell the user to create it or fix the zone setting; '
            +'retrying won\'t help.'},
    {status: [401, 407], title: 'Sign-in failed',
        what: 'Bright Data didn\'t accept the credentials',
        todo: 'Ask the user to reconnect Bright Data or check their API '
            +'token.'},
];

export const DEFAULT_RULES = [
    {kind: 'timeout', title: 'Timed out',
        what: 'The request didn\'t finish in time', todo: 'Retry once.'},
    {kind: 'network', title: 'Connection failed',
        what: 'Couldn\'t connect to Bright Data\'s service',
        todo: 'Try again in a few seconds.'},
    {status: 429, title: 'Rate limited', what: 'Too many requests right now',
        todo: 'Wait a few seconds, then retry.'},
    {status: 400, title: 'Request rejected',
        what: 'Bright Data rejected the request',
        todo: 'Read the details, fix the input, then retry.'},
    {status: '4xx', title: 'Request refused',
        what: 'Bright Data refused the request',
        todo: 'Read the details. Don\'t retry the same request.'},
    {status: '5xx', title: 'Service unavailable',
        what: 'Bright Data\'s service is temporarily unavailable',
        todo: 'Try again in about 30 seconds. If it keeps failing, tell the '
            +'user the service is down.'},
    {title: 'Tool error', what: 'The tool failed unexpectedly',
        todo: 'Retry once. If it fails again, tell the user.'},
];

const details_len = 300;
const match_keys = ['kind', 'status', 'brd_code', 'page', 'step', 'reason',
    'details'];

const json_text = body=>{
    const nested = [].concat(body.details??[], body.errors??[])
        .map(d=>Array.isArray(d) ? d.join(': ') : d?.message??d)
        .filter(d=>typeof d=='string');
    const top = [body.error, body.message].filter(t=>typeof t=='string');
    return top.length || nested.length
        ? [...top, nested.join('; ')].filter(Boolean).join(': ')
        : JSON.stringify(body);
};

const parse_json = text=>{
    try { return JSON.parse(text); } catch(e){ return null; }
};

const body_text = body=>{
    const parsed = typeof body=='string' && body.trim().startsWith('{')
        ? parse_json(body) : null;
    if (parsed)
        return json_text(parsed);
    if (typeof body=='string')
        return body.trim();
    return body && typeof body=='object' ? json_text(body) : '';
};

const clean = text=>redact_url_creds(text).slice(0, details_len);

const is_timeout = e=>['ERR_CANCELED', 'ECONNABORTED'].includes(e?.code)
    || e?.name=='TimeoutError';

export const read_error = e=>{
    const ax = e?.response ? e : e?.cause?.response ? e.cause : null;
    const status = ax?.response.status;
    const kind = is_timeout(e) || is_timeout(e?.cause) ? 'timeout'
        : status ? 'http'
        : e?.isAxiosError || e?.cause?.isAxiosError ? 'network' : 'other';
    const details = body_text(ax?.response.data)
        || (status ? `HTTP ${status}` : String(e?.message||e||'no details'));
    return {kind, status, brd_code: ax?.response.headers?.['x-brd-err-code'],
        step: e?.step, reason: e?.reason, details: clean(details)};
};

export const read_record = record=>({kind: 'page', page: record.error_code,
    details: clean(String(record.error||record.error_code))});

const status_matches = (want, have)=>typeof want=='string'
    ? String(have??'')[0]==want[0] : want==have;

const field_matches = (key, want, facts)=>{
    if (want instanceof RegExp)
        return want.test(facts[key]??'');
    if (key=='status')
        return [].concat(want).some(w=>status_matches(w, facts.status));
    return want==facts[key];
};

const matches = (rule, facts)=>match_keys
    .every(key=>!(key in rule) || field_matches(key, rule[key], facts));

const host_of = url=>{
    try { return new URL(url).hostname; } catch(e){ return url; }
};

const fill = (text, vars)=>text.replace(/\{(\w+)\}/g,
    (all, name)=>vars[name]??all);

export const tool_error = (rule, details, vars = {})=>{
    const all = vars.url ? {host: host_of(vars.url), ...vars} : vars;
    return `${rule.title}: ${fill(rule.what, all)}. ${fill(rule.todo, all)}`
        +(rule.no_details ? '' : ` Details: ${details}`);
};

export const describe = (facts, rules = [], vars = {})=>{
    const rule = [...ACCOUNT_RULES, ...rules, ...DEFAULT_RULES]
        .find(r=>matches(r, facts));
    return tool_error(rule, facts.details, vars);
};

export const api_error = (e, rules, vars)=>
    describe(read_error(e), rules, vars);
