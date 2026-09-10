'use strict'; /*jslint node:true es9:true*/
// Step 2 -- reproduce the discovery chain a client walks, and ASSERT it.
// Read-only, unauthenticated, creates nothing.
import {extractResourceMetadataUrl, discoverOAuthProtectedResourceMetadata,
    discoverAuthorizationServerMetadata} from '@modelcontextprotocol/sdk/client/auth.js';
import {RESOURCE, ISSUER, record, draft, fetch_with_headers, make_checker}
    from './common.mjs';
import assert from 'node:assert/strict';

const check = make_checker();
const evidence = {ran_at: new Date().toISOString()};

// 1. The challenge that starts everything.
console.log('\n[1] unauthenticated POST /mcp -- the WWW-Authenticate challenge');
const init_body = JSON.stringify({jsonrpc: '2.0', id: 1, method: 'initialize',
    params: {protocolVersion: '2025-06-18', capabilities: {},
        clientInfo: {name: 'oauth-preflight', version: '0.0.1'}}});
const challenge = await fetch_with_headers(`${RESOURCE}?pro=1`, {
    method: 'POST',
    headers: {'content-type': 'application/json',
        accept: 'application/json, text/event-stream'},
    body: init_body,
});
evidence.challenge = {status: challenge.status,
    www_authenticate: challenge.headers['www-authenticate'] ?? null};
check('401 on an unauthenticated request', challenge.status===401,
    `got ${challenge.status}`);
check('WWW-Authenticate present', !!challenge.headers['www-authenticate']);
const metadata_url = extractResourceMetadataUrl(
    {headers: {get: name=>challenge.headers[name.toLowerCase()] ?? null}});
evidence.challenge.resource_metadata_url = String(metadata_url ?? '');
check('challenge names the protected-resource metadata URL',
    String(metadata_url ?? '').includes('/.well-known/oauth-protected-resource'),
    String(metadata_url ?? '(none)'));
check('challenge advertises scope "mcp"',
    (challenge.headers['www-authenticate'] ?? '').includes('scope="mcp"'));

// 2. Protected-resource metadata: the URL the header names, and the root.
console.log('\n[2] protected-resource metadata');
const prm_scoped = await discoverOAuthProtectedResourceMetadata(RESOURCE);
const prm_root = (await fetch_with_headers(
    'https://mcp.brightdata.com/.well-known/oauth-protected-resource')).json;
evidence.protected_resource = {from_challenge_path: prm_scoped, from_root: prm_root};
check('resource is the canonical MCP URL', prm_scoped?.resource===RESOURCE,
    prm_scoped?.resource);
check('authorization_servers names the issuer',
    JSON.stringify(prm_scoped?.authorization_servers)===JSON.stringify([ISSUER]),
    JSON.stringify(prm_scoped?.authorization_servers));
check('scopes_supported includes mcp',
    (prm_scoped?.scopes_supported ?? []).includes('mcp'));
let same_prm = true;
try { assert.deepEqual(prm_root, prm_scoped); } catch { same_prm = false; }
check('root and path-scoped documents are identical', same_prm);

// 3. Authorization-server metadata: at the issuer, and the copy on the resource host.
console.log('\n[3] authorization-server metadata');
const asm = await discoverAuthorizationServerMetadata(ISSUER);
const asm_on_resource = (await fetch_with_headers(
    'https://mcp.brightdata.com/.well-known/oauth-authorization-server')).json;
evidence.authorization_server = {from_issuer: asm, from_resource_host: asm_on_resource};
check('issuer metadata resolves', !!asm, asm?.issuer);
check('S256 is supported',
    (asm?.code_challenge_methods_supported ?? []).includes('S256'),
    JSON.stringify(asm?.code_challenge_methods_supported));
check('authorization_code grant supported',
    (asm?.grant_types_supported ?? []).includes('authorization_code'));
check('refresh_token grant supported',
    (asm?.grant_types_supported ?? []).includes('refresh_token'));
check('registration_endpoint present', !!asm?.registration_endpoint,
    asm?.registration_endpoint);
let same_asm = true;
try { assert.deepEqual(asm_on_resource, asm); } catch { same_asm = false; }
check('issuer-host and resource-host copies are identical', same_asm);

// 4. Capability read-out: the two optional features that decide which redirect
//    URL ChatGPT is forced to use.
console.log('\n[4] optional capabilities that change ChatGPT\'s behaviour');
const cimd = asm?.client_id_metadata_document_supported === true;
const iss = asm?.authorization_response_iss_parameter_supported === true;
evidence.optional_capabilities = {
    client_id_metadata_document_supported: cimd,
    authorization_response_iss_parameter_supported: iss,
    consequence: iss
        ? 'ChatGPT can use the stable redirect URL https://chatgpt.com/connector_platform_oauth_redirect'
        : 'ChatGPT must use a per-connector redirect URL https://chatgpt.com/connector/oauth/{callback_id}',
};
console.log(`  CIMD advertised: ${cimd}   iss advertised: ${iss}`);
console.log(`  => ${evidence.optional_capabilities.consequence}`);

// 5. Free evidence for internal item 3 while we are here.
console.log('\n[5] domain-verification token (internal item 3)');
for (const host of ['https://mcp.brightdata.com', 'https://brightdata.com'])
{
    const probe = await fetch_with_headers(`${host}/.well-known/openai-apps-challenge`);
    evidence.openai_apps_challenge = {...evidence.openai_apps_challenge,
        [host]: probe.status};
    console.log(`  ${host} -> ${probe.status}`);
}

evidence.checks = check.summary();
record('01-discovery', evidence);
const s = evidence.checks;
console.log(`\n== ${s.passed}/${s.total} checks passed ==`);
if (s.failed.length)
    console.log('   failed: '+s.failed.join(', '));

draft(`## Step 2 — Discovery chain (ran ${evidence.ran_at})

${s.passed} of ${s.total} assertions passed${s.failed.length ? '; failed: '+s.failed.join(', ') : '. The chain a spec-following client walks completes with no manual step.'}

- Unauthenticated \`POST /mcp\` returns \`${challenge.status}\` with
  \`WWW-Authenticate: ${evidence.challenge.www_authenticate}\`
- Protected-resource metadata: resource \`${prm_scoped?.resource}\`, authorization server
  \`${(prm_scoped?.authorization_servers ?? []).join(', ')}\`, scopes \`${(prm_scoped?.scopes_supported ?? []).join(', ')}\`;
  root and path-scoped documents ${same_prm ? 'identical' : '**differ**'}.
- Authorization server \`${asm?.issuer}\`: S256 ${(asm?.code_challenge_methods_supported ?? []).includes('S256') ? 'yes' : '**no**'},
  grants \`${(asm?.grant_types_supported ?? []).join(', ')}\`, registration endpoint
  \`${asm?.registration_endpoint}\`; issuer-host and resource-host copies ${same_asm ? 'identical' : '**differ**'}.
- CIMD advertised: **${cimd}**. Issuer identification (\`iss\`) advertised: **${iss}**.
  ${evidence.optional_capabilities.consequence}
- \`/.well-known/openai-apps-challenge\`: ${Object.entries(evidence.openai_apps_challenge).map(([h,c])=>`${h} → ${c}`).join(', ')} (internal item 3, not yet hosted).
`);
