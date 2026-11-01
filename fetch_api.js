'use strict'; /*jslint node:true es9:true*/
import {redact_url_creds} from './safe_error.js';

export const fetch_dataset_id = 'gd_m6gjtfmeh43we6cqc';
export const fetch_formats = {markdown: 'markdown', text: 'html2text',
    html: 'page_html', ld_json: 'ld_json'};
const fallback_formats = ['markdown', 'text'];
const short_len = 100;
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
            +`page). Use the browser tools to open it. Details: `
            +details(record);
    case 'bad_cmd_arg':
        return `invalid_url: ${url} can't be fetched: IP addresses and local `
            +`hosts are not allowed. Use a public domain name.`;
    case 'bucket_rate_limit':
    case 'global_rate_limit':
        return `rate_limited: ${host(url)} is limiting requests. Wait about a `
            +`minute before fetching this site again.`;
    default:
        return `${record.error_code}: ${details(record)}`;
    }
};

const short_note = len=>`Note: only ${len} characters of text. If you `
    +'expected more, the page renders with JavaScript; use the browser tools.';

export const to_page = (record, format = 'markdown', snapshot_id)=>{
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
            +'needs JavaScript or blocked the request. Use the browser tools.'};
    }
    if (is_binary(content))
    {
        return {url, error: `unsupported_content: ${url} is a PDF or binary `
            +'file. This tool reads web pages only.'};
    }
    if (len<short_len && (format=='markdown' || format=='text'))
        notes.push(short_note(len));
    const page = {url};
    if (record.final_url && record.final_url!=url)
        page.final_url = record.final_url;
    if (record.page_title)
        page.title = record.page_title;
    Object.assign(page, {format, content});
    if (snapshot_id)
        page.snapshot_id = snapshot_id;
    page.other_formats = Object.keys(fetch_formats)
        .filter(f=>f!=format && field_text(record, f).trim());
    if (notes.length)
        page.note = notes.join('. ');
    return page;
};

export const timeout_error = url=>`timeout: ${url} did not load within `
    +'45 s. The page is likely blocked or very slow. Use the browser tools '
    +'to open it.';

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
    +'once; if it fails again, use the browser tools.';

export const header_snapshot_id = headers=>
    /filename="?(s[a-z]_[a-z0-9]+)/i
        .exec(headers?.['content-disposition']||'')?.[1];
