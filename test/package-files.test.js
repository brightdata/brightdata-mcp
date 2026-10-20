'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import url from 'node:url';
import {dirname, resolve} from 'node:path';

const repo_root = resolve(dirname(url.fileURLToPath(import.meta.url)), '..');
const read = f=>readFileSync(resolve(repo_root, f), 'utf8');

test('every local module a shipped file imports is shipped too', ()=>{
    const files = JSON.parse(read('package.json')).files;
    for (const file of files.filter(f=>f.endsWith('.js')))
    {
        for (const [, dep] of read(file).matchAll(/from '\.\/([^']+)'/g))
            assert.ok(files.includes(dep), `${file} imports ${dep}`);
    }
});
