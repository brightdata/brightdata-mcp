'use strict'; /*jslint node:true es9:true*/
import {UserError} from 'fastmcp';
import {redact_url_creds} from './safe_error.js';

export const fetch_dataset_id = 'gd_m6gjtfmeh43we6cqc';
export const fetch_formats = {markdown: 'markdown', text: 'html2text',
    html: 'page_html', ld_json: 'ld_json'};
const fallback_formats = ['markdown', 'text'];
const short_len = 100;
export const max_chars = 100000;
export const single_max_chars = 200000;
export const batch_cancel_s = 35;
const details_len = 200;

const field_text = (record, format)=>{
    const value = record[fetch_formats[format]];
    if (value==null || Array.isArray(value) && !value.length)
        return '';
    return typeof value=='string' ? value : JSON.stringify(value);
};

const is_binary = text=>{
    if (text.startsWith('%PDF'))
        return true;
    const sample = text.slice(0, 2000);
    const bad = [...sample].filter(c=>c<'\t' || c>'\r' && c<' '
        || c=='�').length;
    return sample.length>0 && bad/sample.length>0.1;
};

const host = url=>{
    try { return new URL(url).hostname; } catch(e){ return url; }
};

const details = record=>
    redact_url_creds(String(record.error||'')).slice(0, details_len);

const record_error = (record, url)=>{
    switch (record.error_code)
    {
    case undefined:
    case null:
    case '':
        return null;
    case 'dead_page':
        return `page_not_found: ${url} does not exist (404). Check the URL; `
            +`retrying won't help.`;
    case 'proxy':
        return `fetch_failed: ${url} could not be fetched (blocked or empty `
            +`page). Details: `
            +details(record);
    case 'bad_cmd_arg':
        return `invalid_url: ${url} can't be fetched: IP addresses and local `
            +`hosts are not allowed. Use a public domain name.`;
    case 'aborted_page':
        return batch_timeout_error(url);
    case 'uncrawled_page':
        return `timeout: ${url} was not reached within ${batch_cancel_s} s. `
            +'Retry it in a smaller batch.';
    case 'bucket_rate_limit':
    case 'global_rate_limit':
        return `rate_limited: ${host(url)} is limiting requests. Wait about a `
            +`minute before fetching this site again.`;
    default:
        return `${record.error_code}: ${details(record)}`;
    }
};

const short_note = len=>`Note: only ${len} characters of text. If you `
    +'expected more, the page needs JavaScript.';

export const to_page = (record, format = 'markdown', max = max_chars)=>{
    const url = record.input?.url||record.url;
    const error = record_error(record, url);
    if (error)
        return {url, error};
    let content = field_text(record, format);
    const notes = [];
    const alt = !content.trim() && fallback_formats
        .find(f=>f!=format && field_text(record, f).trim());
    if (alt)
    {
        notes.push(`${format} is not available on this page; returned ${alt}`);
        format = alt;
        content = field_text(record, alt);
    }
    if (format=='markdown' && content.trim().length<short_len)
    {
        const text = field_text(record, 'text');
        if (text.trim().length>content.trim().length)
        {
            format = 'text';
            content = text;
            notes.push('markdown was nearly empty; showing plain text');
        }
    }
    const len = content.trim().length;
    if (!len)
    {
        return {url, error: `empty_page: ${url} returned no text. It probably `
            +'needs JavaScript or blocked the request.'};
    }
    if (is_binary(content))
    {
        return {url, error: `unsupported_content: ${url} is a PDF or binary `
            +'file. This tool reads web pages only.'};
    }
    if (len<short_len && (format=='markdown' || format=='text'))
        notes.push(short_note(len));
    if (content.length>max)
    {
        notes.push(`content cut to the first ${max} of `
            +`${content.length} characters`);
        content = content.slice(0, max);
    }
    const page = {url};
    if (record.final_url && record.final_url!=url)
        page.final_url = record.final_url;
    if (record.page_title)
        page.title = record.page_title;
    Object.assign(page, {format, content});
    if (notes.length)
        page.note = notes.join('. ');
    return page;
};

export const timeout_error = url=>`timeout: ${url} did not load within `
    +'45 s. The page is likely blocked or very slow.';

const body_text = data=>redact_url_creds(typeof data=='string' ? data
    : JSON.stringify(data?.errors ?? data)).slice(0, details_len);

export const request_error = (e, url)=>{
    if (!e?.isAxiosError)
        return null;
    if (e.code=='ERR_CANCELED')
        return timeout_error(url);
    const status = e.response?.status;
    if (!status)
    {
        return `network_error: could not reach Bright Data `
            +`(${e.code||'no response'}). Try again.`;
    }
    if (status==401)
        return 'auth_failed: Bright Data rejected the API key. Check API_TOKEN.';
    if (status==429)
    {
        return 'busy: Bright Data is handling too many requests from this '
            +'account. Wait 30 s before the next scrape.';
    }
    if (status>=500)
    {
        return `service_error: Bright Data returned HTTP ${status}. Try again `
            +'in a minute.';
    }
    if (status==400)
        return `invalid_url: ${url}: ${body_text(e.response.data)}`;
    return null;
};

export const no_data_error = url=>`no_data: ${url} returned nothing. Retry `
    +'once.';

export const batch_timeout_error = url=>`timeout: ${url} did not load `
    +`within ${batch_cancel_s} s. The page is likely blocked or very slow.`;

export const to_items = (urls, records, format)=>{
    const by_url = new Map(records.map(r=>[r.input?.url||r.url, r]));
    return urls.map(url=>by_url.has(url) ? to_page(by_url.get(url), format)
        : {url, error: no_data_error(url)});
};

export const batch_timing = {cancel_ms: batch_cancel_s*1000,
    deadline_ms: 57000, poll_ms: 1000};
const sleep = ms=>new Promise(done=>setTimeout(done, ms));

const batch_records = async(runner, snapshot_id, headers, timing, start)=>{
    const {cancel_ms, deadline_ms, poll_ms} = timing;
    let status;
    for (;;)
    {
        status = (await runner.progress(snapshot_id, headers)
            .catch(()=>null))?.status;
        if (status=='ready' || status=='failed'
            || Date.now()-start>=cancel_ms)
        {
            break;
        }
        await sleep(poll_ms);
    }
    if (status=='failed')
        return null;
    if (status!='ready')
        await runner.cancel(snapshot_id, headers).catch(()=>null);
    while (Date.now()-start<deadline_ms)
    {
        const res = await runner.results(snapshot_id, headers)
            .catch(()=>null);
        if (res?.status=='ready' || res?.status=='canceled')
            return res.data;
        await sleep(poll_ms);
    }
    return [];
};

export const batch_pages = async({runner, urls, format, headers,
    timing = batch_timing})=>
{
    const start = Date.now();
    let snapshot_id;
    try {
        snapshot_id = await runner.trigger({dataset_id: fetch_dataset_id,
            method: 'collect_by_url', headers,
            input: [...new Set(urls)].map(url=>({url}))});
    } catch(e){
        const error = request_error(e.cause, 'one of the URLs');
        throw error ? new UserError(error) : e;
    }
    const records = await batch_records(runner, snapshot_id, headers, timing,
        start);
    if (!records)
    {
        return urls.map(url=>({url, error: `fetch_failed: ${url}: the batch `
            +`job failed on Bright Data's side. Retry once.`}));
    }
    if (!records.length)
        return urls.map(url=>({url, error: batch_timeout_error(url)}));
    return to_items(urls, records, format);
};
