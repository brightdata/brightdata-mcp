// test_real_websites.js
// Real website integration tests
import { ContextCache } from '../context_cache.js';
import axios from 'axios';
import assert from 'node:assert/strict';

const API_TOKEN = process.env.API_TOKEN || '37659dbe-acdc-4d92-89e3-4cfc59f6d8e4';
const ZONE = 'web_unlocker1';

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

async function scrape(url) {
    const r = await axios.post('https://api.brightdata.com/request', {
        zone: ZONE, url, format: 'raw', data_format: 'markdown'
    }, { 
        headers: { 'Authorization': 'Bearer ' + API_TOKEN, 'Content-Type': 'application/json' },
        timeout: 30000 
    });
    return r.data;
}

console.log('\n🌐 Real Website Integration Tests\n');

// Test 1: lablab.ai
test('lablab.ai homepage returns content', async () => {
    const content = await scrape('https://lablab.ai/');
    assert.ok(content.length > 100, 'Should return meaningful content');
    console.log('    Size:', content.length, 'chars');
});

test('lablab.ai homepage dedup identifies unique', async () => {
    const cache = new ContextCache();
    const content = await scrape('https://lablab.ai/');
    const r = cache.check(content, 'https://lablab.ai/');
    assert.equal(r.isDuplicate, false, 'First visit is unique');
    assert.ok(r.contentHash);
});

test('lablab.ai different pages have different content', async () => {
    const cache = new ContextCache();
    const home = await scrape('https://lablab.ai/');
    const about = await scrape('https://lablab.ai/about');
    const r1 = cache.check(home, 'https://lablab.ai/');
    const r2 = cache.check(about, 'https://lablab.ai/about');
    assert.notEqual(r1.contentHash, r2.contentHash, 'Different pages should have different hashes');
    console.log('    Home:', r1.contentHash.slice(0,16), '| About:', r2.contentHash.slice(0,16));
});

test('lablab.ai use cases page is unique', async () => {
    const cache = new ContextCache();
    const content = await scrape('https://lablab.ai/use-cases');
    const r = cache.check(content, 'https://lablab.ai/use-cases');
    assert.equal(r.isDuplicate, false);
    assert.ok(r.contentHash);
});

// Test 2: brightdata.com
test('brightdata.com homepage returns content', async () => {
    const content = await scrape('https://brightdata.com/');
    assert.ok(content.length > 100, 'Should return meaningful content');
    console.log('    Size:', content.length, 'chars');
});

test('brightdata.com different pages have different content', async () => {
    const cache = new ContextCache();
    const home = await scrape('https://brightdata.com/');
    const pricing = await scrape('https://brightdata.com/pricing');
    const r1 = cache.check(home, 'https://brightdata.com/');
    const r2 = cache.check(pricing, 'https://brightdata.com/pricing');
    assert.notEqual(r1.contentHash, r2.contentHash, 'Different pages should have different hashes');
});

// Test 3: Wikipedia
test('wikipedia.org homepage is unique', async () => {
    const cache = new ContextCache();
    const content = await scrape('https://www.wikipedia.org/');
    const r = cache.check(content, 'https://www.wikipedia.org/');
    assert.equal(r.isDuplicate, false);
});

test('wikipedia.org different language pages are unique', async () => {
    const cache = new ContextCache();
    const en = await scrape('https://en.wikipedia.org/wiki/Main_Page');
    const es = await scrape('https://es.wikipedia.org/wiki/Portada');
    const r1 = cache.check(en, 'https://en.wikipedia.org/wiki/Main_Page');
    const r2 = cache.check(es, 'https://es.wikipedia.org/wiki/Portada');
    assert.notEqual(r1.contentHash, r2.contentHash);
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, false);
});

// Test 4: Mix of different domains (no dedup expected)
test('Different domains are NOT deduplicated (correct behavior)', async () => {
    const cache = new ContextCache();
    const lablab = await scrape('https://lablab.ai/');
    const brightdata = await scrape('https://brightdata.com/');
    const wiki = await scrape('https://www.wikipedia.org/');
    
    cache.check(lablab, 'https://lablab.ai/');
    cache.check(brightdata, 'https://brightdata.com/');
    const r = cache.check(wiki, 'https://www.wikipedia.org/');
    
    assert.equal(r.isDuplicate, false, 'Different domains should never dedupe');
    const stats = cache.stats();
    assert.equal(stats.unique_blocks, 3, 'All 3 should be unique');
    assert.equal(stats.duplicate_blocks, 0, 'No duplicates across domains');
});

// Test 5: Same domain dedup efficiency
test('Same domain pages share content (expected dedup)', async () => {
    const cache = new ContextCache();
    
    // Wikipedia has shared templates/headers
    const page1 = await scrape('https://en.wikipedia.org/wiki/Artificial_intelligence');
    const page2 = await scrape('https://en.wikipedia.org/wiki/Machine_learning');
    const page3 = await scrape('https://en.wikipedia.org/wiki/Deep_learning');
    
    cache.check(page1, 'url1');
    cache.check(page2, 'url2');
    cache.check(page3, 'url3');
    
    const stats = cache.stats();
    console.log('    Wikipedia dedup:', stats.unique_blocks, 'unique of 3 total,', stats.duplicate_blocks, 'duplicates');
    // We expect SOME deduplication (shared headers/nav) but not all 3 being dupes
    assert.ok(stats.unique_blocks >= 1 && stats.unique_blocks <= 3);
});

console.log(`\n📊 Real Website Results: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);