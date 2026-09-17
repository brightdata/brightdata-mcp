'use strict'; /*jslint node:true es9:true*/
// Shared plumbing for every test that starts the server, and for the checks
// that run against a deployed one. Not a test file -- the npm script names
// test/*.test.js precisely so this stays out of the runner (bare `node --test`
// treats every .js file under test/ as a test).
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {StreamableHTTPClientTransport}
    from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

const repo_root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// The MCP SDK already merges a sudo-style default environment (HOME, PATH,
// SHELL, TERM, USER, LOGNAME) underneath whatever we pass, so this list
// carries only what it omits and the server genuinely needs: the network
// plumbing a developer behind a proxy depends on. Nothing else is inherited --
// a stray TOOLS or GROUPS in the shell would otherwise shrink the tool list
// under a test that asserts on the whole catalog.
const INHERIT = ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy',
    'https_proxy', 'no_proxy', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE',
    'NODE_OPTIONS', 'TMPDIR'];

// A port nothing listens on: connections are refused immediately rather than
// dropped, so a test that must never touch the real API says network: 'none'
// and the server still finishes its startup zone check in well under a second.
const BLACKHOLE_PROXY = 'http://127.0.0.1:1';
const BLACKHOLE = {HTTP_PROXY: BLACKHOLE_PROXY, HTTPS_PROXY: BLACKHOLE_PROXY,
    http_proxy: BLACKHOLE_PROXY, https_proxy: BLACKHOLE_PROXY,
    NO_PROXY: '', no_proxy: ''};

// Builds the child environment. `network: 'none'` points the child at the
// blackhole proxy instead of inheriting the developer's; `env` overrides
// anything, and an explicit undefined deletes a key (how a test asks to spawn
// without PRO_MODE).
export function child_env({env = {}, network = 'inherit'} = {}){
    const out = {};
    if (network!='none')
    {
        for (const key of INHERIT)
        {
            if (process.env[key]!==undefined)
                out[key] = process.env[key];
        }
    }
    Object.assign(out, {API_TOKEN: 'dummy-token', PRO_MODE: 'true'},
        network=='none' ? BLACKHOLE : {}, env);
    for (const [key, value] of Object.entries(out))
    {
        if (value===undefined)
            delete out[key];
    }
    return out;
}

// Runs fn({client, stderr}) against a freshly spawned server.js and always
// closes it. stderr() returns everything the child has written so far; the
// stream is drained from the first chunk on, because a piped stderr that
// nobody reads blocks the child once the pipe buffer fills -- and this server
// logs every tool call.
export async function with_server(fn, opts = {}){
    const client = new Client({name: opts.name || 'test', version: '0.0.1'},
        {capabilities: {tools: {}}});
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: ['server.js'],
        cwd: repo_root,
        env: child_env(opts),
        stderr: 'pipe',
    });
    let captured = '';
    transport.stderr?.on('data', chunk=>{ captured += chunk; });
    try {
        await client.connect(transport);
        return await fn({client, stderr: ()=>captured});
    } finally {
        await client.close().catch(()=>{});
    }
}

export const list_tools = (opts = {})=>
    with_server(async({client})=>(await client.listTools()).tools, opts);

// Deployed-server variant. The token travels only in the Authorization header
// (accepted by the hosted endpoint, verified 2026-09-09); the URL never
// carries it, and anything thrown out of here is scrubbed of the exact value
// so a transport error cannot put the secret in a terminal or a CI log.
export async function with_hosted_server(fn, {url, token, name = 'test'}){
    const redact = value=>String(value).split(token).join('***')
        .replace(/token=[^&\s"']+/g, 'token=***');
    const client = new Client({name, version: '0.0.1'},
        {capabilities: {tools: {}}});
    const transport = new StreamableHTTPClientTransport(new URL(url),
        {requestInit: {headers: {Authorization: `Bearer ${token}`}}});
    try {
        await client.connect(transport);
        return await fn(client);
    } catch(e){
        throw new Error(redact(e?.stack || e?.message || e));
    } finally {
        await client.close().catch(()=>{});
    }
}
