'use strict'; /*jslint node:true es9:true*/

// Pure helpers for the geo_fanout tool: validating the list of country exits
// and turning a set of per-geo results into a single structured report where a
// blocked / redirected / failed geo is a FIRST-CLASS classified result, not a
// discarded error. No network or transport dependencies live here so the fanout
// aggregation logic is unit-testable in isolation.

import {classify_response, OUTCOME} from './retry_utils.js';

// Per-geo status the caller sees in the aggregated report.
export const GEO_STATUS = {
    OK: 'ok',               // fetched successfully
    BLOCKED: 'blocked',     // target refused this geo (403/451)
    REDIRECTED: 'redirected', // 3xx to a different host/path (geo gating signal)
    RATE_LIMITED: 'rate_limited',
    ERROR: 'error',         // transient/fatal failure after retries
};

// Map the Unlocker's JSON envelope to the shape build_geo_entry expects.
// When the /request endpoint is called with format:'json', the gateway always
// answers HTTP 200 and the TARGET's real result lives in the JSON body:
//   {status_code, headers, body}
// where status_code is the target's HTTP status and headers are the target's
// response headers (lowercased keys). The previous format:'raw' path only ever
// exposed the gateway's 200, so a target 403/451/3xx was misclassified as ok.
// This helper isolates that mapping so the real envelope shape is unit-testable.
// Tolerant of a missing / non-object / string-but-JSON input: a value with no
// recognizable status yields {status:null} and classify_response then treats it
// as a transport-level failure rather than a silent success.
export function parse_unlocker_json(data){
    let obj = data;
    if (typeof obj=='string')
    {
        try { obj = JSON.parse(obj); }
        catch(e){ obj = null; }
    }
    if (!obj || typeof obj!='object')
        return {status: null, headers: undefined, body: undefined};
    const status = typeof obj.status_code=='number'
        && Number.isFinite(obj.status_code) ? obj.status_code : null;
    const headers = obj.headers && typeof obj.headers=='object'
        ? obj.headers : undefined;
    return {status, headers, body: obj.body};
}

// Validate and normalize a list of 2-letter ISO country codes. Lowercases,
// trims, dedupes (preserving first-seen order), and rejects malformed entries
// loudly so a typo never becomes a silently-dropped exit. Returns the clean
// array; throws Error on any invalid code (callers want fast, explicit failure).
export function normalize_geos(geos){
    if (!Array.isArray(geos) || geos.length===0)
        throw new Error('geos must be a non-empty array of 2-letter codes');
    const seen = new Set();
    const out = [];
    for (const raw of geos)
    {
        if (typeof raw!='string')
            throw new Error(`invalid geo (not a string): ${JSON.stringify(raw)}`);
        const code = raw.trim().toLowerCase();
        if (!/^[a-z]{2}$/.test(code))
            throw new Error(`invalid geo country code: "${raw}" `
                +`(expected 2 letters, e.g. "us", "de")`);
        if (seen.has(code))
            continue;
        seen.add(code);
        out.push(code);
    }
    return out;
}

// Detect whether a successful-looking response is actually a geo redirect.
// A 3xx with a Location header pointing at a different host is the classic
// "Belgian visitor bounced to a different storefront" signal we must capture.
function detect_redirect(status, headers, request_url){
    if (!(status>=300 && status<400))
        return null;
    const location = read_header(headers, 'location');
    if (!location)
        return {redirected: true, location: null, cross_host: false};
    let cross_host = false;
    try {
        const from = new URL(request_url);
        const to = new URL(location, request_url);
        cross_host = from.host!==to.host;
    } catch(e){
        cross_host = false;
    }
    return {redirected: true, location, cross_host};
}

function read_header(headers, name){
    if (!headers || typeof headers!='object')
        return undefined;
    const target = name.toLowerCase();
    for (const key of Object.keys(headers))
    {
        if (key.toLowerCase()===target)
            return headers[key];
    }
    return undefined;
}

