'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const test_dir = dirname(fileURLToPath(import.meta.url));
const repo_root = resolve(test_dir, '..');

function start_stub_server(){
    return new Promise(done=>{
        const server = http.createServer((req, res)=>{
            let body = '';
            req.on('data', chunk=>{ body += chunk; });
            req.on('end', ()=>{
                if (req.method=='GET'
                    && req.url.startsWith('/zone/get_active_zones'))
                {
                    res.writeHead(200, {'Content-Type': 'application/json'});
                    res.end('[]');
                    return;
                }
                if (req.method=='POST' && req.url=='/zone')
                {
                    res.writeHead(200, {'Content-Type': 'application/json'});
                    res.end('{}');
                    return;
                }
                if (req.method=='POST' && req.url=='/request')
                {
                    let parsed = {};
                    try { parsed = JSON.parse(body); } catch(e){ /* ignore */ }
                    const target_url = parsed.url || '';
                    if (target_url.includes('bad.example'))
                    {
                        res.writeHead(400, {'Content-Type': 'application/json'});
                        res.end(JSON.stringify({error: 'zone not found'}));
                        return;
                    }
                    res.writeHead(200, {'Content-Type': 'text/plain'});
                    res.end('# Example\n\nHello world.');
                    return;
                }
                res.writeHead(404);
                res.end();
            });
        });
        server.listen(0, '127.0.0.1', ()=>done(server));
    });
}

test('scrape_batch is available without PRO_MODE and sanitizes a partial '
    +'batch (one success, one failure) fully offline', async()=>{
        const stub = await start_stub_server();
        const {port} = stub.address();
        const secret_token = 'offline-canary-token-should-not-leak';
        const env = {
            ...process.env,
            API_TOKEN: secret_token,
            BRIGHTDATA_API_URL: `http://127.0.0.1:${port}`,
        };
        delete env.PRO_MODE;
        delete env.GROUPS;
        delete env.TOOLS;

        const client = new Client(
            {name: 'server-health-test', version: '0.0.1'},
            {capabilities: {tools: {}}});
        const transport = new StdioClientTransport({
            command: process.execPath,
            args: ['server.js'],
            cwd: repo_root,
            env,
        });
        try {
            await client.connect(transport);
            const tools = await client.listTools();
            assert.ok(tools.tools.some(tool=>tool.name=='scrape_batch'),
                'scrape_batch is available in the default tool set '
                +'without PRO_MODE');

            const result = await client.callTool({name: 'scrape_batch',
                arguments: {urls: ['https://good.example/success',
                    'https://bad.example/fail']}});
            const text_block = result.content.find(block=>block.type=='text');
            assert.ok(text_block, 'scrape_batch returned text content');

            const parsed = JSON.parse(text_block.text);
            assert.equal(parsed.length, 2, 'both URLs produced a result');
            assert.ok(parsed.some(r=>r.status=='fulfilled'),
                'the successful URL is reported as fulfilled');
            assert.ok(parsed.some(r=>r.status=='rejected'),
                'the failing URL is reported as rejected');

            assert.doesNotMatch(text_block.text, new RegExp(secret_token),
                'result must never contain the API token');
            assert.doesNotMatch(text_block.text, /authorization/i,
                'result must never contain request headers');
            assert.doesNotMatch(text_block.text, /"config"/i,
                'result must never contain raw axios config');
            assert.doesNotMatch(text_block.text, /"request"/i,
                'result must never contain a raw axios request object');
        } finally {
            await client.close();
            stub.close();
        }
    });
