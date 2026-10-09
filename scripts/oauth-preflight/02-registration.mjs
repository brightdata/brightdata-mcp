'use strict'; /*jslint node:true es9:true*/
// Step 3 -- registration, reversibility first.
//
// THIS CREATES REAL RECORDS ON BRIGHT DATA'S PRODUCTION AUTHORIZATION SERVER.
// It refuses to run until PREFLIGHT_NOTIFIED names the date the R&D owner was
// told (plan step 1), and phase B refuses to run until phase A has established
// whether registrations can be deleted.
import {randomUUID} from 'node:crypto';
import {writeFileSync, readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {registerClient, discoverAuthorizationServerMetadata}
    from '@modelcontextprotocol/sdk/client/auth.js';
import {ISSUER, HERE, record, draft, secret, redact, fetch_with_headers}
    from './common.mjs';

const notified = process.env.PREFLIGHT_NOTIFIED;
if (!notified)
{
    console.error('Refusing to register: set PREFLIGHT_NOTIFIED to the date the');
    console.error('R&D owner was told (e.g. PREFLIGHT_NOTIFIED=2026-09-10).');
    console.error('Plan step 1: nobody should meet this traffic unannounced.');
    process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const CLIENTS = join(HERE, 'clients.json');
const metadata = await discoverAuthorizationServerMetadata(ISSUER);
const state = existsSync(CLIENTS)
    ? JSON.parse(readFileSync(CLIENTS, 'utf8')) : {notified, clients: {}};
const save = ()=>writeFileSync(CLIENTS, JSON.stringify(state, null, 2));

// The SDK parses the registration response against a schema that DROPS
// registration_client_uri and registration_access_token -- the two fields that
// say whether a registration can be deleted. Verified against a mock on
// 2026-09-10: the server returned both, registerClient() returned neither.
// So capture the raw body as it arrives and read those fields from it, while
// still letting the SDK validate the rest.
function capturing_fetch(store){
    return async(url, init)=>{
        const response = await fetch(url, init);
        const body = await response.clone().text();
        try { store.raw = JSON.parse(body); } catch { store.raw = null; }
        return response;
    };
}

async function register(label, client_name, redirect_uris){
    console.log(`\n[${label}] registering ${client_name}`);
    console.log(`      redirect_uris: ${redirect_uris.join(', ')}`);
    const store = {};
    try {
        const parsed = await registerClient(ISSUER, {metadata, clientMetadata: {
            client_name,
            redirect_uris,
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: 'none',
            scope: 'mcp',
        }, fetchFn: capturing_fetch(store)});
        // Prefer the raw body; fall back to the parsed object.
        const info = {...parsed, ...store.raw ?? {}};
        secret(info.registration_access_token);
        secret(info.client_secret);
        state.clients[label] = {
            client_name,
            client_id: info.client_id,
            redirect_uris: info.redirect_uris,
            registered_at: new Date().toISOString(),
            manageable: !!info.registration_client_uri,
            registration_client_uri: info.registration_client_uri ?? null,
            has_registration_access_token: !!info.registration_access_token,
            has_client_secret: !!info.client_secret,
            echoed_auth_method: info.token_endpoint_auth_method ?? null,
        };
        // The management token is kept out of clients.json; it lives only in a
        // private file so it can be used for cleanup and nothing else.
        if (info.registration_access_token)
        {
            writeFileSync(join(HERE, `.rat-${label}`),
                info.registration_access_token, {mode: 0o600});
        }
        save();
        console.log(`      client_id: ${info.client_id}`);
        console.log(`      manageable (RFC 7592): ${!!info.registration_client_uri}`);
        return {ok: true, info};
    } catch(e){
        const detail = redact(e?.message ?? String(e));
        state.clients[label] = {client_name, redirect_uris, error: detail,
            attempted_at: new Date().toISOString()};
        save();
        console.log(`      REJECTED: ${detail}`);
        return {ok: false, error: detail};
    }
}

// ---- Phase A: the disposable probe. Its only job is to answer a question
// that cannot be looked up: can a registration be deleted by whoever made it?
console.log('=== Phase A -- reversibility probe (one disposable client) ===');
const probe = await register('probe', `openai-preflight-probe-${today}`,
    ['http://localhost:8765/callback']);
if (!probe.ok)
{
    console.error('\nProbe registration failed; nothing else will be created.');
    record('02-registration', state);
    process.exit(1);
}

let deletable = null;
if (probe.info.registration_client_uri && probe.info.registration_access_token)
{
    console.log('\n      attempting DELETE on the probe...');
    const del = await fetch_with_headers(probe.info.registration_client_uri, {
        method: 'DELETE',
        headers: {authorization: `Bearer ${probe.info.registration_access_token}`},
    });
    deletable = del.status >= 200 && del.status < 300;
    state.clients.probe.delete_status = del.status;
    state.clients.probe.deleted = deletable;
    save();
    console.log(`      DELETE -> ${del.status} (${deletable
        ? 'self-service cleanup works' : 'cleanup NOT self-service'})`);
}
else
{
    deletable = false;
    console.log('\n      No registration_client_uri/registration_access_token returned.');
    console.log('      => The server implements creation (RFC 7591) but not management');
    console.log('         (RFC 7592). Every registration is permanent from the outside');
    console.log('         and can only be removed by someone with admin access.');
}
state.cleanup_is_self_service = deletable;
save();

// ---- The gate: do not create the clients that matter until the cleanup story
// is known and, if it is bad, a human has accepted it.
if (!deletable && process.env.PREFLIGHT_OWNER_CONFIRMED!=='yes')
{
    console.error('\n=== STOP ===');
    console.error('Registrations cannot be cleaned up without an internal engineer.');
    console.error('Confirm with the R&D owner, then re-run with');
    console.error('PREFLIGHT_OWNER_CONFIRMED=yes to create clients A, B and L.');
    console.error(`Probe left behind: ${state.clients.probe.client_id}`);
    record('02-registration', state);
    draft(`## Step 3 — Registration (phase A only, ${today})

Reversibility probe registered as \`${state.clients.probe.client_id}\`.
**Cleanup is not self-service**: the server implements RFC 7591 (create) but not RFC 7592 (manage),
so this registration and any others can only be removed by someone with administrative access.
Phase B was not run pending the owner's confirmation.
`);
    process.exit(2);
}

// ---- Phase B: the three clients the investigation needs.
console.log('\n=== Phase B -- the clients the investigation needs ===');
const callback_id = randomUUID();
const A = await register('A', `openai-preflight-chatgpt-callback-${today}`,
    [`https://chatgpt.com/connector/oauth/${callback_id}`]);
const B = await register('B', `openai-preflight-chatgpt-stable-${today}`,
    ['https://chatgpt.com/connector_platform_oauth_redirect']);
const L = await register('L', `openai-preflight-localhost-${today}`,
    ['http://localhost:8765/callback']);

record('02-registration', state);

draft(`## Step 3 — Registration (${today})

Notified the R&D owner on ${notified}.

| Client | Purpose | Result |
|---|---|---|
| probe | reversibility only | \`${state.clients.probe.client_id}\` — cleanup ${deletable
    ? 'is self-service (deleted)' : '**needs an internal engineer**'} |
| A | ChatGPT's per-connector redirect \`https://chatgpt.com/connector/oauth/{id}\` | ${A.ok
    ? '**accepted** — a ChatGPT connector can register' : '**REJECTED** — '+A.error} |
| B | ChatGPT's stable redirect (used only if \`iss\` is advertised) | ${B.ok
    ? 'accepted' : 'rejected — '+B.error} |
| L | \`http://localhost:8765/callback\`, carries the real login | ${L.ok
    ? 'accepted' : 'rejected — '+L.error} |

${A.ok
    ? 'The headline: this server accepts the redirect URL shape ChatGPT is forced to use, so a connector can be created.'
    : '**The headline: this server rejects the redirect URL shape ChatGPT is forced to use, so a connector cannot be created at all.** Everything below was obtained with a localhost client and is a substitute, not the real path.'}

Cleanup inventory: ${Object.values(state.clients).filter(c=>c.client_id)
    .map(c=>'`'+c.client_id+'`').join(', ')}.
`);
console.log('\ndone. clients.json holds the ids; .rat-* hold any management tokens.');
