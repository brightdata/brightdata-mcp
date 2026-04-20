'use strict'; /*jslint node:true es9:true*/

function truncate_response(response_text, max_length = 300){
    if (typeof response_text != 'string')
        return '';
    const trimmed = response_text.trim();
    if (trimmed.length <= max_length)
        return trimmed;
    return `${trimmed.slice(0, max_length)}...`;
}

export function clean_google_search_payload(raw_data){
    const data = raw_data && typeof raw_data=='object' ? raw_data : {};
    const organic = Array.isArray(data.organic) ? data.organic : [];
    const organic_clean = organic
        .map(entry=>{
            if (!entry || typeof entry!='object')
                return null;
            const link = typeof entry.link=='string' ? entry.link.trim() : '';
            const title = typeof entry.title=='string'
                ? entry.title.trim() : '';
            const description = typeof entry.description=='string'
                ? entry.description.trim() : '';
            if (!link || !title)
                return null;
            return {link, title, description};
        })
        .filter(Boolean);
    return {organic: organic_clean};
}

export function parse_google_search_response(response_text, tool_name){
    try {
        return clean_google_search_payload(JSON.parse(response_text));
    } catch(e){
        const snippet = truncate_response(response_text);
        const details = snippet ? ` Response snippet: ${snippet}` : '';
        throw new Error(`Unexpected non-JSON response from Bright Data`
            +` for ${tool_name}.${details}`, {cause: e});
    }
}
