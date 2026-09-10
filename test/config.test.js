'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {get_brightdata_api_url} from '../config.js';

test('get_brightdata_api_url returns the default outside of NODE_ENV=test',
    ()=>{
        assert.equal(get_brightdata_api_url({}),
            'https://api.brightdata.com');
        assert.equal(get_brightdata_api_url({NODE_ENV: 'production',
            BRIGHTDATA_API_URL: 'http://attacker.example'}),
            'https://api.brightdata.com');
    });

test('get_brightdata_api_url returns the default when BRIGHTDATA_API_URL '
    +'is unset in test mode', ()=>{
        assert.equal(get_brightdata_api_url({NODE_ENV: 'test'}),
            'https://api.brightdata.com');
    });

test('get_brightdata_api_url accepts loopback overrides in test mode',
    ()=>{
        assert.equal(get_brightdata_api_url({NODE_ENV: 'test',
            BRIGHTDATA_API_URL: 'http://127.0.0.1:1234'}),
            'http://127.0.0.1:1234');
        assert.equal(get_brightdata_api_url({NODE_ENV: 'test',
            BRIGHTDATA_API_URL: 'http://localhost:1234'}),
            'http://localhost:1234');
        assert.equal(get_brightdata_api_url({NODE_ENV: 'test',
            BRIGHTDATA_API_URL: 'http://[::1]:1234'}),
            'http://[::1]:1234');
    });

test('get_brightdata_api_url rejects a non-loopback override in test mode',
    ()=>{
        assert.throws(()=>get_brightdata_api_url({NODE_ENV: 'test',
            BRIGHTDATA_API_URL: 'http://attacker.example'}), /loopback/);
    });

test('get_brightdata_api_url rejects a non-http(s) protocol in test mode',
    ()=>{
        assert.throws(()=>get_brightdata_api_url({NODE_ENV: 'test',
            BRIGHTDATA_API_URL: 'ftp://127.0.0.1'}), /HTTP or HTTPS/);
    });
