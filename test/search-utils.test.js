'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {clean_google_search_payload, parse_google_search_response}
    from '../search_utils.js';

test('clean_google_search_payload keeps valid organic results', ()=>{
    const payload = clean_google_search_payload({
        organic: [
            {
                link: ' https://example.com ',
                title: ' Example ',
                description: ' Sample ',
            },
            {
                link: '',
                title: 'Missing link',
                description: 'Ignored',
            },
        ],
    });

    assert.deepEqual(payload, {
        organic: [{
            link: 'https://example.com',
            title: 'Example',
            description: 'Sample',
        }],
    });
});

test('parse_google_search_response throws on invalid JSON body', ()=>{
    assert.throws(
        ()=>parse_google_search_response('<html>blocked</html>',
            'search_engine'),
        /Unexpected non-JSON response from Bright Data for search_engine\./);
});
