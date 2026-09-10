'use strict'; /*jslint node:true es9:true*/
// Steps 4 and 5, in one process on purpose: an authorization code is valid for
// well under a minute and exactly once, so nothing may sit between capturing it
// and spending it.
//
// 4a proves ChatGPT's redirect URL is accepted, using the authorize endpoint's
//    pre-login validation -- no login, no redirect we cannot receive.
// 4b runs the real login through a local listener, so no human ever handles the
//    authorization code.
// 5  exchanges, decodes and refreshes.
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {startAuthorization, exchangeAuthorization, refreshAuthorization,
    discoverAuthorizationServerMetadata} from '@modelcontextprotocol/sdk/client/auth.js';
import {ISSUER, RESOURCE, HERE, record, draft, secret, redact,
    fetch_with_headers, make_checker} from './common.mjs';

const CLIENTS = join(HERE, 'clients.json');
if (!existsSync(CLIENTS))
{
    console.error('Run 02-registration.mjs first.');
    process.exit(1);
}
const state = JSON.parse(readFileSync(CLIENTS, 'utf8'));
const metadata = await discoverAuthorizationServerMetadata(ISSUER);
const check = make_checker();
const evidence = {ran_at: new Date().toISOString()};

// ---------- 4a: is ChatGPT's redirect URL accepted at authorize time? ----------
// The endpoint validates before it shows anything: an unregistered client gets
// 400 invalid_client as JSON. So a registered client's authorize request tells
// us whether the request shape -- including the chatgpt.com redirect URL, S256
// and the resource parameter -- is accepted, without anyone logging in.
console.log('=== 4a -- does the authorize endpoint accept ChatGPT\'s redirect URL? ===');
evidence.authorize_acceptance = {};
for (const label of ['A', 'B'])
{
    const client = state.clients?.[label];
    if (!client?.client_id)
    {
        console.log(`\n[${label}] not registered (${client?.error ?? 'missing'}) -- skipped`);
        evidence.authorize_acceptance[label] = {skipped: true,
            reason: client?.error ?? 'not registered'};
        continue;
    }
    const {authorizationUrl} = await startAuthorization(ISSUER, {
        metadata,
        clientInformation: {client_id: client.client_id},
        redirectUrl: client.redirect_uris[0],
        scope: 'mcp',
        state: randomUUID(),
        resource: new URL(RESOURCE),
    });
    const response = await fetch_with_headers(authorizationUrl);   // no redirect follow
    const location = response.headers.location ?? '';
    const accepted = response.status>=300 && response.status<400;
    evidence.authorize_acceptance[label] = {
        redirect_uri: client.redirect_uris[0],
        status: response.status,
        location_host: location ? new URL(location, ISSUER).host : null,
        error: response.json?.error ?? null,
        error_description: response.json?.error_description ?? null,
    };
    console.log(`\n[${label}] ${client.redirect_uris[0]}`);
    console.log(`      -> ${response.status} ${accepted
        ? '(redirected to a login page: request shape accepted)'
        : '(not a redirect)'}`);
    if (response.json?.error)
        console.log(`      error: ${response.json.error} -- ${response.json.error_description}`);
    check(`authorize accepts client ${label}'s redirect URL`, accepted,
        `${response.status}${response.json?.error ? ' '+response.json.error : ''}`);
}

// ---------- 4b: the real login, code captured by a listener ----------
const L = state.clients?.L;
if (!L?.client_id)
{
    console.error('\nNo localhost client registered; cannot complete a login.');
    record('03-authorize', {...evidence, checks: check.summary()});
    process.exit(1);
}

console.log('\n=== 4b -- the login (you sign in; the code never touches a human) ===');
const expected_state = randomUUID();
const {authorizationUrl, codeVerifier} = await startAuthorization(ISSUER, {
    metadata,
    clientInformation: {client_id: L.client_id},
    redirectUrl: L.redirect_uris[0],
    scope: 'mcp',
    state: expected_state,
    resource: new URL(RESOURCE),
});
secret(codeVerifier);

