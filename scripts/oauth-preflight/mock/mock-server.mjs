'use strict'; /*jslint node:true es9:true*/
// A local stand-in for Bright Data's authorization server and MCP endpoint,
// used only to rehearse the pre-flight scripts before they are pointed at
// production. It implements enough of RFC 8414 / 7591 / 6749 / 8707 to drive
// the real client code, and it can be told to behave like the production
// server does in the two ways that matter:
//
//   MOCK_RFC7592=off   -- registration returns no management URI, so the
//                         reversibility probe must report "not self-service"
//   MOCK_LOGIN=auto    -- the authorize endpoint redirects immediately with a
//                         code instead of showing a login page, so the flow
//                         can run unattended
import {createServer} from 'node:http';
import {randomUUID, createHash} from 'node:crypto';

const PORT = Number(process.env.MOCK_PORT || 9099);
const BASE = `http://127.0.0.1:${PORT}`;
const SUPPORTS_7592 = process.env.MOCK_RFC7592 !== 'off';
const AUTO_LOGIN = process.env.MOCK_LOGIN === 'auto';
// Mimic production: only a redirect host allowlist decides acceptance.
const ALLOWED_REDIRECT_HOSTS = (process.env.MOCK_ALLOWED_HOSTS
    || 'chatgpt.com,localhost,127.0.0.1').split(',');

const clients = new Map();
const codes = new Map();
const tokens = new Map();
const log = (...a)=>console.log('   [mock]', ...a);

function json(res, status, body, headers = {}){
    const payload = JSON.stringify(body);
    res.writeHead(status, {'content-type': 'application/json', ...headers});
    res.end(payload);
}

