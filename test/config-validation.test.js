'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

const test_dir = dirname(fileURLToPath(import.meta.url));
const repo_root = resolve(test_dir, '..');

// Boots the real entry point and captures stderr until the predicate matches
// (or the process exits / the timeout fires). The config warnings print during
// module evaluation, before any network activity.
const boot_and_capture = (env, is_done)=>new Promise((res, reject)=>{
    const child = spawn(process.execPath, ['server.js'], {
        cwd: repo_root,
        env: {...process.env, API_TOKEN: 'dummy-token', ...env},
    });
    let stderr = '';
    const finish = fn=>{
        clearTimeout(timer);
        child.kill();
        fn();
    };
    const timer = setTimeout(()=>finish(()=>reject(
        new Error(`timed out waiting for config warnings; stderr so far:\n`
            +stderr))), 15000);
    child.stderr.on('data', chunk=>{
        stderr += chunk;
        if (is_done(stderr))
            finish(()=>res(stderr));
    });
    child.on('exit', code=>finish(()=>reject(
        new Error(`server exited early (code ${code}); stderr:\n${stderr}`))));
});

test('malformed numeric env vars warn and fall back instead of NaN', async()=>{
    const stderr = await boot_and_capture(
        {BASE_MAX_RETRIES: 'three', POLLING_TIMEOUT: 'abc'},
        s=>s.includes('BASE_MAX_RETRIES') && s.includes('POLLING_TIMEOUT'));
    assert.match(stderr,
        /\[config\] Ignoring BASE_MAX_RETRIES="three".*Using 0\./);
    assert.match(stderr,
        /\[config\] Ignoring POLLING_TIMEOUT="abc".*Using 600\./);
});

test('negative BASE_MAX_RETRIES warns and falls back', async()=>{
    const stderr = await boot_and_capture(
        {BASE_MAX_RETRIES: '-1'},
        s=>s.includes('BASE_MAX_RETRIES'));
    assert.match(stderr,
        /\[config\] Ignoring BASE_MAX_RETRIES="-1".*Using 0\./);
});

test('well-formed numeric env vars produce no config warning', async()=>{
    // "Checking for required zones..." is the first line after the config
    // block evaluates, so reaching it proves no warning was emitted.
    const stderr = await boot_and_capture(
        {BASE_MAX_RETRIES: '2', POLLING_TIMEOUT: '300', BASE_TIMEOUT: '30'},
        s=>s.includes('Checking for required zones'));
    assert.doesNotMatch(stderr, /\[config\] Ignoring/);
});
