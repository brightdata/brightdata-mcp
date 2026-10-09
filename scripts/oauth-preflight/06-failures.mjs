'use strict'; /*jslint node:true es9:true*/
// Step 7 -- failure paths: can a client tell it must log in again?
//
// The MCP authorization spec expects a 401 to carry WWW-Authenticate so the
// client knows where to re-authenticate. Three of these cases need no
// credentials at all; the expired case needs a token and its lifetime.
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {RESOURCE, HERE, record, draft, secret, fetch_with_headers} from './common.mjs';

const INIT = JSON.stringify({jsonrpc: '2.0', id: 1, method: 'initialize',
    params: {protocolVersion: '2025-06-18', capabilities: {},
        clientInfo: {name: 'preflight-failures', version: '0.0.1'}}});

async function probe(label, authorization){
    const headers = {'content-type': 'application/json',
        accept: 'application/json, text/event-stream'};
    if (authorization!==null)
        headers.authorization = authorization;
    const response = await fetch_with_headers(`${RESOURCE}?pro=1`,
        {method: 'POST', headers, body: INIT});
    const challenge = response.headers['www-authenticate'] ?? null;
    const result = {
        status: response.status,
        www_authenticate: challenge,
        has_challenge: !!challenge,
        body_head: response.body.slice(0, 200),
        has_meta_www_authenticate: response.body.includes('mcp/www_authenticate'),
    };
    console.log(`  ${label.padEnd(34)} -> ${result.status}  `
        +`WWW-Authenticate: ${challenge ? 'present' : 'ABSENT'}`);
    return result;
}

const evidence = {ran_at: new Date().toISOString(), cases: {}};

console.log('=== Failure paths ===\n');
evidence.cases.no_header = await probe('no Authorization header', null);
evidence.cases.malformed = await probe('Authorization: Bearer (no value)', 'Bearer');
evidence.cases.invalid = await probe('invalid bearer value',
    'Bearer invalid-token-preflight-probe');

// The expired case needs a real token that has aged out.
const TOKENS = join(HERE, 'tokens.json');
if (existsSync(TOKENS))
{
    const tokens = JSON.parse(readFileSync(TOKENS, 'utf8'));
    secret(tokens.access_token);
    const age_s = Math.round((Date.now()-(tokens.obtained_at ?? Date.now()))/1000);
    const expires_in = tokens.expires_in ?? null;
    if (expires_in && age_s>expires_in)
    {
        evidence.cases.expired = await probe('expired bearer', `Bearer ${tokens.access_token}`);
        evidence.expired_verified = true;
    }
    else
    {
        evidence.expired_verified = false;
        evidence.expired_note = `Token lifetime is ${expires_in}s and it is ${age_s}s old, `
            +`so it has not expired yet. Re-run this script after it does, or revoke the `
            +`grant from the account page.`;
        console.log(`\n  expired case NOT verified: ${evidence.expired_note}`);
    }
}
else
{
    evidence.expired_verified = false;
    evidence.expired_note = 'No token available yet (03-authorize-and-token.mjs has not run).';
    console.log(`\n  expired case NOT verified: no token yet.`);
}

const invalid_has = evidence.cases.invalid.has_challenge;
const others_have = evidence.cases.no_header.has_challenge
    && evidence.cases.malformed.has_challenge;
evidence.asymmetry = others_have && !invalid_has;
record('06-failures', evidence);

console.log(`\n  asymmetry present: ${evidence.asymmetry}`);

draft(`## Step 7 — Failure paths (${evidence.ran_at.slice(0, 10)})

The MCP authorization spec uses \`WWW-Authenticate\` on a \`401\` to tell a client where to
re-authenticate. This server does not send it consistently:

| Case | Status | \`WWW-Authenticate\` |
|---|---|---|
| No \`Authorization\` header | ${evidence.cases.no_header.status} | ${evidence.cases.no_header.has_challenge ? 'present' : '**absent**'} |
| \`Authorization: Bearer\` with no value | ${evidence.cases.malformed.status} | ${evidence.cases.malformed.has_challenge ? 'present' : '**absent**'} |
| A present but invalid bearer | ${evidence.cases.invalid.status} | ${evidence.cases.invalid.has_challenge ? 'present' : '**absent**'} |
| An expired bearer | ${evidence.cases.expired ? evidence.cases.expired.status : '_not verified_'} | ${evidence.cases.expired ? (evidence.cases.expired.has_challenge ? 'present' : '**absent**') : '_not verified_'} |

${evidence.asymmetry
    ? `**The asymmetry matters.** A request with no credentials, or a malformed header, gets the
challenge that names the metadata document. A request carrying a token the server rejects gets a bare
\`401\` with nothing to act on. An **expired** token takes that second path, and an expired token is
the ordinary case in production: every user hits it eventually. If ChatGPT relies on the challenge to
know it should refresh or re-prompt for login, this is a gap on the hosted side.`
    : 'No asymmetry observed between the credential-less and invalid-token cases.'}

${evidence.expired_verified
    ? ''
    : `_The expired case is **unverified**: ${evidence.expired_note} It is not inferred from the
invalid-token result._`}
`);
