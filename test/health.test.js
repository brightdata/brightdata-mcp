'use strict'; /*jslint node:true es9:true*/
import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { MCPClientManager } from '@mcpjam/sdk';
import 'dotenv/config';

const test_dir = dirname(fileURLToPath(import.meta.url));
const repo_root = resolve(test_dir, '..');

describe("Authenticated connection, pro mode false", ()=>{
    let clientManager;
    before(async()=>{
        clientManager = new MCPClientManager();
        await clientManager.connectToServer('brightdata', {
            command: process.execPath,
            args: ['server.js'],
            cwd: repo_root,
            env: {
                ...process.env,
                API_TOKEN: process.env.BRIGHTDATA_API_TOKEN,
                PRO_MODE: 'false',
            },
        });
    });
    after(async()=>{
        await clientManager.disconnectServer('brightdata');
    });

    test('Successfully connects to server', async()=>{
        const status = await clientManager.getConnectionStatus('brightdata');
        assert.equal(status, 'connected', 'brightdata server should be connected');
    });
    test('Successfully pings server', async()=>{
        await assert.doesNotReject(
            async () => await clientManager.pingServer('brightdata'),
            undefined,
            'pingServer should not throw'
        );
    });
    test('Server capabilities matches what is expected', async()=>{
        const capabilities = await clientManager.getServerCapabilities('brightdata');
        assert.ok(capabilities.tools, 'brightdata server should have tools');
        assert.ok(capabilities.logging, 'brightdata server should have logging');
        assert.ok(capabilities.completions, 'brightdata server should have completions');
        assert.equal(capabilities.elicitation, undefined, 'brightdata server should not have elicitation');
    });
    test('Tools list is correct and matches what is expected', async()=>{
        const {tools} = await clientManager.listTools('brightdata');
        const toolNames = tools.map((t)=> t.name);
        const expectedTools = ['search_engine', 'scrape_as_markdown', 'search_engine_batch', 'scrape_batch'];
        for (const name of expectedTools) {
            assert.ok(toolNames.includes(name), `Tool '${name}' should exist`);
        }
        assert.ok(toolNames.length === expectedTools.length, 'brightdata server should have tools');
    });
});

describe("Authenticated connection, pro mode true", ()=>{
    let clientManager;
    before(async()=>{
        clientManager = new MCPClientManager();
        await clientManager.connectToServer('brightdata', {
            command: process.execPath,
            args: ['server.js'],
            cwd: repo_root,
            env: {
                ...process.env,
                API_TOKEN: process.env.BRIGHTDATA_API_TOKEN,
                PRO_MODE: 'true',
            },
        });
    });
    after(async()=>{
        await clientManager.disconnectServer('brightdata');
    });
    test('Successfully connects to server', async()=>{
        const status = await clientManager.getConnectionStatus('brightdata');
        assert.equal(status, 'connected', 'brightdata server should be connected');
    });
    test('Successfully pings server', async()=>{
        await assert.doesNotReject(
            async () => await clientManager.pingServer('brightdata'),
            undefined,
            'pingServer should not throw'
        );
    });
    test('Server capabilities matches what is expected', async()=>{
        const capabilities = await clientManager.getServerCapabilities('brightdata');
        assert.ok(capabilities.tools, 'brightdata server should have tools');
        assert.ok(capabilities.logging, 'brightdata server should have logging');

        assert.ok(capabilities.completions, 'brightdata server should have completions');
        assert.equal(capabilities.elicitation, undefined, 'brightdata server should not have elicitation');
    });
    test('Tools list is correct and matches what is expected', async()=>{
        const {tools} = await clientManager.listTools('brightdata');
        const toolNames = tools.map((t)=> t.name);
        const expectedTools = [
            'search_engine',
            'scrape_as_markdown',
            'search_engine_batch',
            'scrape_batch',
            'scrape_as_html',
            'extract',
            'session_stats',
            'web_data_amazon_product',
            'web_data_amazon_product_reviews',
            'web_data_amazon_product_search',
            'web_data_walmart_product',
            'web_data_walmart_seller',
            'web_data_ebay_product',
            'web_data_homedepot_products',
            'web_data_zara_products',
            'web_data_etsy_products',
            'web_data_bestbuy_products',
            'web_data_linkedin_person_profile',
            'web_data_linkedin_company_profile',
            'web_data_linkedin_job_listings',
            'web_data_linkedin_posts',
            'web_data_linkedin_people_search',
            'web_data_crunchbase_company',
            'web_data_zoominfo_company_profile',
            'web_data_instagram_profiles',
            'web_data_instagram_posts',
            'web_data_instagram_reels',
            'web_data_instagram_comments',
            'web_data_facebook_posts',
            'web_data_facebook_marketplace_listings',
            'web_data_facebook_company_reviews',
            'web_data_facebook_events',
            'web_data_tiktok_profiles',
            'web_data_tiktok_posts',
            'web_data_tiktok_shop',
            'web_data_tiktok_comments',
            'web_data_google_maps_reviews',
            'web_data_google_shopping',
            'web_data_google_play_store',
            'web_data_apple_app_store',
            'web_data_reuter_news',
            'web_data_github_repository_file',
            'web_data_yahoo_finance_business',
            'web_data_x_posts',
            'web_data_zillow_properties_listing',
            'web_data_booking_hotel_listings',
            'web_data_youtube_profiles',
            'web_data_youtube_comments',
            'web_data_reddit_posts',
            'web_data_youtube_videos',
            'scraping_browser_navigate',
            'scraping_browser_go_back',
            'scraping_browser_go_forward',
            'scraping_browser_snapshot',
            'scraping_browser_click_ref',
            'scraping_browser_type_ref',
            'scraping_browser_screenshot',
            'scraping_browser_network_requests',
            'scraping_browser_wait_for_ref',
            'scraping_browser_fill_form',
            'scraping_browser_get_text',
            'scraping_browser_get_html',
            'scraping_browser_scroll',
            'scraping_browser_scroll_to_ref'
        ];
        for (const name of expectedTools) {
            assert.ok(toolNames.includes(name), `Tool '${name}' should exist`);
        }
        assert.ok(toolNames.length === expectedTools.length, `brightdata server should have ${expectedTools.length} tools on pro mode true`);
    });
});

describe("Invalid API token fails to connect", ()=>{
    let clientManager;
    before(async()=>{
        clientManager = new MCPClientManager();
        await clientManager.connectToServer('brightdata', {
            command: process.execPath,
            args: ['server.js'],
            cwd: repo_root,
            env: {
                ...process.env,
                API_TOKEN: 'invalid-token',
                PRO_MODE: 'false',
            },
        });
    });
    after(async()=>{
        await clientManager.disconnectServer('brightdata');
    });

    test('Tool returns a 401 in the text body', async()=>{
        const { content } = await clientManager.executeTool('brightdata', 'search_engine', {query: 'test', engine: 'google'});
        assert.ok(content[0].text.includes("401"), 'brightdata server should return 401 error');
    });
});