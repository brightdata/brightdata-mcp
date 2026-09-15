'use strict'; /*jslint node:true es9:true*/
// What a failed upstream request should say to a model.
//
// When an endpoint refuses a request it explains why in the body, and that
// explanation is the only thing the model has to correct itself with. Ask the
// marketplace for a dataset it does not serve and it answers with the list of
// the ones it does; that sentence is worth more than the status code.
//
// Bodies do not arrive in one shape. An HTTP client parses by Content-Type:
// text/* arrives as a string, application/json as a parsed object. Both can be
// useful and both can be noise, so the rule is about the CONTENT, never the
// type:
//
//   - a short sentence is exactly what the model needs      -> keep it
//   - a JSON error envelope holds that sentence in a field  -> extract it
//   - an HTML page or an oversized blob is a debug artefact -> summarise it
//
// Shapes verified against the live API (2026-09-09/10):
//
//   text/html        "dataset does not exist"
//   text/html        'zone "mcp_probe_nonexistent_zone" not found'
//   text/html        "Dataset not found"
//   application/json {"validation_errors":["\"dataset_id\" must be one of
//                     [gd_me5ppxjr2ge6icjuh0, gd_l1viktl72bvl7bjuj0, ...]"]}
//   application/json {"error":"invalid_request","error_description":"..."}
//
// The bound exists for the shapes we have not seen: a proxy's HTML error page,
// a stack trace, a vendor envelope carrying request identifiers.

export const MAX_MESSAGE = 300;

// Fields carrying a human-readable reason, in the order they are preferred.
const MESSAGE_FIELDS = ['error_description', 'message', 'error', 'detail',
    'reason'];

export function clip(text, max = MAX_MESSAGE){
    const value = String(text ?? '').trim();
    return value.length<=max ? value : value.slice(0, max-1)+'…';
}

// Pulls the one sentence worth passing on out of whatever the body is.
// Returns '' when the body has nothing a reader could act on.
export function extract_message(body){
    if (typeof body=='string')
    {
        const text = body.trim();
        // An HTML page is a server's debug output, not a message to a user.
        if (!text || /^\s*</.test(text))
            return '';
        // Several tools request responseType: 'text', so a JSON error body
        // arrives here as a string. Parse it so the sentence inside is what
        // the model sees, rather than the envelope around it.
        if (/^[[{]/.test(text))
        {
            try {
                const parsed = JSON.parse(text);
                const message = extract_message(parsed);
                if (message)
                    return message;
            } catch { /* not JSON after all; fall through */ }
        }
        return clip(text);
    }
    if (body && typeof body=='object')
    {
        if (Array.isArray(body.validation_errors) && body.validation_errors.length)
            return clip(body.validation_errors.map(String).join('; '));
        for (const field of MESSAGE_FIELDS)
        {
            if (typeof body[field]=='string' && body[field].trim())
                return clip(body[field]);
        }
        // An unfamiliar envelope: bounded JSON still beats nothing, and it is
        // how we learn about a shape worth adding above.
        try {
            const json = JSON.stringify(body);
            return json && json!='{}' ? clip(json) : '';
        } catch { return ''; }
    }
    return '';
}

// The full line a tool shows the model for a failed upstream response.
export function summarize_upstream(response){
    const status = response?.status;
    const prefix = status ? `HTTP ${status}` : 'Upstream request failed';
    const message = extract_message(response?.data);
    if (message)
        return `${prefix}: ${message}`;
    const status_text = String(response?.statusText ?? '').trim();
    return status_text ? `${prefix}: ${status_text}` : prefix;
}
