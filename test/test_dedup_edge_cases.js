// test_dedup_edge_cases.js
// Disaster recovery tests for scrape_batch deduplication
import { ContextCache, filterFields } from '../context_cache.js';
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

console.log('\n🧪 Dedup Edge Case Tests\n');

test('Empty string content', () => {
    const cache = new ContextCache();
    const r = cache.check('', 'https://a.com');
    // Empty string has length 0, should still get a hash
    assert.ok(r.contentHash, 'Should have a hash even for empty content');
    assert.equal(r.isDuplicate, false, 'First empty content is unique');
    
    // Second empty from different URL should be duplicate
    const r2 = cache.check('', 'https://b.com');
    assert.equal(r2.isDuplicate, true, 'Second empty content is duplicate');
});

test('Single character content', () => {
    const cache = new ContextCache();
    const r = cache.check('X', 'https://a.com');
    assert.equal(r.isDuplicate, false, 'Single char should be unique');
    assert.ok(r.contentHash);
});

test('Content exactly at prefix boundary (2048 chars)', () => {
    const cache = new ContextCache();
    const exactly2048 = 'B'.repeat(2048);
    const r = cache.check(exactly2048, 'https://a.com');
    assert.equal(r.isDuplicate, false, 'Exactly 2048 chars should be unique');
    assert.ok(r.contentHash);
});

test('Content at prefix+1 boundary', () => {
    const cache = new ContextCache();
    const content1 = 'C'.repeat(2049);
    const content2 = 'C'.repeat(2049) + 'X';
    
    const r1 = cache.check(content1, 'https://a.com');
    const r2 = cache.check(content2, 'https://b.com');
    
    // Different length = different hash even if prefix same
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, false);
    assert.notEqual(r1.contentHash, r2.contentHash);
});

test('Very long content (50000 chars)', () => {
    const cache = new ContextCache();
    const long = 'D'.repeat(50000);
    const r = cache.check(long, 'https://a.com');
    assert.equal(r.isDuplicate, false);
    assert.ok(r.contentHash);
});

test('filterFields with non-existent field returns object without it', () => {
    const results = [{ link: 'https://a.com', title: 'A' }];
    const filtered = filterFields(results, ['link', 'nonexistent']);
    assert.deepEqual(filtered[0], { link: 'https://a.com' });
});

test('filterFields with empty results array', () => {
    const filtered = filterFields([], ['link']);
    assert.deepEqual(filtered, []);
});

test('filterFields with null/undefined item', () => {
    const results = [{ link: 'https://a.com' }, null, { link: 'https://b.com' }];
    const filtered = filterFields(results, ['link']);
    assert.deepEqual(filtered[1], {}); // null item returns empty object
});

console.log(`\n📊 Edge Case Results: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);