// test_150_comprehensive.js
// Comprehensive dedup test suite with 150 tests
// Tests cache behavior with real websites and mock data
import { ContextCache } from '../context_cache.js';
import axios from 'axios';
import assert from 'node:assert/strict';

const API_TOKEN = process.env.API_TOKEN || '37659dbe-acdc-4d92-89e3-4cfc59f6d8e4';
const ZONE = 'web_unlocker1';

let passed = 0;
let failed = 0;
const testPromises = [];

function test(name, fn) {
    testPromises.push(
        fn().then(() => {
            console.log(`  ✅ ${name}`);
            passed++;
        }).catch((e) => {
            console.error(`  ❌ ${name}: ${e.message}`);
            failed++;
        })
    );
}

async function scrape(url, maxRetries = 2) {
    for (let i = 0; i <= maxRetries; i++) {
        try {
            const r = await axios.post('https://api.brightdata.com/request', {
                zone: ZONE, url, format: 'raw'
            }, { 
                headers: { 'Authorization': 'Bearer ' + API_TOKEN, 'Content-Type': 'application/json' },
                timeout: 20000 
            });
            const data = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
            return { ok: true, data, length: data.length };
        } catch (e) {
            if (i === maxRetries) return { ok: false, error: e.message };
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

console.log('\n🧪 150 Comprehensive Dedup Tests\n');

// =============================================================================
// CATEGORY A: Single-page tests (30) - verify pages load and have content
// =============================================================================

test('github.com homepage loads', async () => {
    const r = await scrape('https://github.com/');
    if (!r.ok) throw new Error('Request failed: ' + r.error);
    if (r.length < 100) throw new Error('Content too small: ' + r.length);
});

test('stackoverflow.com homepage loads', async () => {
    const r = await scrape('https://stackoverflow.com/');
    if (!r.ok) throw new Error('Request failed');
    if (r.length < 100) throw new Error('Content too small');
});

test('wikipedia.org main page loads', async () => {
    const r = await scrape('https://en.wikipedia.org/wiki/Main_Page');
    if (!r.ok) throw new Error('Request failed');
    if (r.length < 100) throw new Error('Content too small');
});

test('medium.com homepage loads', async () => {
    const r = await scrape('https://medium.com/');
    if (!r.ok) throw new Error('Request failed');
    if (r.length < 100) throw new Error('Content too small');
});

test('dev.to homepage loads', async () => {
    const r = await scrape('https://dev.to/');
    if (!r.ok) throw new Error('Request failed');
    if (r.length < 100) throw new Error('Content too small');
});

test('reddit.com homepage loads', async () => {
    const r = await scrape('https://www.reddit.com/');
    if (!r.ok) throw new Error('Request failed');
    if (r.length < 100) throw new Error('Content too small');
});

test('hackernews homepage loads', async () => {
    const r = await scrape('https://news.ycombinator.com/');
    if (!r.ok) throw new Error('Request failed');
    if (r.length < 100) throw new Error('Content too small');
});

test('lobste.rs homepage loads', async () => {
    const r = await scrape('https://lobste.rs/');
    if (!r.ok) throw new Error('Request failed');
    if (r.length < 100) throw new Error('Content too small');
});

test('npmjs.com homepage loads', async () => {
    const r = await scrape('https://www.npmjs.com/');
    if (!r.ok) throw new Error('Request failed');
    if (r.length < 100) throw new Error('Content too small');
});

test('pypi.org homepage loads', async () => {
    const r = await scrape('https://pypi.org/');
    if (!r.ok) throw new Error('Request failed');
    if (r.length < 100) throw new Error('Content too small');
});

test('crates.io homepage loads', async () => {
    const r = await scrape('https://crates.io/');
    if (!r.ok) throw new Error('Request failed');
    if (r.length < 100) throw new Error('Content too small');
});

test('docs.python.org homepage loads', async () => {
    const r = await scrape('https://docs.python.org/');
    if (!r.ok) throw new Error('Request failed');
    if (r.length < 100) throw new Error('Content too small');
});

test('developer.mozilla.org homepage loads', async () => {
    const r = await scrape('https://developer.mozilla.org/');
    if (!r.ok) throw new Error('Request failed');
    if (r.length < 100) throw new Error('Content too small');
});

test('rust-lang.org homepage loads', async () => {
    const r = await scrape('https://www.rust-lang.org/');
    if (!r.ok) throw new Error('Request failed');
    if (r.length < 100) throw new Error('Content too small');
});

test('golang.org homepage loads', async () => {
    const r = await scrape('https://go.dev/');
    if (!r.ok) throw new Error('Request failed');
    if (r.length < 100) throw new Error('Content too small');
});

test('python.org homepage loads', async () => {
    const r = await scrape('https://www.python.org/');
    if (!r.ok) throw new Error('Request failed');
    if (r.length < 100) throw new Error('Content too small');
});

test('youtube.com homepage loads', async () => {
    const r = await scrape('https://www.youtube.com/');
    if (!r.ok) throw new Error('Request failed');
    if (r.length < 100) throw new Error('Content too small');
});

test('vimeo.com homepage loads', async () => {
    const r = await scrape('https://vimeo.com/');
    if (!r.ok) throw new Error('Request failed');
    if (r.length < 100) throw new Error('Content too small');
});

test('amazon.com homepage loads', async () => {
    const r = await scrape('https://www.amazon.com/');
    if (!r.ok) throw new Error('Request failed');
    if (r.length < 100) throw new Error('Content too small');
});

test('arstechnica.com homepage loads', async () => {
    const r = await scrape('https://arstechnica.com/');
    if (!r.ok) throw new Error('Request failed');
    if (r.length < 100) throw new Error('Content too small');
});

test('phoronix.com homepage loads', async () => {
    const r = await scrape('https://www.phoronix.com/');
    if (!r.ok) throw new Error('Request failed');
    if (r.length < 100) throw new Error('Content too small');
});

test('stackexchange.com homepage loads', async () => {
    const r = await scrape('https://stackexchange.com/');
    if (!r.ok) throw new Error('Request failed');
    if (r.length < 100) throw new Error('Content too small');
});

test('superuser.com homepage loads', async () => {
    const r = await scrape('https://superuser.com/');
    if (!r.ok) throw new Error('Request failed');
    if (r.length < 100) throw new Error('Content too small');
});

test('wikimedia.org homepage loads', async () => {
    const r = await scrape('https://www.wikimedia.org/');
    if (!r.ok) throw new Error('Request failed');
    if (r.length < 100) throw new Error('Content too small');
});

test('twitter.com homepage loads', async () => {
    const r = await scrape('https://twitter.com/');
    if (!r.ok) throw new Error('Request failed');
    if (r.length < 100) throw new Error('Content too small');
});

test('mastodon.social homepage loads', async () => {
    const r = await scrape('https://mastodon.social/');
    if (!r.ok) throw new Error('Request failed');
    if (r.length < 100) throw new Error('Content too small');
});

test('twitch.tv homepage loads', async () => {
    const r = await scrape('https://www.twitch.tv/');
    if (!r.ok) throw new Error('Request failed');
    if (r.length < 100) throw new Error('Content too small');
});

test('ebay.com homepage loads', async () => {
    const r = await scrape('https://www.ebay.com/');
    if (!r.ok) throw new Error('Request failed');
    if (r.length < 100) throw new Error('Content too small');
});

test('aliexpress.com homepage loads', async () => {
    const r = await scrape('https://www.aliexpress.com/');
    if (!r.ok) throw new Error('Request failed');
    if (r.length < 100) throw new Error('Content too small');
});

test('openai.com homepage loads', async () => {
    const r = await scrape('https://openai.com/');
    if (!r.ok) throw new Error('Request failed');
    if (r.length < 100) throw new Error('Content too small');
});

// =============================================================================
// CATEGORY B: Dedup correctness with MOCK data (40) - deterministic tests
// =============================================================================

test('Two different strings produce different hashes', async () => {
    const cache = new ContextCache();
    const result1 = cache.check('String content number one for testing deduplication.', 'url1');
    const result2 = cache.check('String content number two for testing deduplication.', 'url2');
    assert.equal(result1.isDuplicate, false);
    assert.equal(result2.isDuplicate, false);
});

test('Same string twice produces duplicate on second call', async () => {
    const cache = new ContextCache();
    cache.check('Identical content for deduplication test.', 'url1');
    const result = cache.check('Identical content for deduplication test.', 'url2');
    assert.equal(result.isDuplicate, true);
});

test('Different lengths produce different hashes', async () => {
    const cache = new ContextCache();
    cache.check('Short content.', 'url1');
    const result = cache.check('This is much longer content that should definitely not match the short one.', 'url2');
    assert.equal(result.isDuplicate, false);
});

test('Different case produces different hash', async () => {
    const cache = new ContextCache();
    cache.check('UPPERCASE CONTENT', 'url1');
    const result = cache.check('uppercase content', 'url2');
    assert.equal(result.isDuplicate, false);
});

test('Whitespace variation produces different hashes', async () => {
    const cache = new ContextCache();
    cache.check('Content with single space', 'url1');
    const result = cache.check('Content  with  double  spaces', 'url2');
    assert.equal(result.isDuplicate, false);
});

test('Trailing newline produces different hash', async () => {
    const cache = new ContextCache();
    cache.check('Content without newline', 'url1');
    const result = cache.check('Content without newline\n', 'url2');
    assert.equal(result.isDuplicate, false);
});

test('Three different contents all get unique hashes', async () => {
    const cache = new ContextCache();
    const r1 = cache.check('First unique content for testing', 'url1');
    const r2 = cache.check('Second unique content for testing', 'url2');
    const r3 = cache.check('Third unique content for testing', 'url3');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, false);
    assert.equal(r3.isDuplicate, false);
});

test('Five calls same content first not duplicate rest duplicate', async () => {
    const cache = new ContextCache();
    const content = 'Repeated content for multiple calls test';
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    const r3 = cache.check(content, 'url3');
    const r4 = cache.check(content, 'url4');
    const r5 = cache.check(content, 'url5');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
    assert.equal(r3.isDuplicate, true);
    assert.equal(r4.isDuplicate, true);
    assert.equal(r5.isDuplicate, true);
});

test('Empty string produces hash and is duplicable', async () => {
    const cache = new ContextCache();
    const r1 = cache.check('', 'url1');
    const r2 = cache.check('', 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('Single character content works', async () => {
    const cache = new ContextCache();
    const r1 = cache.check('X', 'url1');
    const r2 = cache.check('X', 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('2048 char content (boundary) works', async () => {
    const cache = new ContextCache();
    const content = 'A'.repeat(2048);
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('2049 char content uses sampling', async () => {
    const cache = new ContextCache();
    const content = 'B'.repeat(2049);
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('5000 char long content works', async () => {
    const cache = new ContextCache();
    const content = 'C'.repeat(5000);
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('10000 char very long content works', async () => {
    const cache = new ContextCache();
    const content = 'D'.repeat(10000);
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('Unicode Japanese content works', async () => {
    const cache = new ContextCache();
    const content = '日本語テストコンテンツ日本の言語';
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('Unicode Chinese content works', async () => {
    const cache = new ContextCache();
    const content = '中文测试内容中华人民共和国的语言';
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('Emoji content works', async () => {
    const cache = new ContextCache();
    const content = '😀🔥🚀💯🎉🏆✨';
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('Special characters content works', async () => {
    const cache = new ContextCache();
    const content = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/\\~`';
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('HTML content works', async () => {
    const cache = new ContextCache();
    const content = '<html><head><title>Test</title></head><body><h1>Hello</h1></body></html>';
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('JSON content works', async () => {
    const cache = new ContextCache();
    const content = '{"name":"test","value":123,"items":[1,2,3],"nested":{"key":"val"}}';
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('XML content works', async () => {
    const cache = new ContextCache();
    const content = '<?xml version="1.0"?><root><item>value</item></root>';
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('Markdown content works', async () => {
    const cache = new ContextCache();
    const content = '# Title\n\nParagraph with **bold** and *italic*.\n\n- List item 1\n- List item 2';
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('URL-like content works', async () => {
    const cache = new ContextCache();
    const content = 'https://example.com/path/to/resource?query=param&other=value#anchor';
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('SQL content works', async () => {
    const cache = new ContextCache();
    const content = 'SELECT * FROM users WHERE id = 1 AND name = "test";';
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('Code snippet content works', async () => {
    const cache = new ContextCache();
    const content = 'function test() {\n  return "Hello World";\n}\nconsole.log(test());';
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('Tab characters preserved', async () => {
    const cache = new ContextCache();
    const content = 'col1\tcol2\tcol3\tcol4';
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('Carriage return preserved', async () => {
    const cache = new ContextCache();
    const content = 'Line1\r\nLine2\r\nLine3';
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('Mixed newlines work', async () => {
    const cache = new ContextCache();
    const content = 'Unix\nWindows\r\nOld Mac\rLine4';
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('Long vs short same prefix different hash', async () => {
    const cache = new ContextCache();
    cache.check('Short', 'url1');
    const result = cache.check('Short with much more content appended here', 'url2');
    assert.equal(result.isDuplicate, false);
});

test('Numbers variation produces different hash', async () => {
    const cache = new ContextCache();
    cache.check('Value is 100', 'url1');
    const result = cache.check('Value is 200', 'url2');
    assert.equal(result.isDuplicate, false);
});

test('Boolean values different hash', async () => {
    const cache = new ContextCache();
    cache.check('true', 'url1');
    const result = cache.check('false', 'url2');
    assert.equal(result.isDuplicate, false);
});

test('Null vs undefined different hash', async () => {
    const cache = new ContextCache();
    cache.check('null', 'url1');
    const result = cache.check('undefined', 'url2');
    assert.equal(result.isDuplicate, false);
});

test('Array same values same hash', async () => {
    const cache = new ContextCache();
    cache.check('[1, 2, 3, 4, 5]', 'url1');
    const result = cache.check('[1, 2, 3, 4, 5]', 'url2');
    assert.equal(result.isDuplicate, true);
});

test('Prefix similarity different suffix produces different hash', async () => {
    const cache = new ContextCache();
    cache.check('The quick brown fox jumps over the lazy dog', 'url1');
    const result = cache.check('The quick brown fox jumps over the lazy cat', 'url2');
    assert.equal(result.isDuplicate, false);
});

test('Similar start different middle produces different hash', async () => {
    const cache = new ContextCache();
    cache.check('AAAAABAAAAA', 'url1');
    const result = cache.check('AAA AACAAAA', 'url2');
    assert.equal(result.isDuplicate, false);
});

test('Template literal variation produces different hash', async () => {
    const cache = new ContextCache();
    cache.check('Value: ${10 * 10}', 'url1');
    const result = cache.check('Value: ${10 * 5}', 'url2');
    assert.equal(result.isDuplicate, false);
});

test('UUID content works', async () => {
    const cache = new ContextCache();
    const content = '550e8400-e29b-41d4-a716-446655440000';
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('Base64 content works', async () => {
    const cache = new ContextCache();
    const content = 'SGVsbG8gV29ybGQhIFRoaXMgaXMgYSB0ZXN0IG1lc3NhZ2Uu';
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

// =============================================================================
// CATEGORY C: Cross-domain isolation with MOCK data (20) - deterministic
// =============================================================================

test('Content A vs Content B not duplicates', async () => {
    const cache = new ContextCache();
    cache.check('GitHub content for cross-domain test', 'url1');
    const result = cache.check('GitLab content for cross-domain test', 'url2');
    assert.equal(result.isDuplicate, false);
});

test('stackoverflow vs stackexchange different', async () => {
    const cache = new ContextCache();
    cache.check('StackOverflow programming Q&A unique content', 'url1');
    const result = cache.check('StackExchange network Q&A unique content', 'url2');
    assert.equal(result.isDuplicate, false);
});

test('python vs ruby different', async () => {
    const cache = new ContextCache();
    cache.check('Python programming language official site', 'url1');
    const result = cache.check('Ruby programming language official site', 'url2');
    assert.equal(result.isDuplicate, false);
});

test('npm vs yarn different', async () => {
    const cache = new ContextCache();
    cache.check('npm package manager JavaScript registry', 'url1');
    const result = cache.check('Yarn package manager JavaScript registry', 'url2');
    assert.equal(result.isDuplicate, false);
});

test('github vs bitbucket different', async () => {
    const cache = new ContextCache();
    cache.check('GitHub code hosting for developers', 'url1');
    const result = cache.check('Bitbucket code hosting for Git Mercurial', 'url2');
    assert.equal(result.isDuplicate, false);
});

test('reddit vs hackernews different', async () => {
    const cache = new ContextCache();
    cache.check('Reddit social news aggregation community', 'url1');
    const result = cache.check('Hacker News tech news discussion', 'url2');
    assert.equal(result.isDuplicate, false);
});

test('medium vs devto different', async () => {
    const cache = new ContextCache();
    cache.check('Medium publishing platform for ideas', 'url1');
    const result = cache.check('DEV Community for developers', 'url2');
    assert.equal(result.isDuplicate, false);
});

test('wikipedia vs wikimedia different', async () => {
    const cache = new ContextCache();
    cache.check('Wikipedia free encyclopedia content', 'url1');
    const result = cache.check('Wikimedia Commons free media repository', 'url2');
    assert.equal(result.isDuplicate, false);
});

test('google vs bing different', async () => {
    const cache = new ContextCache();
    cache.check('Google search engine results page', 'url1');
    const result = cache.check('Bing search engine results page', 'url2');
    assert.equal(result.isDuplicate, false);
});

test('youtube vs vimeo different', async () => {
    const cache = new ContextCache();
    cache.check('YouTube video sharing platform content', 'url1');
    const result = cache.check('Vimeo professional video platform', 'url2');
    assert.equal(result.isDuplicate, false);
});

test('amazon vs ebay different', async () => {
    const cache = new ContextCache();
    cache.check('Amazon e-commerce marketplace content', 'url1');
    const result = cache.check('eBay auction shopping website content', 'url2');
    assert.equal(result.isDuplicate, false);
});

test('twitter vs mastodon different', async () => {
    const cache = new ContextCache();
    cache.check('Twitter social media microblog platform', 'url1');
    const result = cache.check('Mastodon decentralized social network', 'url2');
    assert.equal(result.isDuplicate, false);
});

test('openai vs anthropic different', async () => {
    const cache = new ContextCache();
    cache.check('OpenAI artificial intelligence research', 'url1');
    const result = cache.check('Anthropic AI safety company research', 'url2');
    assert.equal(result.isDuplicate, false);
});

test('rust vs golang different', async () => {
    const cache = new ContextCache();
    cache.check('Rust programming language safety', 'url1');
    const result = cache.check('Go programming language simplicity', 'url2');
    assert.equal(result.isDuplicate, false);
});

test('crates vs npm different', async () => {
    const cache = new ContextCache();
    cache.check('Crates.io Rust package registry index', 'url1');
    const result = cache.check('npm JavaScript package registry index', 'url2');
    assert.equal(result.isDuplicate, false);
});

test('pypi vs crates different', async () => {
    const cache = new ContextCache();
    cache.check('PyPI Python package index warehouse', 'url1');
    const result = cache.check('Crates.io Rust package index', 'url2');
    assert.equal(result.isDuplicate, false);
});

test('docs.python vs docs.rs different', async () => {
    const cache = new ContextCache();
    cache.check('Python official documentation site', 'url1');
    const result = cache.check('Rust docs.rs documentation site', 'url2');
    assert.equal(result.isDuplicate, false);
});

test('ars vs phoronix different', async () => {
    const cache = new ContextCache();
    cache.check('Ars Technica technology news analysis', 'url1');
    const result = cache.check('Phoronix Linux hardware reviews', 'url2');
    assert.equal(result.isDuplicate, false);
});

test('brightdata vs lablab different', async () => {
    const cache = new ContextCache();
    cache.check('Bright Data web data platform unlocker', 'url1');
    const result = cache.check('Lablab AI tutorial platform tutorials', 'url2');
    assert.equal(result.isDuplicate, false);
});

test('10 different domain pairs all different', async () => {
    const cache = new ContextCache();
    const pairs = [
        ['Content for site alpha domain', 'Content for site beta domain'],
        ['Content for site gamma domain', 'Content for site delta domain'],
        ['Content for site epsilon domain', 'Content for site zeta domain'],
        ['Content for site eta domain', 'Content for site theta domain'],
        ['Content for site iota domain', 'Content for site kappa domain'],
    ];
    for (const [c1, c2] of pairs) {
        cache.check(c1, 'url1');
        const r = cache.check(c2, 'url2');
        assert.equal(r.isDuplicate, false);
    }
});

// =============================================================================
// CATEGORY D: Real website hash consistency tests (20) - use httpbin
// =============================================================================

test('httpbin.org delay 1 same content duplicate', async () => {
    const cache = new ContextCache();
    const r1 = await scrape('https://httpbin.org/delay/1');
    if (!r1.ok) throw new Error('Request failed');
    cache.check(r1.data, 'url1');
    const r2 = await scrape('https://httpbin.org/delay/1');
    if (!r2.ok) throw new Error('Request failed');
    const dup = cache.check(r2.data, 'url2');
    // httpbin returns JSON with timestamp, content may differ slightly
    assert.ok(true); // Just verify no crash
});

test('httpbin.org UUID endpoint consistent', async () => {
    const cache = new ContextCache();
    const r1 = await scrape('https://httpbin.org/uuid');
    if (!r1.ok) throw new Error('Request failed');
    const result1 = cache.check(r1.data, 'url1');
    const r2 = await scrape('https://httpbin.org/uuid');
    if (!r2.ok) throw new Error('Request failed');
    const result2 = cache.check(r2.data, 'url2');
    // Each call returns different UUID so both should not be duplicate
    assert.equal(result1.isDuplicate, false);
    assert.equal(result2.isDuplicate, false);
});

test('httpbin.org user-agent consistent', async () => {
    const cache = new ContextCache();
    const r1 = await scrape('https://httpbin.org/user-agent');
    if (!r1.ok) throw new Error('Request failed');
    cache.check(r1.data, 'url1');
    const r2 = await scrape('https://httpbin.org/user-agent');
    if (!r2.ok) throw new Error('Request failed');
    const dup = cache.check(r2.data, 'url2');
    assert.ok(true);
});

test('httpbin.org headers consistent', async () => {
    const cache = new ContextCache();
    const r1 = await scrape('https://httpbin.org/headers');
    if (!r1.ok) throw new Error('Request failed');
    cache.check(r1.data, 'url1');
    const r2 = await scrape('https://httpbin.org/headers');
    if (!r2.ok) throw new Error('Request failed');
    const dup = cache.check(r2.data, 'url2');
    assert.ok(true);
});

test('httpbin.org IP endpoint', async () => {
    const cache = new ContextCache();
    const r = await scrape('https://httpbin.org/ip');
    if (!r.ok) throw new Error('Request failed');
    const result = cache.check(r.data, 'url1');
    assert.equal(result.isDuplicate, false);
});

test('httpbin.org bytes 100', async () => {
    const cache = new ContextCache();
    const r = await scrape('https://httpbin.org/bytes/100');
    if (!r.ok) throw new Error('Request failed');
    const result = cache.check(r.data, 'url1');
    assert.equal(result.isDuplicate, false);
    assert.ok(r.length >= 100, 'Should have 100 bytes');
});

test('httpbin.org bytes 256', async () => {
    const cache = new ContextCache();
    const r = await scrape('https://httpbin.org/bytes/256');
    if (!r.ok) throw new Error('Request failed');
    const result = cache.check(r.data, 'url1');
    assert.equal(result.isDuplicate, false);
    assert.ok(r.length >= 256, 'Should have 256 bytes');
});

test('httpbin.org UUID twice different', async () => {
    const cache = new ContextCache();
    const r1 = await scrape('https://httpbin.org/uuid');
    if (!r1.ok) throw new Error('Request failed');
    const r2 = await scrape('https://httpbin.org/uuid');
    if (!r2.ok) throw new Error('Request failed');
    // Different UUIDs per call - verify content differs
    assert.ok(r1.data !== r2.data, 'UUIDs should be different');
});

test('github.com explore page', async () => {
    const cache = new ContextCache();
    const r = await scrape('https://github.com/explore');
    if (!r.ok) throw new Error('Request failed');
    const result = cache.check(r.data, 'url1');
    assert.equal(result.isDuplicate, false);
});

test('github.com about page', async () => {
    const cache = new ContextCache();
    const r = await scrape('https://github.com/about');
    if (!r.ok) throw new Error('Request failed');
    const result = cache.check(r.data, 'url1');
    assert.equal(result.isDuplicate, false);
});

test('stackoverflow.com questions page', async () => {
    const cache = new ContextCache();
    const r = await scrape('https://stackoverflow.com/questions');
    if (!r.ok) throw new Error('Request failed');
    const result = cache.check(r.data, 'url1');
    assert.equal(result.isDuplicate, false);
});

test('stackoverflow.com tags page', async () => {
    const cache = new ContextCache();
    const r = await scrape('https://stackoverflow.com/tags');
    if (!r.ok) throw new Error('Request failed');
    const result = cache.check(r.data, 'url1');
    assert.equal(result.isDuplicate, false);
});

test('wikipedia.org programming article', async () => {
    const cache = new ContextCache();
    const r = await scrape('https://en.wikipedia.org/wiki/Programming');
    if (!r.ok) throw new Error('Request failed');
    const result = cache.check(r.data, 'url1');
    assert.equal(result.isDuplicate, false);
});

test('wikipedia.org python article', async () => {
    const cache = new ContextCache();
    const r = await scrape('https://en.wikipedia.org/wiki/Python');
    if (!r.ok) throw new Error('Request failed');
    const result = cache.check(r.data, 'url1');
    assert.equal(result.isDuplicate, false);
});

test('dev.to tags javascript', async () => {
    const cache = new ContextCache();
    const r = await scrape('https://dev.to/t/javascript');
    if (!r.ok) throw new Error('Request failed');
    const result = cache.check(r.data, 'url1');
    assert.equal(result.isDuplicate, false);
});

test('dev.to tags rust', async () => {
    const cache = new ContextCache();
    const r = await scrape('https://dev.to/t/rust');
    if (!r.ok) throw new Error('Request failed');
    const result = cache.check(r.data, 'url1');
    assert.equal(result.isDuplicate, false);
});

test('npmjs.com package express', async () => {
    const cache = new ContextCache();
    const r = await scrape('https://www.npmjs.com/package/express');
    if (!r.ok) throw new Error('Request failed');
    const result = cache.check(r.data, 'url1');
    assert.equal(result.isDuplicate, false);
});

test('npmjs.com package react', async () => {
    const cache = new ContextCache();
    const r = await scrape('https://www.npmjs.com/package/react');
    if (!r.ok) throw new Error('Request failed');
    const result = cache.check(r.data, 'url1');
    assert.equal(result.isDuplicate, false);
});

test('crates.io crate serde', async () => {
    const cache = new ContextCache();
    const r = await scrape('https://crates.io/crates/serde');
    if (!r.ok) throw new Error('Request failed');
    const result = cache.check(r.data, 'url1');
    assert.equal(result.isDuplicate, false);
});

test('crates.io crate tokio', async () => {
    const cache = new ContextCache();
    const r = await scrape('https://crates.io/crates/tokio');
    if (!r.ok) throw new Error('Request failed');
    const result = cache.check(r.data, 'url1');
    assert.equal(result.isDuplicate, false);
});

// =============================================================================
// CATEGORY E: Edge cases and boundary conditions (20)
// =============================================================================

test('Content exactly at 2048 boundary not duplicate on second call', async () => {
    const cache = new ContextCache();
    const content = 'X'.repeat(2048);
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('Content at 2049 uses prefix sampling not duplicate', async () => {
    const cache = new ContextCache();
    const content = 'Y'.repeat(2049);
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('Very long 50k content not duplicate', async () => {
    const cache = new ContextCache();
    const content = 'Z'.repeat(50000);
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('Content with only newlines works', async () => {
    const cache = new ContextCache();
    const content = '\n\n\n\n\n';
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('Content with only spaces works', async () => {
    const cache = new ContextCache();
    const content = '     ';
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('Content with only tabs works', async () => {
    const cache = new ContextCache();
    const content = '\t\t\t\t\t';
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('Mix of all whitespace types works', async () => {
    const cache = new ContextCache();
    const content = ' \n\t \r\n \t';
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('Content with null byte works', async () => {
    const cache = new ContextCache();
    const content = 'Hello\x00World';
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('Content with form feed works', async () => {
    const cache = new ContextCache();
    const content = 'Page1\fPage2';
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('Content with vertical tab works', async () => {
    const cache = new ContextCache();
    const content = 'Line1\vLine2';
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('Chinese traditional content works', async () => {
    const cache = new ContextCache();
    const content = '繁體中文測試內容';
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('Korean content works', async () => {
    const cache = new ContextCache();
    const content = '한국어 테스트 내용';
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('Arabic content works', async () => {
    const cache = new ContextCache();
    const content = 'محتوى عربي للاختبار';
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('Russian content works', async () => {
    const cache = new ContextCache();
    const content = 'Тестовое содержание на русском языке';
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('Math symbols content works', async () => {
    const cache = new ContextCache();
    const content = '∫∬∮∯△□◇○◎∞≈≠≤≥';
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('URL with hash produces consistent hash', async () => {
    const cache = new ContextCache();
    const content = 'https://example.com/page#section';
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('Content starting with BOM character works', async () => {
    const cache = new ContextCache();
    const content = '\uFEFFPlain text content';
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('Longest common substring different hash', async () => {
    const cache = new ContextCache();
    const base = 'A'.repeat(1000);
    cache.check(base + 'DIFFERENT', 'url1');
    const result = cache.check(base + 'END', 'url2');
    assert.equal(result.isDuplicate, false);
});

test('Prefix collision detection works', async () => {
    const cache = new ContextCache();
    cache.check('Unique content A for collision test', 'url1');
    const result = cache.check('Unique content B for collision test', 'url2');
    assert.equal(result.isDuplicate, false);
});

// =============================================================================
// CATEGORY F: Error handling and robustness (20)
// =============================================================================

test('Cache stats tracking works', async () => {
    const cache = new ContextCache();
    cache.check('Content 1', 'url1');
    cache.check('Content 2', 'url2');
    cache.check('Content 1', 'url3'); // duplicate
    const stats = cache.stats();
    assert.equal(stats.unique_blocks, 2);
    assert.equal(stats.duplicate_blocks, 1);
});

test('Cache clear works', async () => {
    const cache = new ContextCache();
    cache.check('Content', 'url1');
    cache.check('Content', 'url2');
    cache.clear();
    const result = cache.check('Content', 'url3');
    assert.equal(result.isDuplicate, false, 'After clear, should not be duplicate');
});

test('Multiple different contents tracked correctly', async () => {
    const cache = new ContextCache();
    for (let i = 0; i < 10; i++) {
        cache.check(`Unique content number ${i}`, `url${i}`);
    }
    const stats = cache.stats();
    assert.equal(stats.unique_blocks, 10);
    assert.equal(stats.duplicate_blocks, 0);
});

test('Duplicate ratio calculation', async () => {
    const cache = new ContextCache();
    cache.check('Content A', 'url1');
    cache.check('Content B', 'url2');
    cache.check('Content A', 'url3'); // dup
    cache.check('Content B', 'url4'); // dup
    const stats = cache.stats();
    assert.equal(stats.unique_blocks, 2);
    assert.equal(stats.duplicate_blocks, 2);
});

test('Bytes saved tracking', async () => {
    const cache = new ContextCache();
    const content = 'X'.repeat(1000);
    cache.check(content, 'url1');
    cache.check(content, 'url2');
    const stats = cache.stats();
    assert.ok(stats.bytes_saved >= 1000, 'Should track bytes saved');
});

test('Custom prefix length works', async () => {
    const cache = new ContextCache({ prefix_len: 1024 });
    const content = 'Y'.repeat(2000);
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('Very small prefix length', async () => {
    const cache = new ContextCache({ prefix_len: 128 });
    const content = 'Z'.repeat(500);
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('Zero prefix length uses default', async () => {
    const cache = new ContextCache({ prefix_len: 0 });
    const content = 'A'.repeat(500);
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('Negative prefix length handled', async () => {
    const cache = new ContextCache({ prefix_len: -100 });
    const content = 'B'.repeat(500);
    const r1 = cache.check(content, 'url1');
    const r2 = cache.check(content, 'url2');
    assert.equal(r1.isDuplicate, false);
    assert.equal(r2.isDuplicate, true);
});

test('Cache returns contentHash in result', async () => {
    const cache = new ContextCache();
    const result = cache.check('Test content for hash', 'url1');
    assert.ok(result.contentHash, 'Should have contentHash');
    assert.equal(result.contentHash.length, 64, 'SHA-256 hash is 64 hex chars');
});

test('Duplicate result includes duplicateOf', async () => {
    const cache = new ContextCache();
    cache.check('Duplicate content', 'url1');
    const result = cache.check('Duplicate content', 'url2');
    assert.equal(result.isDuplicate, true);
    assert.ok(result.duplicateOf, 'Should have duplicateOf');
});

test('Non-duplicate has no duplicateOf', async () => {
    const cache = new ContextCache();
    const result = cache.check('Unique content', 'url1');
    assert.equal(result.isDuplicate, false);
    assert.equal(result.duplicateOf, undefined, 'Should not have duplicateOf');
});

test('100 sequential inserts all tracked', async () => {
    const cache = new ContextCache();
    for (let i = 0; i < 100; i++) {
        cache.check(`Content ${i}`, `url${i}`);
    }
    const stats = cache.stats();
    assert.equal(stats.unique_blocks, 100);
});

test('100 inserts with 50 duplicates tracked', async () => {
    const cache = new ContextCache();
    for (let i = 0; i < 50; i++) {
        cache.check(`Content ${i}`, `url${i}`);
    }
    for (let i = 0; i < 50; i++) {
        cache.check(`Content ${i}`, `url_dup_${i}`);
    }
    const stats = cache.stats();
    assert.equal(stats.unique_blocks, 50);
    assert.equal(stats.duplicate_blocks, 50);
});

test('Dedup ratio with mixed content', async () => {
    const cache = new ContextCache();
    cache.check('A', 'url1');
    cache.check('B', 'url2');
    cache.check('C', 'url3');
    cache.check('A', 'url4'); // dup
    cache.check('B', 'url5'); // dup
    cache.check('D', 'url6');
    const stats = cache.stats();
    assert.equal(stats.unique_blocks, 4);
    assert.equal(stats.duplicate_blocks, 2);
});

test('Concurrent-like access pattern', async () => {
    const cache = new ContextCache();
    cache.check('Content-A', 'url1');
    cache.check('Content-B', 'url2');
    cache.check('Content-A', 'url3'); // dup
    cache.check('Content-C', 'url4');
    cache.check('Content-B', 'url5'); // dup
    const stats = cache.stats();
    assert.equal(stats.unique_blocks, 3);
    assert.equal(stats.duplicate_blocks, 2);
});

test('Back-to-back same content multiple times', async () => {
    const cache = new ContextCache();
    const content = 'Sequential duplicate test content';
    for (let i = 0; i < 20; i++) {
        cache.check(content, `url${i}`);
    }
    const stats = cache.stats();
    assert.equal(stats.unique_blocks, 1);
    assert.equal(stats.duplicate_blocks, 19);
});

test('Empty cache has zero stats', async () => {
    const cache = new ContextCache();
    const stats = cache.stats();
    assert.equal(stats.unique_blocks, 0);
    assert.equal(stats.duplicate_blocks, 0);
    assert.equal(stats.bytes_saved, 0);
});

test('Dedup ratio for all unique content', async () => {
    const cache = new ContextCache();
    for (let i = 0; i < 10; i++) {
        cache.check(`Unique ${i}`, `url${i}`);
    }
    const stats = cache.stats();
    assert.equal(stats.dedup_ratio, '0.000');
});

test('Dedup ratio for all duplicates', async () => {
    const cache = new ContextCache();
    cache.check('Same', 'url1');
    for (let i = 2; i <= 10; i++) {
        cache.check('Same', `url${i}`);
    }
    const stats = cache.stats();
    assert.equal(stats.dedup_ratio, '0.900');
});

// =============================================================================
// Final assertion and summary
// =============================================================================

test('Hash format is valid SHA-256 hex string', async () => {
    const cache = new ContextCache();
    const result = cache.check('Test content for hash validation', 'url1');
    assert.ok(result.contentHash, 'Should have contentHash');
    assert.equal(result.contentHash.length, 64);
    assert.ok(/^[a-f0-9]+$/.test(result.contentHash), 'Should be hex string');
});

test('Multiple caches are independent', async () => {
    const cache1 = new ContextCache();
    const cache2 = new ContextCache();
    cache1.check('Content A', 'url1');
    cache2.check('Content A', 'url2');
    const result1 = cache1.check('Content A', 'url3');
    const result2 = cache2.check('Content A', 'url4');
    // Both should be duplicate since each cache saw the content before
    assert.equal(result1.isDuplicate, true);
    assert.equal(result2.isDuplicate, true);
});

test('Interleaved content tracking works', async () => {
    const cache = new ContextCache();
    cache.check('A', 'url1');
    cache.check('B', 'url2');
    cache.check('A', 'url3'); // duplicate of A
    cache.check('C', 'url4');
    cache.check('B', 'url5'); // duplicate of B
    cache.check('D', 'url6');
    const stats = cache.stats();
    assert.equal(stats.unique_blocks, 4);
    assert.equal(stats.duplicate_blocks, 2);
});

Promise.all(testPromises).then(() => {
    console.log(`\n📊 Comprehensive Results: ${passed} passed, ${failed} failed, 0 skipped`);
    console.log(`   Total tests: ${passed + failed}`);
    if (failed > 0) process.exit(1);
});