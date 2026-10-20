'use strict'; /*jslint node:true es9:true*/
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));

test('every local module imported by a published file is published', ()=>{
    const files = new Set(pkg.files);
    for (const file of files)
    {
        if (!file.endsWith('.js'))
            continue;
        const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
        for (const [, dep] of src.matchAll(/from\s+['"]\.\/([^'"]+)['"]/g))
            assert.ok(files.has(dep), `${file} imports ./${dep}, not in package.json files`);
    }
});