// Map one classified outcome to the per-geo report status.
function outcome_to_geo_status(outcome){
    switch (outcome)
    {
    case OUTCOME.SUCCESS: return GEO_STATUS.OK;
    case OUTCOME.REDIRECT: return GEO_STATUS.REDIRECTED;
    case OUTCOME.BLOCKED: return GEO_STATUS.BLOCKED;
    case OUTCOME.RATE_LIMITED: return GEO_STATUS.RATE_LIMITED;
    default: return GEO_STATUS.ERROR;
    }
}

// Build the per-geo entry for a single settled attempt. `attempt` is the
// normalized shape produced by the tool's executor:
//   {geo, url, response:{status, headers, exit_ip?}, body?}  on a completed
//       request (status/headers are the TARGET's, parsed from the Unlocker
//       format:'json' envelope, NOT the gateway's 200), or
//   {geo, url, error:{code?, response?}}                     on a thrown failure.
// `now_ms` is injectable for deterministic Retry-After math under test.
export function build_geo_entry(attempt, now_ms = Date.now()){
    const obj = attempt && typeof attempt=='object' ? attempt : {};
    const geo = typeof obj.geo=='string' ? obj.geo : 'unknown';
    const url = typeof obj.url=='string' ? obj.url : null;
    // Normalize to the shape classify_response understands: a thrown error keeps
    // its {error} envelope; a completed request passes its {status, headers}.
    const classify_input = obj.error ? {error: obj.error}
        : (obj.response || {});
    const classification = classify_response(classify_input, now_ms);
    const status = classification.status;
    const headers = obj.response ? obj.response.headers
        : (obj.error && obj.error.response
            ? obj.error.response.headers : undefined);
    // exit_ip is best-effort: the Unlocker format:'json' envelope carries the
    // target's headers, not the gateway's x-brd-* headers, so the exit IP is not
    // observable on this path. We surface whatever the executor explicitly
    // supplied (none, today) and otherwise null; we never fabricate an IP.
    const exit_ip = obj.response
        && typeof obj.response.exit_ip=='string'
        ? obj.response.exit_ip : null;

    const redirect = detect_redirect(status, headers, url);
    let geo_status = outcome_to_geo_status(classification.outcome);
    if (redirect && redirect.redirected)
        geo_status = GEO_STATUS.REDIRECTED;

    const entry = {
        geo,
        url,
        status: geo_status,
        http_status: status,
        exit_ip,
        outcome: classification.outcome,
        retry_after_ms: classification.retry_after_ms,
        reason: classification.reason,
        redirect: redirect || null,
    };
    // The rendered target body (markdown or raw) when the executor captured one.
    // Kept out of the entry entirely when absent so an error/blocked geo is not
    // padded with an empty string that reads like real content.
    if (obj.body!==undefined)
        entry.body = obj.body;
    return entry;
}

// Aggregate all per-geo entries into one report. Every geo appears exactly once
// regardless of success/failure; nothing is dropped. The summary makes the
// "this geo was blocked / redirected" fact queryable at a glance.
export function summarize_fanout(entries){
    const list = Array.isArray(entries) ? entries : [];
    const summary = {
        total: list.length,
        ok: 0,
        blocked: 0,
        redirected: 0,
        rate_limited: 0,
        error: 0,
    };
    for (const e of list)
    {
        switch (e.status)
        {
        case GEO_STATUS.OK: summary.ok++; break;
        case GEO_STATUS.BLOCKED: summary.blocked++; break;
        case GEO_STATUS.REDIRECTED: summary.redirected++; break;
        case GEO_STATUS.RATE_LIMITED: summary.rate_limited++; break;
        default: summary.error++; break;
        }
    }
    return {
        summary,
        any_blocked: summary.blocked>0,
        any_redirected: summary.redirected>0,
        results: list,
    };
}
