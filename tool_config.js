'use strict'; /*jslint node:true es9:true*/

// Case-insensitive boolean env parse. Returns {value, recognized} so the caller
// can warn on an unrecognized non-empty value -- PRO_MODE=TRUE used to silently
// mean false because the check was a strict === 'true'. Deliberately accepts
// only true/false (any case): treating 1/yes/on as true would silently flip
// deployments that have those values set today, so they stay false and warn.
export function parse_bool_env(raw){
    if (raw===undefined || raw===null || String(raw).trim()==='')
        return {value: false, recognized: true};
    const v = String(raw).trim().toLowerCase();
    if (v==='true')
        return {value: true, recognized: true};
    if (v==='false')
        return {value: false, recognized: true};
    return {value: false, recognized: false};
}

// GROUPS entries that match no real group id (entries arrive lowercased).
export function find_unknown_groups(requested, valid_ids){
    const valid = new Set(valid_ids);
    return requested.filter(id=>!valid.has(id));
}

// TOOLS entries that match no known tool name, each with a case-insensitive
// suggestion when one exists (the registration gate matches case-sensitively,
// so "Search_Engine" silently contributes nothing -- surface it with
// "did you mean search_engine?").
export function find_unknown_tools(requested, known_names){
    const known = new Set(known_names);
    const by_lower = new Map([...known].map(n=>[n.toLowerCase(), n]));
    return requested
        .filter(t=>!known.has(t))
        .map(t=>({name: t,
            suggestion: by_lower.get(String(t).toLowerCase()) || null}));
}
