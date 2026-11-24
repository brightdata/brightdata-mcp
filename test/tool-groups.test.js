'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve_tool} from '../tool_groups.js';

test('resolve_tool maps scrape_as_markdown to web_fetch', ()=>{
    assert.deepEqual(resolve_tool('scrape_as_markdown'), ['web_fetch']);
    assert.deepEqual(resolve_tool('web_fetch'), ['web_fetch']);
});
