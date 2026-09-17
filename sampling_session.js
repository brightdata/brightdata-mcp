'use strict'; /*jslint node:true es9:true*/

// Choose which connected session to route an MCP sampling request to.
//
// server.sessions is fastmcp's FastMCPSession[]; each has a .sessionId getter
// (populated on HTTP transports, undefined on stdio) and a .requestSampling
// method. ctx.sessionId is the Mcp-Session-Id of the calling request -- present
// on HTTP transports, undefined on stdio -- and equals the originating
// session's .sessionId (both read the same underlying field).
//
// This never picks a session by array position among several; selecting [0]
// would sample from an arbitrary other client, which is the cross-tenant leak
// this replaces. When the caller cannot be identified, it refuses rather than
// guesses.
export function select_sampling_session(sessions, sessionId){
    if (!sessions || sessions.length===0)
    {
        throw new Error('No active MCP session is available to run the '
            +'extraction. The extract tool needs a connected client that '
            +'supports sampling.');
    }

    if (sessionId!==undefined && sessionId!==null)
    {
        const match = sessions.find(s=>s.sessionId===sessionId);
        if (match)
            return match;
        // The caller identified itself but no session matches -- refuse rather
        // than route the request (and its scraped content) to another client.
        throw new Error(`Could not match the calling session (id `
            +`"${sessionId}") to an active session; refusing to route the `
            +`sampling request to a different client.`);
    }

    // No session id -- stdio, or a transport that did not supply one.
    if (sessions.length===1)
        return sessions[0];

    // Several sessions and nothing to disambiguate them: picking one would risk
    // answering a different user. Fail loudly instead of guessing.
    throw new Error(`${sessions.length} MCP sessions are connected but the `
        +`request carries no session id, so the calling client cannot be `
        +`identified; refusing to guess which client to sample from.`);
}
