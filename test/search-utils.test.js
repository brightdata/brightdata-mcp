'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {clean_search_payload, parse_search_response}
    from '../search_utils.js';

test('clean_search_payload keeps valid organic results', ()=>{
    const payload = clean_search_payload({
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

test('parse_search_response throws service_unavailable on non-JSON', ()=>{
    assert.throws(()=>parse_search_response('<html>blocked</html>',
        'google'), /^UserError: service_unavailable: google search failed/);
});