function base64url(input){
    return Buffer.from(input).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function make_jwt(claims){
    const header = base64url(JSON.stringify({alg: 'RS256', typ: 'JWT',
        kid: 'mock-key-1'}));
    const payload = base64url(JSON.stringify(claims));
    return `${header}.${payload}.${base64url('mock-signature-not-verifiable')}`;
}

const server = createServer(async(req, res)=>{
    const url = new URL(req.url, BASE);
    const path = url.pathname;

    // ---- RFC 8414 discovery -------------------------------------------
    if (path === '/.well-known/oauth-authorization-server')
    {
        return json(res, 200, {
            issuer: BASE,
            authorization_endpoint: `${BASE}/authorize`,
            token_endpoint: `${BASE}/token`,
            registration_endpoint: `${BASE}/register`,
            jwks_uri: `${BASE}/jwks`,
            response_types_supported: ['code'],
            grant_types_supported: ['authorization_code', 'refresh_token'],
            code_challenge_methods_supported: ['S256'],
            token_endpoint_auth_methods_supported: ['none'],
            scopes_supported: ['mcp'],
            resource_parameter_supported: true,
        });
    }
    if (path === '/.well-known/oauth-protected-resource'
        || path === '/.well-known/oauth-protected-resource/mcp')
    {
        return json(res, 200, {
            resource: `${BASE}/mcp`,
            authorization_servers: [BASE],
            scopes_supported: ['mcp'],
            bearer_methods_supported: ['header'],
        });
    }

    // ---- RFC 7591 dynamic client registration -------------------------
    if (path === '/register' && req.method === 'POST')
    {
        const body = JSON.parse(await read_body(req) || '{}');
        if (!Array.isArray(body.redirect_uris) || !body.redirect_uris.length)
        {
            return json(res, 400, {error: 'invalid_request',
                error_description: 'redirect_uris is required and must be a '
                    +'non-empty array of strings'});
        }
        const bad = body.redirect_uris.find(uri=>{
            try { return !ALLOWED_REDIRECT_HOSTS.includes(new URL(uri).hostname); }
            catch { return true; }
        });
        if (bad)
        {
            return json(res, 400, {error: 'invalid_redirect_uri',
                error_description: `redirect_uri not permitted: ${bad}`});
        }
        const client_id = `mock-client-${randomUUID()}`;
        const record = {client_id, ...body,
            token_endpoint_auth_method: 'none',
            client_id_issued_at: Math.floor(Date.now()/1000)};
        if (SUPPORTS_7592)
        {
            record.registration_client_uri = `${BASE}/register/${client_id}`;
            record.registration_access_token = `mock-rat-${randomUUID()}`;
        }
        clients.set(client_id, record);
        log(`registered ${client_id} (${body.redirect_uris.join(', ')})`);
        return json(res, 201, record);
    }
    if (path.startsWith('/register/') && req.method === 'DELETE')
    {
        const client_id = path.slice('/register/'.length);
        const record = clients.get(client_id);
        const auth = req.headers.authorization || '';
        if (!record || auth !== `Bearer ${record.registration_access_token}`)
            return json(res, 401, {error: 'invalid_token'});
        clients.delete(client_id);
        log(`deleted ${client_id}`);
        res.writeHead(204).end();
        return;
    }

    // ---- Authorization endpoint ---------------------------------------
    if (path === '/authorize')
    {
        const p = url.searchParams;
        const client = clients.get(p.get('client_id'));
        if (!client)
        {
            return json(res, 400, {error: 'invalid_client',
                error_description: 'Unknown client_id'});
        }
        if (!client.redirect_uris.includes(p.get('redirect_uri')))
        {
            return json(res, 400, {error: 'invalid_request',
                error_description: 'redirect_uri mismatch'});
        }
        if (p.get('code_challenge_method') !== 'S256')
        {
            return json(res, 400, {error: 'invalid_request',
                error_description: 'code_challenge_method must be S256'});
        }
        const code = `mock-code-${randomUUID()}`;
        codes.set(code, {
            client_id: client.client_id,
            code_challenge: p.get('code_challenge'),
            redirect_uri: p.get('redirect_uri'),
            resource: p.get('resource'),
            expires_at: Date.now()+60*1000,
        });
        const target = new URL(p.get('redirect_uri'));
        target.searchParams.set('code', code);
        if (p.get('state'))
            target.searchParams.set('state', p.get('state'));
        if (AUTO_LOGIN)
        {
            log(`authorize -> auto-approving, redirecting to ${target.origin}`);
            res.writeHead(302, {location: target.href}).end();
            return;
        }
        // Otherwise behave like a login page would: a redirect to /login.
        log('authorize -> would show a login page');
        res.writeHead(302, {location: `${BASE}/login?next=`
            +encodeURIComponent(target.href)}).end();
        return;
    }

    // ---- Token endpoint (code exchange and refresh) --------------------
    if (path === '/token' && req.method === 'POST')
    {
        const form = new URLSearchParams(await read_body(req));
        const grant = form.get('grant_type');
        if (grant === 'authorization_code')
        {
            const entry = codes.get(form.get('code'));
            if (!entry || entry.expires_at < Date.now())
                return json(res, 400, {error: 'invalid_grant'});
            const verifier = form.get('code_verifier') || '';
            const challenge = base64url(createHash('sha256').update(verifier).digest());
            if (challenge !== entry.code_challenge)
            {
                return json(res, 400, {error: 'invalid_grant',
                    error_description: 'PKCE verification failed'});
            }
            codes.delete(form.get('code'));        // single use
            return json(res, 200, issue(entry.client_id,
                form.get('resource') || entry.resource));
        }
        if (grant === 'refresh_token')
        {
            const entry = tokens.get(form.get('refresh_token'));
            if (!entry)
                return json(res, 400, {error: 'invalid_grant'});
            return json(res, 200, issue(entry.client_id, entry.resource));
        }
        return json(res, 400, {error: 'unsupported_grant_type'});
    }

    // ---- The protected resource ----------------------------------------
    if (path === '/mcp')
    {
        const auth = req.headers.authorization;
        const challenge = `Bearer resource_metadata="${BASE}`
            +`/.well-known/oauth-protected-resource/mcp", scope="mcp"`;
        if (!auth || auth === 'Bearer')
        {
            res.writeHead(401, {'www-authenticate': challenge}).end();
            return;
        }
        const token = auth.replace(/^Bearer\s+/i, '');
        // Stand-in for the API-token path, so the other row of the 2x2 can be
        // rehearsed as well. Any token that is not one we issued and not this
        // sentinel takes the invalid-token path below.
        const is_api_token = token===(process.env.MOCK_API_TOKEN || '\u0000none');
        if (!is_api_token && !tokens.has(token))
        {
            // Reproduce production's bare 401 so the failure-path script sees
            // the same asymmetry it will see for real (defect D2).
            res.writeHead(401).end();
            return;
        }
        const body = JSON.parse(await read_body(req) || '{}');
        const pro = url.searchParams.get('pro') === '1';
        if (body.method === 'initialize')
        {
            return sse(res, {jsonrpc: '2.0', id: body.id, result: {
                protocolVersion: '2025-06-18',
                capabilities: {tools: {}},
                serverInfo: {name: 'mock-mcp', version: '0.0.1'},
            }});
        }
        if (body.method === 'tools/list')
        {
            const names = pro
                ? [...Array(74)].map((_, i)=>i<50
                    ? `web_data_mock_${i}` : `tool_${i}`)
                : ['search_engine', 'scrape_as_markdown', 'search_engine_batch',
                    'scrape_batch', 'discover'];
            return sse(res, {jsonrpc: '2.0', id: body.id, result: {
                tools: names.map(name=>({name, description: 'mock',
                    inputSchema: {type: 'object', properties: {}}})),
            }});
        }
        if (body.method === 'tools/call')
        {
            return sse(res, {jsonrpc: '2.0', id: body.id, result: {
                content: [{type: 'text', text: 'mock result'}]}});
        }
        return sse(res, {jsonrpc: '2.0', id: body.id ?? null, result: {}});
    }

    res.writeHead(404).end('not found');
});

function issue(client_id, resource){
    const access_token = make_jwt({
        iss: BASE, aud: resource, sub: 'mock-user-42',
        scope: 'mcp', iat: Math.floor(Date.now()/1000),
        exp: Math.floor(Date.now()/1000)+3600,
        // Real servers do not mint byte-identical tokens twice; without this
        // a refresh inside the same second returns the same string and the
        // rehearsal cannot tell whether the script detects a new token.
        jti: randomUUID(),
    });
    const refresh_token = `mock-refresh-${randomUUID()}`;
    tokens.set(access_token, {client_id, resource});
    tokens.set(refresh_token, {client_id, resource});
    return {access_token, refresh_token, token_type: 'Bearer',
        expires_in: 3600, scope: 'mcp'};
}

function sse(res, payload){
    res.writeHead(200, {'content-type': 'text/event-stream',
        'mcp-session-id': randomUUID()});
    res.end(`event: message\ndata: ${JSON.stringify(payload)}\n\n`);
}

function read_body(req){
    return new Promise(resolve=>{
        let data = '';
        req.on('data', chunk=>{ data += chunk; });
        req.on('end', ()=>resolve(data));
    });
}

server.listen(PORT, '127.0.0.1', ()=>{
    console.log(`   [mock] listening on ${BASE}`);
    console.log(`   [mock] RFC 7592 management: ${SUPPORTS_7592 ? 'on' : 'OFF'}`);
    console.log(`   [mock] login: ${AUTO_LOGIN ? 'auto-approve' : 'shows a page'}`);
});