const params = authorizationUrl.searchParams;
check('authorize URL carries response_type=code', params.get('response_type')==='code');
check('authorize URL carries code_challenge_method=S256',
    params.get('code_challenge_method')==='S256');
check('authorize URL carries scope=mcp', params.get('scope')==='mcp');
check('authorize URL carries state', !!params.get('state'));
check('authorize URL carries the resource indicator',
    params.get('resource')===RESOURCE, params.get('resource'));
evidence.authorize_request = {
    parameters: [...params.keys()].sort(),
    resource: params.get('resource'),
    code_challenge_method: params.get('code_challenge_method'),
};

const callback = new Promise((resolve, reject)=>{
    const server = createServer((req, res)=>{
        const url = new URL(req.url, 'http://127.0.0.1:8765');
        if (!url.searchParams.has('code') && !url.searchParams.has('error'))
        {
            res.writeHead(404).end('waiting for the callback');
            return;
        }
        res.writeHead(200, {'content-type': 'text/html'}).end(
            '<h2>Received. You can close this tab.</h2>');
        server.close();
        resolve(url.searchParams);
    });
    server.listen(8765, '127.0.0.1');
    setTimeout(()=>{ server.close(); reject(new Error('timed out after 10 minutes')); },
        10*60*1000).unref();
});

console.log('\n  Open this in a PRIVATE WINDOW with no existing Bright Data session.');
console.log('  Signing in signed-out shows the first-time path a reviewer will face,');
console.log('  and keeps your identity out of any screenshot.\n');
console.log(authorizationUrl.href);
console.log('\n  Waiting for the redirect on 127.0.0.1:8765 ...');

const returned = await callback;
if (returned.get('error'))
{
    console.error(`\n  Authorization failed: ${returned.get('error')} -- `
        +`${returned.get('error_description')}`);
    evidence.authorize_result = {error: returned.get('error'),
        error_description: returned.get('error_description')};
    record('03-authorize', {...evidence, checks: check.summary()});
    process.exit(1);
}
const code = secret(returned.get('code'));
check('state returned unchanged', returned.get('state')===expected_state);
const iss_returned = returned.get('iss');
evidence.authorize_result = {
    code_received: true,
    state_matches: returned.get('state')===expected_state,
    iss_parameter: iss_returned ?? null,
};
console.log('\n  Code received (not shown, not stored).');
console.log(`  iss parameter on the redirect: ${iss_returned ?? 'absent (as expected)'}`);

// ---------- 5: exchange, decode, refresh ----------
console.log('\n=== 5 -- token exchange, inspection, refresh ===');
const tokens = await exchangeAuthorization(ISSUER, {
    metadata,
    clientInformation: {client_id: L.client_id},
    authorizationCode: code,
    codeVerifier,
    redirectUri: L.redirect_uris[0],
    resource: new URL(RESOURCE),
});
secret(tokens.access_token);
secret(tokens.refresh_token);
writeFileSync(join(HERE, 'tokens.json'), JSON.stringify(tokens, null, 2),
    {mode: 0o600});

evidence.token = {
    token_type: tokens.token_type,
    expires_in: tokens.expires_in ?? null,
    scope: tokens.scope ?? null,
    has_refresh_token: !!tokens.refresh_token,
    has_id_token: !!tokens.id_token,
};
console.log(`  token_type=${tokens.token_type} expires_in=${tokens.expires_in}s `
    +`scope=${tokens.scope} refresh=${!!tokens.refresh_token}`);

