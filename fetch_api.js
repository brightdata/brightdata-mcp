'use strict'; /*jslint node:true es9:true*/
import {redact_url_creds} from './safe_error.js';

export const fetch_dataset_id = 'gd_m6gjtfmeh43we6cqc';
export const fetch_formats = {markdown: 'markdown', text: 'html2text',
    html: 'page_html', ld_json: 'ld_json'};
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
