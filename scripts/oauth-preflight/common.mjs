'use strict'; /*jslint node:true es9:true*/
// Shared plumbing for the OAuth pre-flight (C11).
//
// THE SECRETS BOUNDARY — the rule the whole run obeys:
//
//   Secrets enter and leave this run only through files in this folder.
//   Nothing secret is typed into a conversation, pasted into a chat, or read
//   back to a human. Every value that could identify or authorise is
//   registered with secret() the moment it exists, and everything recorded
//   passes through redact() first. Images are treated as unredactable:
//   capture them signed out, or not at all.
//
// The inventory that rule protects. Three of these are returned by the server
// rather than chosen by us, which is why they are listed explicitly:
//   authorization code, code_verifier, access_token, refresh_token,
//   client_secret (should never appear -- token_endpoint_auth_method is none),
//   registration_access_token (only if the server supports RFC 7592),
//   mcp-session-id, and any account identifier inside a decoded JWT.
import {writeFileSync, appendFileSync, existsSync, mkdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const EVIDENCE = join(HERE, 'evidence');
export const DRAFT = join(HERE, 'oauth_preflight_draft.md');

// Overridable so the whole flow can be rehearsed against a local mock before
// it is pointed at production. Defaults are the real endpoints.
export const RESOURCE = process.env.PREFLIGHT_RESOURCE
    || 'https://mcp.brightdata.com/mcp';
export const ISSUER = process.env.PREFLIGHT_ISSUER || 'https://brightdata.com';

const SECRETS = [];
export function secret(value){
    if (value && typeof value=='string' && value.length>7 && !SECRETS.includes(value))
        SECRETS.push(value);
    return value;
}

export function redact(input){
    let text = typeof input=='string' ? input : JSON.stringify(input, null, 2);
    for (const value of SECRETS)
        text = text.split(value).join('***');
    // Belt and braces for shapes that may arrive before we can register them.
    text = text.replace(
        /("(?:access_token|refresh_token|code|client_secret|code_verifier|registration_access_token|id_token)"\s*:\s*")[^"]*/g,
        '$1***');
    return text.replace(/([?&](?:token|code)=)[^&\s"']+/g, '$1***');
}

export function record(name, payload){
    if (!existsSync(EVIDENCE))
        mkdirSync(EVIDENCE, {recursive: true});
    const file = join(EVIDENCE, `${name}.json`);
    writeFileSync(file, redact(payload));
    console.log(`  recorded -> evidence/${name}.json`);
}

// The deliverable is written as the run proceeds, so a lost session costs
// tokens rather than evidence.
export function draft(markdown){
    appendFileSync(DRAFT, redact(markdown)+'\n');
}

// Several findings in this task ARE headers, so every request keeps them.
export async function fetch_with_headers(url, init = {}){
    const response = await fetch(url, {redirect: 'manual', ...init});
    const headers = {};
    response.headers.forEach((value, key)=>{ headers[key] = value; });
    const body = await response.text();
    let json = null;
    try { json = JSON.parse(body); } catch { /* not json */ }
    return {url: String(url), status: response.status, headers, body, json};
}

// Assertions that record rather than throw: a pre-flight should report every
// failure it finds, not stop at the first.
export function make_checker(){
    const checks = [];
    const check = (name, passed, detail)=>{
        checks.push({name, passed: !!passed, detail});
        console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- '+detail : ''}`);
        return !!passed;
    };
    check.summary = ()=>({
        total: checks.length,
        passed: checks.filter(c=>c.passed).length,
        failed: checks.filter(c=>!c.passed).map(c=>c.name),
        checks,
    });
    return check;
}
