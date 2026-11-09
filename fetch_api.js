'use strict'; /*jslint node:true es9:true*/
import {UserError} from 'fastmcp';
import {api_error, describe, read_record} from './errors.js';

export const fetch_dataset_id = 'gd_m6gjtfmeh43we6cqc';
export const fetch_formats = {markdown: 'markdown', text: 'html2text',
    html: 'page_html', ld_json: 'ld_json'};
const fallback_formats = ['markdown', 'text'];
const short_len = 100;
export const max_chars = 40000;
export const batch_cancel_s = 35;

const field_text = (record, format)=>{
    const value = record[fetch_formats[format]];
    if (value==null || Array.isArray(value) && !value.length)
        return '';
    return typeof value=='string' ? value : JSON.stringify(value);
};

const host_re = /^(\w+:\/\/)([^/?#]+)/;

export const ascii_url = url=>{
    const host = url.match(host_re)?.[2];
    if (!host || /^[ -~]*$/.test(host))
        return url;
    try { return url.replace(host_re, `$1${new URL(url).host}`); }
    catch(e){ return url; }
};

export const with_url = (record, url)=>({...record,
    input: {...record.input, url}});

const garbled_note = content=>{
    const count = content.split('\ufffd').length-1;
    return count/content.length>0.02 ? `${count} characters could not be `
        +'decoded: the site\'s character encoding was misread, so non-Latin '
        +'text is garbled' : null;
};

const is_binary = text=>{
    if (text.startsWith('%PDF'))
        return true;
    const sample = text.slice(0, 2000);
    const bad = [...sample].filter(c=>c<'\t' || c>'\r' && c<' ').length;
    return sample.length>0 && bad/sample.length>0.1;
};

export const FETCH_RULES = [
    {kind: 'timeout', title: 'Page timed out',
        what: '{url} did not load within 45 s',
        todo: 'The page is likely blocked or very slow.'},
    {status: 400, title: 'URL rejected',
        what: 'Bright Data rejected the request for {url}',
        todo: 'Read the details. Check the URL and retry.'},
];

export const site_not_found = {details: /could not resolve host/i,
    title: 'Site not found', what: '{host} doesn\'t resolve',
    todo: 'Check the URL spelling; retrying won\'t help.'};

export const PAGE_RULES = [
    site_not_found,
    {page: 'dead_page', title: 'Page not found',
        what: '{url} does not exist (404)',
        todo: 'Check the URL; retrying won\'t help.'},
    {page: 'proxy', title: 'Fetch failed', what: '{url} could not be fetched',
        todo: 'The site blocked the request or the page was empty. Retry '
            +'once; if it fails again, use another source.'},
    {page: 'bad_cmd_arg', title: 'URL not allowed',
        what: '{url} is an IP address or a local host',
        todo: 'Use a public domain name.'},
    {page: 'aborted_page', title: 'Page timed out',
        what: `{url} did not load within ${batch_cancel_s} s`,
        todo: 'The page is likely blocked or very slow.'},
    {page: 'uncrawled_page', title: 'Page timed out',
        what: `{url} was not reached within ${batch_cancel_s} s`,
        todo: 'Retry it in a smaller batch.'},
    {page: /^(bucket|global)_rate_limit$/, title: 'Site rate limited',
        what: '{host} is limiting requests',
        todo: 'Wait about a minute before fetching this site again.'},
    {page: 'empty_page', title: 'Empty page', what: '{url} returned no text',
        todo: 'It probably needs JavaScript or blocked the request.'},
    {page: 'binary', title: 'Not a web page',
        what: '{url} is a PDF or binary file',
        todo: 'This tool reads web pages only.'},
    {page: 'no_data', title: 'No data', what: '{url} returned nothing',
        todo: 'Retry once.'},
    {kind: 'page', title: 'Fetch failed', what: '{url} could not be fetched',
        todo: 'Read the details. Retry once.'},
];

export const BATCH_RULES = [
    {reason: 'batch_failed', title: 'Batch failed',
        what: 'The batch job failed on Bright Data\'s side',
        todo: 'Retry once.'},
    {reason: 'batch_timeout', title: 'Batch timed out',
        what: `No page finished within ${batch_cancel_s} s`,
        todo: 'The pages are likely blocked or very slow. Retry with fewer '
            +'URLs.'},
    {status: 400, title: 'Batch rejected',
        what: 'Bright Data rejected the batch',
        todo: 'Read the details. Check the URLs and retry.'},
];

const batch_error = (reason, details)=>new UserError(describe({kind: 'other',
    reason, details}, BATCH_RULES));

export const page_error = (page, url, details)=>
    describe({kind: 'page', page, details}, PAGE_RULES, {url});

const short_note = len=>`Note: only ${len} characters of text. If you `
    +'expected more, the page needs JavaScript.';

export const to_page = (record, format = 'markdown', max = max_chars)=>{
    const url = record.input?.url||record.url;
    if (record.error_code)
        return {url, error: describe(read_record(record), PAGE_RULES, {url})};
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
        return {url, error: page_error('empty_page', url,
            `no text in ${format}`)};
    }
    if (is_binary(content))
    {
        return {url, error: page_error('binary', url,
            'the content is not text')};
    }
    const garbled = garbled_note(content);
    if (garbled)
        notes.push(garbled);
    if (len<short_len && (format=='markdown' || format=='text'))
        notes.push(short_note(len));
    if (content.length>max)
    {
        notes.push(`content cut to the first ${max} of `
            +`${content.length} characters`);
        content = content.slice(0, max);
    }
    const page = {url};
    if (record.page_title)
        page.title = record.page_title;
    Object.assign(page, {format, content});
    if (notes.length)
        page.note = notes.join('. ');
    return page;
};

export const to_items = (urls, records, format)=>{
    const by_url = new Map(records.map(r=>[r.input?.url||r.url, r]));
    return urls.map(url=>{
        const record = by_url.get(ascii_url(url));
        return record ? to_page(with_url(record, url), format)
            : {url, error: page_error('no_data', url, 'no record for this '
                +'URL')};
    });
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
            input: [...new Set(urls.map(ascii_url))].map(url=>({url}))});
    } catch(e){
        throw new UserError(api_error(e, BATCH_RULES));
    }
    const records = await batch_records(runner, snapshot_id, headers, timing,
        start);
    if (!records)
    {
        throw batch_error('batch_failed', 'snapshot status: failed');
    }
    if (!records.length)
        throw batch_error('batch_timeout', 'no results before the deadline');
    return to_items(urls, records, format);
};
