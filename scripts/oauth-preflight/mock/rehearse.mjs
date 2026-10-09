'use strict'; /*jslint node:true es9:true*/
// Drives the whole pre-flight against the local mock in one process, so the
// mock's in-memory client store is shared across steps and a "browser" can be
// simulated for the login. Proves the scripts work before they are pointed at
// production.
import {spawn} from 'node:child_process';
import {rmSync, existsSync, readFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const ISSUER = 'http://127.0.0.1:9099';
const env = {...process.env,
    PREFLIGHT_ISSUER: ISSUER,
    PREFLIGHT_RESOURCE: `${ISSUER}/mcp`,
    PREFLIGHT_NOTIFIED: '2026-09-10-REHEARSAL',
    PREFLIGHT_API_TOKEN: 'mock-api-token-for-rehearsal'};

for (const file of ['clients.json', 'tokens.json', 'oauth_preflight_draft.md'])
    rmSync(join(ROOT, file), {force: true});
for (const label of ['probe', 'A', 'B', 'L'])
    rmSync(join(ROOT, `.rat-${label}`), {force: true});

const mock = spawn(process.execPath, [join(HERE, 'mock-server.mjs')],
    {env: {...process.env, MOCK_LOGIN: 'auto',
        MOCK_API_TOKEN: 'mock-api-token-for-rehearsal'},
    stdio: ['ignore', 'pipe', 'pipe']});
mock.stdout.on('data', d=>process.stdout.write(String(d)));
await new Promise(resolve=>setTimeout(resolve, 800));

function run(script, {simulate_browser = false} = {}){
    return new Promise((resolve)=>{
        const child = spawn(process.execPath, [join(ROOT, script)],
            {env, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe']});
        let output = '';
        let visited = false;
        const on_chunk = async chunk=>{
            const text = String(chunk);
            output += text;
            process.stdout.write(text.replace(/^/gm, '   '));
            // Stand in for the human opening the authorize URL in a browser.
            if (simulate_browser && !visited)
            {
                const match = output.match(/(http:\/\/127\.0\.0\.1:9099\/authorize\?\S+)/);
                if (match)
                {
                    visited = true;
                    console.log('\n   [rehearsal] "opening" the authorize URL ...');
                    await fetch(match[1], {redirect: 'follow'}).catch(()=>{});
                }
            }
        };
        child.stdout.on('data', on_chunk);
        child.stderr.on('data', on_chunk);
        const bail = setTimeout(()=>{ child.kill(); }, 60*1000);
        child.on('exit', code=>{ clearTimeout(bail); resolve({code, output}); });
    });
}

const results = {};
console.log('\n=== [1/4] step 3 -- registration ===');
results.register = await run('02-registration.mjs');
console.log('\n=== [2/4] steps 4 and 5 -- authorize, token, refresh ===');
results.authorize = await run('03-authorize-and-token.mjs', {simulate_browser: true});
console.log('\n=== [3/4] step 6 -- the 2x2 ===');
results.usage = await run('05-usage.mjs');
console.log('\n=== [4/4] step 7 -- failure paths ===');
results.failures = await run('06-failures.mjs');

mock.kill();

console.log('\n================ REHEARSAL SUMMARY ================');
const verdicts = [
    ['registration created four clients',
        /client_id: mock-client/.test(results.register.output)
        && (results.register.output.match(/client_id: mock-client/g) || []).length===4],
    ['reversibility probe deleted itself',
        /DELETE -> 204 \(self-service cleanup works\)/.test(results.register.output)],
    ['ChatGPT-shaped redirect accepted at authorize',
        /PASS  authorize accepts client A/.test(results.authorize.output)],
    ['authorize URL carried S256 and the resource indicator',
        /PASS  authorize URL carries code_challenge_method=S256/.test(results.authorize.output)
        && /PASS  authorize URL carries the resource indicator/.test(results.authorize.output)],
    ['code captured without a human',
        /Code received/.test(results.authorize.output)],
    ['token audience matched the resource',
        /PASS  access token audience equals the resource indicator/.test(results.authorize.output)],
    ['refresh returned a new access token',
        /PASS  refresh returns a new access token/.test(results.authorize.output)],
    ['2x2 filled all four cells',
        (results.usage.output.match(/->\s+\d+ tools/g) || []).length===4],
    ['failure-path asymmetry reproduced',
        /asymmetry present: true/.test(results.failures.output)],
    ['deliverable draft written',
        existsSync(join(ROOT, 'oauth_preflight_draft.md'))],
];
let failed = 0;
for (const [name, ok] of verdicts)
{
    if (!ok) failed++;
    console.log(` ${ok ? 'PASS' : 'FAIL'}  ${name}`);
}
console.log(`\n ${verdicts.length-failed}/${verdicts.length} rehearsal checks passed`);
if (existsSync(join(ROOT, 'oauth_preflight_draft.md')))
{
    const draft = readFileSync(join(ROOT, 'oauth_preflight_draft.md'), 'utf8');
    console.log(` draft sections: ${(draft.match(/^## /gm) || []).length}`);
    const leaked = /mock-rat-|mock-refresh-|mock-code-/.test(draft);
    console.log(` ${leaked ? 'FAIL' : 'PASS'}  no secret values in the draft`);
}
process.exit(failed ? 1 : 0);
