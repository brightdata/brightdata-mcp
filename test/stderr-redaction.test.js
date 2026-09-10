'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {start_stub_server, stub_env, close_stub_server}
    from '../test-helpers/stub-server.js';

const test_dir = dirname(fileURLToPath(import.meta.url));
const repo_root = resolve(test_dir, '..');

function connect_with_stderr_capture(env){
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: ['server.js'],
        cwd: repo_root,
        env,
        stderr: 'pipe',
    });
    let stderr_data = '';
    transport.stderr?.on('data', chunk=>{ stderr_data += chunk.toString(); });
    const client = new Client(
        {name: 'stderr-redaction-test', version: '0.0.1'},
        {capabilities: {tools: {}}});
    return {client, transport, get_stderr: ()=>stderr_data};
}

test('stderr never contains a denylisted argument field (e.g. '
    +'extraction_prompt) logged by tool_fn', async(t)=>{
        const stub = await start_stub_server();
        t.after(()=>close_stub_server(stub));
        const secret_token = 'stderr-canary-api-token-should-not-leak';
        const canary_prompt = 'CANARY_EXTRACTION_PROMPT_should_be_redacted';
        const env = stub_env(stub, {API_TOKEN: secret_token,
            PRO_MODE: 'true'});
        const {client, transport, get_stderr} =
            connect_with_stderr_capture(env);
        try {
            await client.connect(transport);
            await client.callTool({name: 'extract', arguments: {
                url: 'https://good.example/success',
                extraction_prompt: canary_prompt,
            }});
        } catch(_e){
            // The tool may fail past the logging point (e.g. no sampling
            // session available); that is irrelevant to this test.
        } finally {
            await client.close();
        }
        const stderr_text = get_stderr();
        assert.match(stderr_text, /\[extract] executing/,
            'sanity check: the executing log line must actually be '
            +'produced, otherwise this test would pass vacuously');
        assert.doesNotMatch(stderr_text, new RegExp(canary_prompt),
            'extraction_prompt must be redacted before being logged');
        assert.doesNotMatch(stderr_text, new RegExp(secret_token),
            'the API token must never appear in stderr');
    });

test('stderr never contains the API token even when it is embedded in '
    +'a field that is not on the sensitive-field denylist (e.g. a URL '
    +'query parameter)', async(t)=>{
        const stub = await start_stub_server();
        t.after(()=>close_stub_server(stub));
        const secret_token = 'stderr-canary-token-in-url-should-not-leak';
        const env = stub_env(stub, {API_TOKEN: secret_token});
        delete env.PRO_MODE;
        delete env.GROUPS;
        delete env.TOOLS;
        const {client, transport, get_stderr} =
            connect_with_stderr_capture(env);
        try {
            await client.connect(transport);
            await client.callTool({name: 'scrape_batch', arguments: {
                urls: [`https://good.example/success?token=${secret_token}`],
            }});
        } catch(_e){
            /* irrelevant to this test */
        } finally {
            await client.close();
        }
        const stderr_text = get_stderr();
        assert.match(stderr_text, /\[scrape_batch] executing/,
            'sanity check: the executing log line must actually be '
            +'produced, otherwise this test would pass vacuously');
        assert.doesNotMatch(stderr_text, new RegExp(secret_token),
            'the API token must be stripped by exact-value redaction even '
            +'under an unlisted key name like "urls"');
    });
