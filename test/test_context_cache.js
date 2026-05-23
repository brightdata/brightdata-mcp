// test_context_cache.js — Tests for ContextForge dedup layer
// Run: node --experimental-vm-modules test/test_context_cache.js
import { ContextCache, filterFields, buildForgeMetrics } from '../context_cache.js';
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

console.log('\n🧪 ContextCache — INV-CF-1 tests\n');

test('New content is not duplicate', () => {
    const cache = new ContextCache();
    const result = cache.check('Hello world unique content', 'https://a.com');
    assert.equal(result.isDuplicate, false);
    assert.ok(result.contentHash);
});

test('Same content from different URL is flagged as duplicate', () => {
    const cache = new ContextCache();
    const content = 'Identical navigation header repeated across pages';
    cache.check(content, 'https://a.com');
    const r2 = cache.check(content, 'https://b.com');
    assert.equal(r2.isDuplicate, true);
    assert.equal(r2.duplicateOf, 'https://a.com');
});

test('Different content is NOT flagged as duplicate', () => {
    const cache = new ContextCache();
    cache.check('Content A about machine learning', 'https://a.com');
    const r2 = cache.check('Content B about web scraping', 'https://b.com');
    assert.equal(r2.isDuplicate, false);
});

test('Stats track hits and misses correctly', () => {
    const cache = new ContextCache();
    cache.check('Content A', 'https://a.com');
    cache.check('Content A', 'https://b.com'); // duplicate
    cache.check('Content B', 'https://c.com');
    const stats = cache.stats();
    assert.equal(stats.duplicate_blocks, 1);
    assert.ok(stats.bytes_saved > 0);
});

test('filterFields returns only requested fields', () => {
    const results = [
        { link: 'https://a.com', title: 'A', description: 'Desc A', metadata: 'extra' },
        { link: 'https://b.com', title: 'B', description: 'Desc B', metadata: 'extra' },
    ];
    const filtered = filterFields(results, ['link', 'title']);
    assert.deepEqual(Object.keys(filtered[0]), ['link', 'title']);
    assert.equal('metadata' in filtered[0], false);
});

test('buildForgeMetrics returns valid structure', () => {
    const cache = new ContextCache();
    cache.check('test', 'https://a.com');
    const metrics = buildForgeMetrics(cache, { total_ms: 123 });
    assert.equal(metrics.invariant, 'INV-CF-1');
    assert.ok(metrics.doi.includes('zenodo'));
    assert.ok(metrics.timestamp_utc);
});

test('Content differing after 2048 chars with same length is NOT flagged duplicate', () => {
    const cache = new ContextCache();
    const prefix = 'A'.repeat(2048);
    const content1 = prefix + 'UNIQUE_BODY_CONTENT_AAAA';
    const content2 = prefix + 'UNIQUE_BODY_CONTENT_BBBB';
    
    const r1 = cache.check(content1, 'https://a.com');
    const r2 = cache.check(content2, 'https://b.com');
    
    // Both should be unique because content length differs
    assert.equal(r1.isDuplicate, false, 'First content should be UNIQUE');
    assert.equal(r2.isDuplicate, false, 'Second content should be UNIQUE (different body)');
    assert.notEqual(r1.contentHash, r2.contentHash, 'Hashes should differ');
});

test('Content with same prefix but different length is NOT flagged duplicate', () => {
    const cache = new ContextCache();
    const prefix = 'X'.repeat(2048);
    const content1 = prefix + 'A';  // 2049 chars total
    const content2 = prefix + 'AB'; // 2050 chars total
    
    const r1 = cache.check(content1, 'https://a.com');
    const r2 = cache.check(content2, 'https://b.com');
    
    assert.equal(r1.isDuplicate, false, 'First should be UNIQUE');
    assert.equal(r2.isDuplicate, false, 'Second should be UNIQUE (different length)');
});

test('Stats with complex dedup scenario', () => {
    const cache = new ContextCache();
    // 3 URLs, 2 with same content (duplicate), 1 unique
    const same = 'Shared content header and footer';
    cache.check(same, 'https://a.com');
    cache.check(same, 'https://b.com'); // duplicate
    cache.check('Different unique content', 'https://c.com');
    
    const stats = cache.stats();
    assert.equal(stats.unique_blocks, 2, 'Should have 2 unique blocks');
    assert.equal(stats.duplicate_blocks, 1, 'Should have 1 duplicate');
    assert.ok(stats.bytes_saved > 0, 'Should have saved bytes');
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);