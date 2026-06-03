'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {filter_fields} from '../field_filter.js';

// Empty and null inputs
test('empty array returns empty array', ()=>{
    assert.deepEqual(filter_fields([], ['title', 'url']), []);
});

test('null results returns null', ()=>{
    assert.equal(filter_fields(null, ['title']), null);
});

test('undefined results returns undefined', ()=>{
    assert.equal(filter_fields(undefined, ['title']), undefined);
});

// Empty field list returns the items untouched
test('empty fields array returns original items', ()=>{
    const items = [{a: 1, b: 2}, {c: 3}];
    assert.deepEqual(filter_fields(items, []), items);
});

test('null fields array returns original items', ()=>{
    const items = [{a: 1}];
    assert.deepEqual(filter_fields(items, null), items);
});

// Null/undefined items collapse to {}
test('null item in array returns empty object', ()=>{
    assert.deepEqual(
        filter_fields([{title: 'a'}, null, {title: 'b'}], ['title']),
        [{title: 'a'}, {}, {title: 'b'}]);
});

test('undefined item in array returns empty object', ()=>{
    assert.deepEqual(
        filter_fields([{title: 'a'}, undefined, {title: 'b'}], ['title']),
        [{title: 'a'}, {}, {title: 'b'}]);
});

test('null item with non-empty fields returns empty object', ()=>{
    assert.deepEqual(filter_fields([null], ['title']), [{}]);
});

// Field selection
test('select single field', ()=>{
    assert.deepEqual(
        filter_fields([{title: 'Hello', url: 'http://x.com', desc: 'Desc'}],
            ['title']),
        [{title: 'Hello'}]);
});

test('select multiple fields', ()=>{
    assert.deepEqual(
        filter_fields([{title: 'Hello', url: 'http://x.com', desc: 'Desc'}],
            ['title', 'url']),
        [{title: 'Hello', url: 'http://x.com'}]);
});

test('select fields that do not exist returns empty object', ()=>{
    assert.deepEqual(filter_fields([{title: 'Hello'}], ['url', 'desc']),
        [{}]);
});

test('select fields from multiple items', ()=>{
    const items = [
        {title: 'A', url: 'http://a.com'},
        {title: 'B', url: 'http://b.com'},
    ];
    assert.deepEqual(filter_fields(items, ['title']),
        [{title: 'A'}, {title: 'B'}]);
});

// Field ordering follows the requested order
test('fields are returned in specified order', ()=>{
    assert.deepEqual(filter_fields([{z: 1, a: 2, m: 3}], ['a', 'm', 'z']),
        [{a: 2, m: 3, z: 1}]);
});

// Duplicate field names are deduplicated by the output object
test('duplicate fields in list are deduplicated', ()=>{
    assert.deepEqual(filter_fields([{title: 'Hello'}], ['title', 'title']),
        [{title: 'Hello'}]);
});

// Non-object items
test('non-object item in array returns empty object', ()=>{
    assert.deepEqual(filter_fields([42, 'string', true], ['a']),
        [{}, {}, {}]);
});

test('mixed object and non-object items', ()=>{
    assert.deepEqual(
        filter_fields([{title: 'A'}, 42, {title: 'B'}], ['title']),
        [{title: 'A'}, {}, {title: 'B'}]);
});

// Large field list
test('large field list is handled', ()=>{
    const fields = Array.from({length: 1000}, (_, i)=>`field${i}`);
    const r = filter_fields([{field0: 0, field500: 500, field999: 999}],
        fields);
    assert.deepEqual(r, [{field0: 0, field500: 500, field999: 999}]);
});

// Special characters and numeric-looking field names
test('fields with special chars', ()=>{
    assert.deepEqual(
        filter_fields([{'field-name': 1, 'field_name': 2, 'field.name': 3}],
            ['field-name', 'field_name']),
        [{'field-name': 1, 'field_name': 2}]);
});

test('numeric-looking field names', ()=>{
    assert.deepEqual(filter_fields([{'123': 'num', '0': 'zero'}], ['123', '0']),
        [{'123': 'num', '0': 'zero'}]);
});

// Nested objects are kept as values (only top-level keys are selected)
test('nested objects are preserved as values', ()=>{
    assert.deepEqual(
        filter_fields([{title: 'A', meta: {k: 'v'}}], ['title', 'meta']),
        [{title: 'A', meta: {k: 'v'}}]);
});

// Prototype-pollution guard: protected keys are never copied even if requested
test('protected prototype keys are never copied', ()=>{
    assert.deepEqual(
        filter_fields([{a: 1}], ['__proto__', 'constructor', 'prototype', 'a']),
        [{a: 1}]);
});