const segments = String(tokens.access_token).split('.');
if (segments.length===3)
{
    const decode = part=>JSON.parse(
        Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    const header = decode(segments[0]);
    const payload = decode(segments[1]);
    // Record claim names always; record values only for the non-identifying ones.
    const safe = ['iss', 'aud', 'exp', 'iat', 'nbf', 'scope', 'token_type', 'typ'];
    evidence.token.jwt = {
        header,
        claim_names: Object.keys(payload).sort(),
        claims: Object.fromEntries(Object.entries(payload)
            .map(([k, v])=>[k, safe.includes(k) ? v : '***'])),
    };
    const aud = payload.aud;
    const aud_matches = aud===RESOURCE
        || (Array.isArray(aud) && aud.includes(RESOURCE));
    evidence.token.audience_matches_resource = aud_matches;
    check('access token audience equals the resource indicator', aud_matches,
        JSON.stringify(aud));
    console.log(`  JWT: iss=${payload.iss} aud=${JSON.stringify(aud)} `
        +`exp=${payload.exp}`);
}
else
{
    evidence.token.opaque = true;
    console.log('  Access token is opaque, not a JWT -- the published jwks_uri is '
        +'for someone else\'s benefit.');
}

console.log('\n  refreshing...');
try {
    const refreshed = await refreshAuthorization(ISSUER, {
        metadata,
        clientInformation: {client_id: L.client_id},
        refreshToken: tokens.refresh_token,
        resource: new URL(RESOURCE),
    });
    secret(refreshed.access_token);
    secret(refreshed.refresh_token);
    evidence.refresh = {
        ok: true,
        new_access_token: refreshed.access_token!==tokens.access_token,
        refresh_token_rotated: refreshed.refresh_token!==tokens.refresh_token,
        expires_in: refreshed.expires_in ?? null,
    };
    check('refresh returns a new access token',
        refreshed.access_token!==tokens.access_token);
    console.log(`  refreshed: new access token=${evidence.refresh.new_access_token}, `
        +`refresh rotated=${evidence.refresh.refresh_token_rotated}`);
} catch(e){
    evidence.refresh = {ok: false, error: redact(e?.message ?? String(e))};
    check('refresh works', false, evidence.refresh.error);
}

evidence.checks = check.summary();
record('03-authorize', evidence);

const a = evidence.authorize_acceptance;
draft(`## Steps 4–5 — Authorization and token (${evidence.ran_at.slice(0, 10)})

### 4a — is ChatGPT's redirect URL accepted?

Asked without logging in: the authorize endpoint validates the request before it shows a page.

| Client | Redirect URL | Result |
|---|---|---|
| A | \`${a.A?.redirect_uri ?? '(not registered)'}\` | ${a.A?.skipped ? 'skipped — '+a.A.reason : a.A?.status+(a.A?.error ? ' '+a.A.error+' — '+a.A.error_description : ' — accepted, redirected to login')} |
| B | \`${a.B?.redirect_uri ?? '(not registered)'}\` | ${a.B?.skipped ? 'skipped — '+a.B.reason : a.B?.status+(a.B?.error ? ' '+a.B.error+' — '+a.B.error_description : ' — accepted, redirected to login')} |

### 4b — the login

Authorize request carried: \`${evidence.authorize_request.parameters.join('`, `')}\`.
Resource indicator: \`${evidence.authorize_request.resource}\`. PKCE: \`${evidence.authorize_request.code_challenge_method}\`.
\`state\` returned unchanged: ${evidence.authorize_result.state_matches}. \`iss\` on the redirect:
${evidence.authorize_result.iss_parameter ?? 'absent, as the metadata predicts'}.

### 5 — token

- \`token_type\` ${evidence.token.token_type}, \`expires_in\` ${evidence.token.expires_in}s, scope \`${evidence.token.scope}\`
- refresh token issued: ${evidence.token.has_refresh_token}${evidence.refresh?.ok
    ? `; refresh works (new access token: ${evidence.refresh.new_access_token}, rotated: ${evidence.refresh.refresh_token_rotated})`
    : `; refresh FAILED: ${evidence.refresh?.error}`}
- ${evidence.token.opaque
    ? 'The access token is opaque, not a JWT.'
    : `Audience equals the resource indicator: **${evidence.token.audience_matches_resource}** (\`aud\` = ${JSON.stringify(evidence.token.jwt?.claims?.aud)}). This is what OpenAI asks the authorization server to do with the \`resource\` value.`}
`);
console.log('\ndone. tokens.json written (never leaves this folder).');
