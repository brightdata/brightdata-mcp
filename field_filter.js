'use strict'; /*jslint node:true es9:true*/

// Opt-in response shaping for the batch tools. Given a list of result objects
// and a list of field names, return only those top-level fields from each item
// so agent pipelines don't pay tokens for data they didn't ask for. Keys that
// would pollute the prototype are never copied, and non-object items collapse
// to {} so the output array stays uniform.
const PROTECTED_PROPS = new Set(['__proto__', 'constructor', 'prototype']);

export function filter_fields(results, fields){
    if (!fields || fields.length===0)
        return results;
    if (!Array.isArray(results))
        return results;
    const safe_fields = fields.filter(f=>!PROTECTED_PROPS.has(f));
    return results.map(item=>{
        if (item===null || typeof item!=='object')
            return {};
        return Object.fromEntries(safe_fields
            .filter(f=>Object.prototype.hasOwnProperty.call(item, f))
            .map(f=>[f, item[f]]));
    });
}
