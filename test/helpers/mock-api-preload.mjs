'use strict'; /*jslint node:true es9:true*/
// Test-only preload module. It is NOT a test file and registers no tests.
//
// The MCP server hard-codes https://api.brightdata.com in every request, so
// tests start it as:
//
//   node --import <this file> server.js
//
// with MOCK_BRIGHTDATA_BASE=http://127.0.0.1:<port> in the environment. Every
// call the server makes to api.brightdata.com is then served by the local mock
// HTTP server owned by the test process, and no real (billable) request is
// ever made. Nothing in the server source is modified: the redirect happens in
// the transport layer of the child process only.
//
// Three layers are patched so the redirect survives any reasonable
// implementation of the wait-budget change:
//   1. an axios request interceptor on the default instance (and on instances
//      created later through axios.create),
//   2. https.request / https.get, which catches any axios instance built
//      before this module ran and any hand-rolled node:https client,
//   3. globalThis.fetch, in case the new code path uses fetch instead.
//
// With MOCK_BRIGHTDATA_BASE unset this module does nothing at all.
import http from 'node:http';
import https from 'node:https';
import axios from 'axios';

const target = (process.env.MOCK_BRIGHTDATA_BASE||'').replace(/\/+$/, '');
const API_HOST = 'api.brightdata.com';
const API_ORIGIN = /^https?:\/\/api\.brightdata\.com/i;

if (target)
{
    const mock = new URL(target);
    const rewrite = url=>{
        if (url instanceof URL)
            url = url.toString();
        if (typeof url!='string')
            return url;
        return url.replace(API_ORIGIN, target);
    };
    const install = instance=>{
        instance.interceptors.request.use(config=>{
            config.url = rewrite(config.url);
            if (config.baseURL)
                config.baseURL = rewrite(config.baseURL);
            return config;
        });
        return instance;
    };
    install(axios);
    const create = axios.create.bind(axios);
    axios.create = (...args)=>install(create(...args));

    const redirect = args=>{
        let [first, second, third] = args;
        let url = null;
        let options = null;
        let cb = null;
        if (typeof first=='string' || first instanceof URL)
        {
            url = new URL(first.toString());
            if (typeof second=='function')
                cb = second;
            else
            {
                options = second||{};
                cb = third;
            }
        }
        else
        {
            options = first||{};
            cb = typeof second=='function' ? second : third;
        }
        options = {...options};
        const raw_host = (url ? url.hostname
            : options.hostname||options.host||'').toString();
        if (raw_host.split(':')[0].toLowerCase()!=API_HOST)
            return null;
        const next = {
            ...options,
            protocol: 'http:',
            hostname: mock.hostname,
            port: mock.port,
            host: undefined,
            path: url ? `${url.pathname}${url.search}` : options.path,
            agent: undefined,
            headers: {...options.headers||{}},
        };
        delete next.headers.host;
        delete next.headers.Host;
        return cb ? http.request(next, cb) : http.request(next);
    };
    const https_request = https.request.bind(https);
    const https_get = https.get.bind(https);
    https.request = function(...args){
        try {
            const req = redirect(args);
            if (req)
                return req;
        } catch(e){ /* fall back to the real transport */ }
        return https_request(...args);
    };
    https.get = function(...args){
        try {
            const req = redirect(args);
            if (req)
            {
                req.end();
                return req;
            }
        } catch(e){ /* fall back to the real transport */ }
        return https_get(...args);
    };

    const original_fetch = globalThis.fetch;
    if (typeof original_fetch=='function')
    {
        globalThis.fetch = function(input, init){
            try {
                if (typeof input=='string' || input instanceof URL)
                    return original_fetch(rewrite(input), init);
                if (input && typeof input.url=='string'
                    && API_ORIGIN.test(input.url))
                {
                    return original_fetch(
                        new Request(rewrite(input.url), input), init);
                }
            } catch(e){ /* fall back to the real fetch */ }
            return original_fetch(input, init);
        };
    }
}
