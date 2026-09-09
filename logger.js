'use strict'; /*jslint node:true es9:true*/
// One channel for every server diagnostic.
//
// Two invariants:
//   1. Everything goes to stderr. On the stdio transport stdout carries the
//      MCP protocol itself, so a stray stdout write corrupts the session.
//   2. Every line starts with a scope tag -- [config], [zone], [server],
//      [browser], [discover], [web_data_amazon_product] -- so tests and the
//      hosted wrapper can filter on structure instead of matching free text.
//
// LOG_LEVEL (silent|error|warn|info|debug, default info) sets the threshold.
// Levels gate emission only: a message is printed exactly as the call site
// wrote it, printf placeholders included, so the lines this replaces stay
// byte-identical apart from the scope tag.

export const LOG_LEVELS = ['silent', 'error', 'warn', 'info', 'debug'];
const RANK = {silent: -1, error: 0, warn: 1, info: 2, debug: 3};
const DEFAULT_LEVEL = 'info';

const requested = String(process.env.LOG_LEVEL ?? '').trim().toLowerCase();
const recognized = !requested || RANK[requested]!==undefined;
const threshold = recognized && requested ? RANK[requested] : RANK[DEFAULT_LEVEL];

function emit(level, scope, args){
    if (RANK[level]>threshold)
        return;
    const [first, ...rest] = args;
    if (typeof first=='string')
        console.error(`[${scope}] ${first}`, ...rest);
    else
        console.error(`[${scope}]`, ...args);
}

const cache = new Map();

// log('zone').info('...') -- the returned object is memoized per scope, so
// binding one per tool call costs nothing.
export function log(scope){
    let bound = cache.get(scope);
    if (bound)
        return bound;
    bound = {
        error: (...args)=>emit('error', scope, args),
        warn: (...args)=>emit('warn', scope, args),
        info: (...args)=>emit('info', scope, args),
        debug: (...args)=>emit('debug', scope, args),
    };
    cache.set(scope, bound);
    return bound;
}

// A mistyped level is a configuration problem, not a reason to go quiet:
// fall back to the default and say so once, through the channel it configures.
if (!recognized)
{
    log('config').warn(`unrecognized LOG_LEVEL "${process.env.LOG_LEVEL}"; `
        +`using "${DEFAULT_LEVEL}" (valid: ${LOG_LEVELS.join(', ')})`);
}
