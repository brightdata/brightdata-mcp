'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// package.json's files[] is an allowlist: a local module absent from it is not
// published, so server.js would import a file that isn't in the installed
// package and crash on startup. This asserts every local `import './x.js'` in
// the entry modules is allowlisted, so a forgotten entry fails CI instead of
// shipping a dead-on-arrival release.
test('every local import in the entry modules is declared in files[]', ()=>{
    const pkg = JSON.parse(readFileSync(
        new URL('../package.json', import.meta.url)));
    const allow = new Set(pkg.files);
    const missing = [];

    for (const src of ['server.js', 'browser_tools.js', 'browser_session.js'])
    {
        const code = readFileSync(
            new URL('../'+src, import.meta.url), 'utf8');
        for (const m of code.matchAll(/from\s+'\.\/([^']+\.js)'/g))
        {
            if (!allow.has(m[1]))
                missing.push(`${src} imports ./${m[1]}`);
        }
    }

    assert.deepEqual(missing, [],
        'local imports missing from package.json files[]:\n  '
            +missing.join('\n  '));
});
