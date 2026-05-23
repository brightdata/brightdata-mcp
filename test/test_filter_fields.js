// test_filter_fields.js
// Comprehensive filterFields edge case tests
import { filterFields } from '../context_cache.js';
import assert from 'node:assert/strict';

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (e) {
        console.error(`  ❌ ${name}: ${e.message}`);
        failed++;
    }
}

console.log('\n� filterFields Edge Case Tests\n');

// 1. Empty and null inputs
test('empty array returns empty array', () => {
    const r = filterFields([], ['title', 'url']);
    assert.deepEqual(r, []);
});

test('null results returns null', () => {
    const r = filterFields(null, ['title']);
    assert.equal(r, null);
});

test('undefined results returns undefined', () => {
    const r = filterFields(undefined, ['title']);
    assert.equal(r, undefined);
});

// 2. Empty field list
test('empty fields array returns original items', () => {
    const items = [{ a: 1, b: 2 }, { c: 3 }];
    const r = filterFields(items, []);
    assert.deepEqual(r, items);
});

test('null fields array returns original items', () => {
    const items = [{ a: 1 }];
    const r = filterFields(items, null);
    assert.deepEqual(r, items);
});

// 3. Null/undefined items in array
test('null item in array returns empty object', () => {
    const r = filterFields([{ title: 'a' }, null, { title: 'b' }], ['title']);
    assert.deepEqual(r, [{ title: 'a' }, {}, { title: 'b' }]);
});

test('undefined item in array returns empty object', () => {
    const r = filterFields([{ title: 'a' }, undefined, { title: 'b' }], ['title']);
    assert.deepEqual(r, [{ title: 'a' }, {}, { title: 'b' }]);
});

test('null item with non-empty fields returns empty object', () => {
    const r = filterFields([null], ['title']);
    assert.deepEqual(r, [{}]);
});

// 4. Field selection
test('select single field', () => {
    const r = filterFields([{ title: 'Hello', url: 'http://x.com', desc: 'Desc' }], ['title']);
    assert.deepEqual(r, [{ title: 'Hello' }]);
});

test('select multiple fields', () => {
    const r = filterFields([{ title: 'Hello', url: 'http://x.com', desc: 'Desc' }], ['title', 'url']);
    assert.deepEqual(r, [{ title: 'Hello', url: 'http://x.com' }]);
});

test('select fields that dont exist returns empty object for that item', () => {
    const r = filterFields([{ title: 'Hello' }], ['url', 'desc']);
    assert.deepEqual(r, [{}]);
});

test('select fields from multiple items', () => {
    const items = [
        { title: 'A', url: 'http://a.com' },
        { title: 'B', url: 'http://b.com' },
    ];
    const r = filterFields(items, ['title']);
    assert.deepEqual(r, [{ title: 'A' }, { title: 'B' }]);
});

// 5. Field ordering preserved
test('fields are returned in specified order', () => {
    const r = filterFields([{ z: 1, a: 2, m: 3 }], ['a', 'm', 'z']);
    assert.deepEqual(r, [{ a: 2, m: 3, z: 1 }]);
});

// 6. Duplicate fields in list (should dedupe)
test('duplicate fields in list are deduplicated', () => {
    const r = filterFields([{ title: 'Hello' }], ['title', 'title']);
    assert.deepEqual(r, [{ title: 'Hello' }]);
});

// 7. Non-object items
test('non-object item in array returns empty object', () => {
    const r = filterFields([42, 'string', true], ['a']);
    assert.deepEqual(r, [{}, {}, {}]);
});

test('mixed object and non-object items', () => {
    const r = filterFields([{ title: 'A' }, 42, { title: 'B' }], ['title']);
    assert.deepEqual(r, [{ title: 'A' }, {}, { title: 'B' }]);
});

// 8. Very large field list
test('large field list is handled', () => {
    const fields = Array.from({ length: 1000 }, (_, i) => `field${i}`);
    const item = { field0: 0, field500: 500, field999: 999 };
    const r = filterFields([item], fields);
    assert.equal(r.length, 1);
    assert.ok(r[0].field0 === 0);
    assert.ok(r[0].field500 === 500);
    assert.ok(r[0].field999 === 999);
});

// 9. Special characters in field names
test('fields with special chars', () => {
    const r = filterFields([{ 'field-name': 1, 'field_name': 2, 'field.name': 3 }], ['field-name', 'field_name']);
    assert.deepEqual(r, [{ 'field-name': 1, 'field_name': 2 }]);
});

test('numeric-looking field names', () => {
    const r = filterFields([{ '123': 'num', '0': 'zero' }], ['123', '0']);
    assert.deepEqual(r, [{ '123': 'num', '0': 'zero' }]);
});

// 10. Nested objects (should only get top-level)
test('nested objects are preserved as values', () => {
    const item = { title: 'A', meta: { k: 'v' } };
    const r = filterFields([item], ['title', 'meta']);
    assert.deepEqual(r, [{ title: 'A', meta: { k: 'v' } }]);
});

console.log(`\n📊 filterFields Results: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);