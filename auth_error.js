'use strict'; /*jslint node:true es9:true*/

// Leaf module: imports nothing from server.js, so browser_tools.js can use it
// without creating an import cycle (server.js imports browser_tools.js).

export const AUTH_HINT = 'auth_rejected';

const DASHBOARD_URL = 'https://brightdata.com/cp/setting/users';

// The server's memory of its own credential state. Written once at startup by
// mark_credential_verified(); read when rendering an authentication error.
// It licenses exactly one claim: that the credential's validity CHANGED while
// the server was running. It never licenses "you rotated your key" -- deleting
// a zone or revoking a permission produces the same verified-then-rejected
// evidence.
let credential_state = {verified_at: null};

export const mark_credential_verified = ()=>{
    credential_state.verified_at = Date.now();
};

export const get_credential_state = ()=>({...credential_state});

export const is_auth_rejection = e=>e?.response?.status===401;

// Pure: takes a credential state, returns the message text. No I/O, no globals
// -- this repository has no HTTP mocking, so a pure renderer is the only shape
// in which the "never reports 'Token expired'" criterion is testable at all.
export function render_auth_error({verified_at}={}){
    let lines = [
        `[brightdata_hint: ${AUTH_HINT}]`,
        'Bright Data rejected this token (HTTP 401).',
    ];
    if (verified_at)
    {
        lines.push('This server verified the same token at startup, so its'
            +' validity changed while the server was running.');
        lines.push('The server cannot tell whether your mcp.json holds a token'
            +' you have already replaced, or whether the running process holds'
            +' one you have since rotated -- check whether the token in'
            +' mcp.json matches the one in your dashboard.');
        lines.push('Either way, correct mcp.json if needed and restart the MCP'
            +' client.');
    }
    else
    {
        lines.push('This server has not verified this token since startup, so'
            +' it cannot tell you whether the token changed or was never'
            +' valid.');
        lines.push('Check the token in mcp.json against your dashboard,'
            +' correct it if needed, and restart the MCP client.');
    }
    lines.push(`Verify the token at ${DASHBOARD_URL}`);
    return lines.join(' ');
}

export const auth_error = ()=>new Error(render_auth_error(credential_state));
