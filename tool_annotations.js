'use strict'; /*jslint node:true es9:true*/
// One source of truth for MCP tool annotations.
//
// Every tool declares which kind of tool it is; the class supplies the three
// hints, so none can be omitted. An absent hint is not neutral: the MCP
// specification defaults destructiveHint and openWorldHint to true, so a
// partially annotated tool reads as more dangerous than it is.
//
// Values follow OpenAI's plugin-review definitions verbatim -- see
// devdocs/archaeology/scoped/4/desc.md for the quoted text and the per-tool
// reasoning.
import {log} from './logger.js';

export const REQUIRED_HINTS = ['readOnlyHint', 'openWorldHint',
    'destructiveHint'];

const cls = (readOnlyHint, openWorldHint, destructiveHint, why)=>
    Object.freeze({
        hints: Object.freeze({readOnlyHint, openWorldHint, destructiveHint}),
        why,
    });

export const ANNOTATION_CLASSES = Object.freeze({
    sync_fetch: cls(true, true, false,
        'Fetches from the public web and returns; nothing persists'),
    // OpenAI: set readOnlyHint false if the tool can "run jobs, start
    // workflows ... or otherwise change state". These create a billed
    // snapshot in the user's account, which nothing can un-create -- but they
    // harm nothing, so they are not destructive.
    //
    // DECISION for Bright Data: to take the user-perspective reading instead
    // ("it just fetches a record"), flip readOnlyHint here and EXPECTED
    // .job_start in test/annotations-coverage.test.js. Both edits, or the
    // tests fail.
    job_start: cls(false, true, false,
        'Starts a persistent, billed collection job; reads the public web'),
    closed_read: cls(true, false, false,
        'Reads Bright Data\'s own API or in-process state; closed world'),
    browser_read: cls(true, false, false,
        'Reads the current page of the browser session'),
    browser_navigate: cls(false, true, false,
        'Changes which public page the session shows; reversible'),
    browser_scroll: cls(false, false, false,
        'Changes the viewport of the current page; reversible'),
    browser_act: cls(false, true, true,
        'Clicks or types on an arbitrary third-party page and can submit '
        +'forms or transactions that cannot be undone'),
    browser_fill: cls(false, true, false,
        'Writes into fields of an arbitrary third-party page but never '
        +'submits; reversible until a click'),
});

// What a specification-following client assumes when hints are absent: the
// most cautious reading. Used only when a tool definition is wrong, so the
// mistake degrades safely at runtime instead of stopping a user's server.
const CONSERVATIVE = Object.freeze({readOnlyHint: false, openWorldHint: true,
    destructiveHint: true});

const config_log = log('config');

// Returns the annotations object for a tool. Never throws: a bad definition
// is a mistake to surface (a warning, a marked title, a failing test), not a
// reason to refuse to start -- the same treatment every other configuration
// problem gets here.
export function annotate(class_name, title){
    const has_title = typeof title=='string' && title.trim().length>0;
    const definition = ANNOTATION_CLASSES[class_name];
    if (!definition)
    {
        // The title suffix is load-bearing. CONSERVATIVE is the same triple
        // as browser_act, so on a click/type tool a mistyped class would
        // otherwise satisfy every value assertion and ship as a warning
        // nobody reads. Marked in the title, it is visible in every client.
        config_log.warn(`tool "${has_title ? title : '(untitled)'}" has `
            +`unknown annotation class "${class_name}"; using conservative `
            +`hints (valid: ${Object.keys(ANNOTATION_CLASSES).join(', ')})`);
        return {...has_title ? {title: `${title} [unclassified]`} : {},
            ...CONSERVATIVE};
    }
    if (!has_title)
    {
        // No title rather than a placeholder: an absent title fails the
        // completeness test, a placeholder would quietly pass it.
        config_log.warn(`tool annotations without a title `
            +`(class "${class_name}")`);
        return {...definition.hints};
    }
    return {title, ...definition.hints};
}
