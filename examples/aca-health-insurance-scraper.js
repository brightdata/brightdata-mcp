#!/usr/bin/env node
/**
 * ACA Health Insurance Lead Scraper
 *
 * This script uses Bright Data MCP to find people looking for
 * health insurance (Affordable Care Act / ACA) across:
 * - Search engines (Google, Bing)
 * - Social media (Reddit, Twitter/X, Facebook, TikTok, Instagram, YouTube)
 * - Forums and community sites
 *
 * REQUIREMENTS:
 * - Set PRO_MODE=true in environment for social media scraping
 * - Set API_TOKEN with your Bright Data API key
 *
 * Usage: node aca-health-insurance-scraper.js
 */

import axios from 'axios';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

const API_TOKEN = process.env.API_TOKEN;
const BASE_URL = 'https://api.brightdata.com';
const UNLOCKER_ZONE = process.env.WEB_UNLOCKER_ZONE || 'mcp_unlocker';

if (!API_TOKEN) {
    console.error('ERROR: API_TOKEN environment variable is required');
    console.error('Get your token from: https://brightdata.com/cp/setting/users');
    process.exit(1);
}

const headers = {
    'Authorization': `Bearer ${API_TOKEN}`,
    'Content-Type': 'application/json',
    'User-Agent': 'aca-health-insurance-scraper/1.0'
};

// ==================== SEARCH QUERIES ====================
// These queries are designed to find people actively looking for health insurance

const ACA_SEARCH_QUERIES = [
    // Direct intent queries
    'need health insurance ACA open enrollment 2024',
    'how to sign up for Obamacare marketplace',
    'affordable health insurance options 2024',
    'ACA marketplace plans comparison',
    'health insurance subsidy calculator 2024',

    // Problem/pain point queries
    'lost job need health insurance now',
    'can\'t afford health insurance options',
    'health insurance between jobs what to do',
    'self employed health insurance ACA',
    'family health insurance affordable options',

    // Life event queries
    'just turned 26 need health insurance',
    'getting married health insurance options',
    'having a baby health insurance enrollment',
    'moving to new state health insurance',
    'divorce health insurance coverage options',

    // Cost-focused queries
    'cheapest ACA plans 2024',
    'health insurance under $200 month',
    'bronze vs silver plan worth it',
    'ACA subsidies income limits 2024',

    // Location-specific (can be customized)
    'health insurance marketplace California',
    'Florida Obamacare plans 2024',
    'Texas health insurance options ACA',
    'New York state health marketplace'
];

// ==================== SOCIAL MEDIA TARGETS ====================

const SOCIAL_MEDIA_SEARCHES = {
    reddit: {
        subreddits: [
            'https://reddit.com/r/HealthInsurance',
            'https://reddit.com/r/personalfinance',
            'https://reddit.com/r/povertyfinance',
            'https://reddit.com/r/ACA',
            'https://reddit.com/r/Obamacare',
            'https://reddit.com/r/insurance',
            'https://reddit.com/r/selfemployed',
            'https://reddit.com/r/freelance'
        ],
        searchTerms: [
            'need health insurance advice',
            'ACA open enrollment help',
            'marketplace plan recommendation',
            'health insurance subsidy question'
        ]
    },
    twitter: {
        hashtags: [
            '#ACA', '#Obamacare', '#HealthInsurance', '#OpenEnrollment',
            '#HealthcareMarketplace', '#AffordableCareAct', '#GetCovered'
        ],
        searchTerms: [
            'need health insurance',
            'looking for ACA plan',
            'health insurance help'
        ]
    },
    facebook: {
        groups: [
            // Example group URLs - replace with actual group URLs
            'ACA Health Insurance Support',
            'Affordable Care Act Questions',
            'Health Insurance Marketplace Help'
        ]
    },
    youtube: {
        searchTerms: [
            'how to enroll ACA 2024',
            'health insurance marketplace tutorial',
            'Obamacare enrollment guide'
        ]
    }
};

// ==================== UTILITY FUNCTIONS ====================

async function searchEngine(query, engine = 'google') {
    console.log(`🔍 Searching ${engine}: "${query}"`);
    try {
        const response = await axios({
            url: `${BASE_URL}/request`,
            method: 'POST',
            headers,
            data: {
                url: buildSearchUrl(engine, query),
                zone: UNLOCKER_ZONE,
                format: 'raw',
                data_format: engine === 'google' ? 'parsed' : 'markdown'
            }
        });
        return response.data;
    } catch (error) {
        console.error(`Error searching ${engine}:`, error.message);
        return null;
    }
}

function buildSearchUrl(engine, query) {
    const q = encodeURIComponent(query);
    if (engine === 'bing') return `https://www.bing.com/search?q=${q}`;
    if (engine === 'yandex') return `https://yandex.com/search/?text=${q}`;
    return `https://www.google.com/search?q=${q}`;
}

async function scrapeAsMarkdown(url) {
    console.log(`📄 Scraping: ${url}`);
    try {
        const response = await axios({
            url: `${BASE_URL}/request`,
            method: 'POST',
            headers,
            data: {
                url,
                zone: UNLOCKER_ZONE,
                format: 'raw',
                data_format: 'markdown'
            }
        });
        return response.data;
    } catch (error) {
        console.error(`Error scraping ${url}:`, error.message);
        return null;
    }
}

async function triggerDataCollection(datasetId, inputData) {
    try {
        const response = await axios({
            url: `${BASE_URL}/datasets/v3/trigger`,
            method: 'POST',
            headers,
            params: { dataset_id: datasetId, include_errors: true },
            data: [inputData]
        });
        return response.data?.snapshot_id;
    } catch (error) {
        console.error('Error triggering data collection:', error.message);
        return null;
    }
}

async function waitForSnapshot(snapshotId, maxAttempts = 120) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const response = await axios({
                url: `${BASE_URL}/datasets/v3/snapshot/${snapshotId}`,
                method: 'GET',
                headers,
                params: { format: 'json' }
            });

            if (!['running', 'building'].includes(response.data?.status)) {
                return response.data;
            }

            console.log(`  ⏳ Waiting for data (${i + 1}/${maxAttempts})...`);
            await new Promise(r => setTimeout(r, 1000));
        } catch (error) {
            if (error.response?.status === 400) throw error;
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    throw new Error('Timeout waiting for data');
}

// ==================== SOCIAL MEDIA SCRAPERS ====================

// Dataset IDs from the Bright Data MCP
const DATASETS = {
    reddit_posts: 'gd_lvz8ah06191smkebj4',
    x_posts: 'gd_lwxkxvnf1cynvib9co',
    facebook_posts: 'gd_lyclm1571iy3mv57zw',
    instagram_posts: 'gd_lk5ns7kz21pck8jpis',
    tiktok_posts: 'gd_lu702nij2f790tmv9h',
    youtube_videos: 'gd_lk56epmy2i5g7lzu0k',
    youtube_comments: 'gd_lk9q0ew71spt1mxywf',
    linkedin_posts: 'gd_lyy3tktm25m4avu764'
};

async function scrapeRedditPost(url) {
    console.log(`📱 Reddit: ${url}`);
    const snapshotId = await triggerDataCollection(DATASETS.reddit_posts, { url });
    if (!snapshotId) return null;
    return await waitForSnapshot(snapshotId);
}

async function scrapeTwitterPost(url) {
    console.log(`📱 Twitter/X: ${url}`);
    const snapshotId = await triggerDataCollection(DATASETS.x_posts, { url });
    if (!snapshotId) return null;
    return await waitForSnapshot(snapshotId);
}

async function scrapeFacebookPost(url) {
    console.log(`📱 Facebook: ${url}`);
    const snapshotId = await triggerDataCollection(DATASETS.facebook_posts, { url });
    if (!snapshotId) return null;
    return await waitForSnapshot(snapshotId);
}

async function scrapeInstagramPost(url) {
    console.log(`📱 Instagram: ${url}`);
    const snapshotId = await triggerDataCollection(DATASETS.instagram_posts, { url });
    if (!snapshotId) return null;
    return await waitForSnapshot(snapshotId);
}

async function scrapeTikTokPost(url) {
    console.log(`📱 TikTok: ${url}`);
    const snapshotId = await triggerDataCollection(DATASETS.tiktok_posts, { url });
    if (!snapshotId) return null;
    return await waitForSnapshot(snapshotId);
}

async function scrapeYouTubeVideo(url) {
    console.log(`📱 YouTube: ${url}`);
    const snapshotId = await triggerDataCollection(DATASETS.youtube_videos, { url });
    if (!snapshotId) return null;
    return await waitForSnapshot(snapshotId);
}

// ==================== LEAD EXTRACTION ====================

function extractLeadsFromSearchResults(searchData) {
    const leads = [];

    try {
        const data = typeof searchData === 'string' ? JSON.parse(searchData) : searchData;

        // Extract from organic results
        if (data.organic) {
            for (const result of data.organic) {
                leads.push({
                    type: 'search_result',
                    title: result.title,
                    url: result.link,
                    description: result.description,
                    source: 'google_search'
                });
            }
        }
    } catch (e) {
        // Handle markdown format from Bing/Yandex
        if (typeof searchData === 'string') {
            leads.push({
                type: 'search_result',
                content: searchData,
                source: 'search_markdown'
            });
        }
    }

    return leads;
}

function extractLeadsFromSocialMedia(data, platform) {
    const leads = [];

    if (!data) return leads;

    const posts = Array.isArray(data) ? data : [data];

    for (const post of posts) {
        leads.push({
            type: 'social_media_post',
            platform,
            author: post.author || post.username || post.user,
            content: post.text || post.content || post.description || post.caption,
            url: post.url || post.link,
            engagement: {
                likes: post.likes || post.like_count,
                comments: post.comments || post.comment_count,
                shares: post.shares || post.share_count
            },
            date: post.date || post.timestamp || post.created_at
        });
    }

    return leads;
}

// ==================== MAIN SCRAPING FUNCTIONS ====================

async function scrapeSearchEngines() {
    console.log('\n' + '='.repeat(60));
    console.log('🔍 PHASE 1: SEARCH ENGINE SCRAPING');
    console.log('='.repeat(60) + '\n');

    const allLeads = [];

    for (const query of ACA_SEARCH_QUERIES.slice(0, 10)) { // Limit for demo
        const results = await searchEngine(query, 'google');
        if (results) {
            const leads = extractLeadsFromSearchResults(results);
            allLeads.push(...leads);
            console.log(`  ✅ Found ${leads.length} results`);
        }
        // Rate limiting
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`\n📊 Total search engine leads: ${allLeads.length}`);
    return allLeads;
}

async function scrapeRedditSubreddits() {
    console.log('\n' + '='.repeat(60));
    console.log('📱 PHASE 2: REDDIT SCRAPING');
    console.log('='.repeat(60) + '\n');

    const allLeads = [];

    // Scrape subreddits for ACA discussions
    const redditSearchQueries = [
        'site:reddit.com "need health insurance" OR "ACA enrollment"',
        'site:reddit.com "health insurance advice" self employed',
        'site:reddit.com "marketplace plan" help choosing'
    ];

    for (const query of redditSearchQueries) {
        const results = await searchEngine(query, 'google');
        if (results) {
            const leads = extractLeadsFromSearchResults(results);
            allLeads.push(...leads);
            console.log(`  ✅ Found ${leads.length} Reddit discussions`);
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`\n📊 Total Reddit leads: ${allLeads.length}`);
    return allLeads;
}

async function scrapeTwitter() {
    console.log('\n' + '='.repeat(60));
    console.log('📱 PHASE 3: TWITTER/X SCRAPING');
    console.log('='.repeat(60) + '\n');

    const allLeads = [];

    // Search for ACA-related tweets via search engine
    const twitterSearchQueries = [
        'site:twitter.com "need health insurance" OR "looking for ACA"',
        'site:x.com "#OpenEnrollment" health insurance',
        'site:twitter.com "Obamacare" sign up help'
    ];

    for (const query of twitterSearchQueries) {
        const results = await searchEngine(query, 'google');
        if (results) {
            const leads = extractLeadsFromSearchResults(results);
            allLeads.push(...leads);
            console.log(`  ✅ Found ${leads.length} Twitter discussions`);
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`\n📊 Total Twitter leads: ${allLeads.length}`);
    return allLeads;
}

async function scrapeFacebook() {
    console.log('\n' + '='.repeat(60));
    console.log('📱 PHASE 4: FACEBOOK SCRAPING');
    console.log('='.repeat(60) + '\n');

    const allLeads = [];

    // Search for ACA-related Facebook content
    const fbSearchQueries = [
        'site:facebook.com "ACA health insurance" group',
        'site:facebook.com "health insurance marketplace" 2024',
        'site:facebook.com "affordable care act" enrollment'
    ];

    for (const query of fbSearchQueries) {
        const results = await searchEngine(query, 'google');
        if (results) {
            const leads = extractLeadsFromSearchResults(results);
            allLeads.push(...leads);
            console.log(`  ✅ Found ${leads.length} Facebook results`);
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`\n📊 Total Facebook leads: ${allLeads.length}`);
    return allLeads;
}

async function scrapeInstagram() {
    console.log('\n' + '='.repeat(60));
    console.log('📱 PHASE 5: INSTAGRAM SCRAPING');
    console.log('='.repeat(60) + '\n');

    const allLeads = [];

    // Search for ACA-related Instagram content
    const igSearchQueries = [
        'site:instagram.com "#healthinsurance" "#ACA"',
        'site:instagram.com "#openenrollment" 2024',
        'site:instagram.com health insurance enrollment'
    ];

    for (const query of igSearchQueries) {
        const results = await searchEngine(query, 'google');
        if (results) {
            const leads = extractLeadsFromSearchResults(results);
            allLeads.push(...leads);
            console.log(`  ✅ Found ${leads.length} Instagram results`);
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`\n📊 Total Instagram leads: ${allLeads.length}`);
    return allLeads;
}

async function scrapeTikTok() {
    console.log('\n' + '='.repeat(60));
    console.log('📱 PHASE 6: TIKTOK SCRAPING');
    console.log('='.repeat(60) + '\n');

    const allLeads = [];

    // Search for ACA-related TikTok content
    const ttSearchQueries = [
        'site:tiktok.com health insurance ACA',
        'site:tiktok.com marketplace enrollment',
        'site:tiktok.com Obamacare signup'
    ];

    for (const query of ttSearchQueries) {
        const results = await searchEngine(query, 'google');
        if (results) {
            const leads = extractLeadsFromSearchResults(results);
            allLeads.push(...leads);
            console.log(`  ✅ Found ${leads.length} TikTok results`);
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`\n📊 Total TikTok leads: ${allLeads.length}`);
    return allLeads;
}

async function scrapeYouTube() {
    console.log('\n' + '='.repeat(60));
    console.log('📱 PHASE 7: YOUTUBE SCRAPING');
    console.log('='.repeat(60) + '\n');

    const allLeads = [];

    // Search for ACA-related YouTube content
    const ytSearchQueries = [
        'site:youtube.com "how to enroll ACA 2024"',
        'site:youtube.com "health insurance marketplace tutorial"',
        'site:youtube.com "Obamacare enrollment guide"'
    ];

    for (const query of ytSearchQueries) {
        const results = await searchEngine(query, 'google');
        if (results) {
            const leads = extractLeadsFromSearchResults(results);
            allLeads.push(...leads);
            console.log(`  ✅ Found ${leads.length} YouTube results`);
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`\n📊 Total YouTube leads: ${allLeads.length}`);
    return allLeads;
}

async function scrapeLinkedIn() {
    console.log('\n' + '='.repeat(60));
    console.log('📱 PHASE 8: LINKEDIN SCRAPING');
    console.log('='.repeat(60) + '\n');

    const allLeads = [];

    // Search for ACA-related LinkedIn content (insurance agents, brokers)
    const liSearchQueries = [
        'site:linkedin.com "health insurance agent" ACA specialist',
        'site:linkedin.com "health insurance broker" marketplace',
        'site:linkedin.com "ACA enrollment" professional'
    ];

    for (const query of liSearchQueries) {
        const results = await searchEngine(query, 'google');
        if (results) {
            const leads = extractLeadsFromSearchResults(results);
            allLeads.push(...leads);
            console.log(`  ✅ Found ${leads.length} LinkedIn results`);
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`\n📊 Total LinkedIn leads: ${allLeads.length}`);
    return allLeads;
}

async function scrapeForumsAndCommunities() {
    console.log('\n' + '='.repeat(60));
    console.log('🌐 PHASE 9: FORUMS & COMMUNITIES SCRAPING');
    console.log('='.repeat(60) + '\n');

    const allLeads = [];

    // Search various forums and Q&A sites
    const forumSearchQueries = [
        'site:quora.com "health insurance" ACA advice',
        'site:healthinsurance.org enrollment help',
        'site:kff.org ACA marketplace 2024',
        '"health insurance" forum help choosing plan'
    ];

    for (const query of forumSearchQueries) {
        const results = await searchEngine(query, 'google');
        if (results) {
            const leads = extractLeadsFromSearchResults(results);
            allLeads.push(...leads);
            console.log(`  ✅ Found ${leads.length} forum/community results`);
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`\n📊 Total forum leads: ${allLeads.length}`);
    return allLeads;
}

// ==================== MAIN EXECUTION ====================

async function main() {
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║     ACA HEALTH INSURANCE LEAD SCRAPER - BRIGHT DATA MCP       ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log(`\n📅 Started at: ${new Date().toISOString()}`);
    console.log(`🔑 API Token: ${API_TOKEN.slice(0, 8)}...`);
    console.log(`🌐 Zone: ${UNLOCKER_ZONE}\n`);

    const allLeads = {
        searchEngines: [],
        reddit: [],
        twitter: [],
        facebook: [],
        instagram: [],
        tiktok: [],
        youtube: [],
        linkedin: [],
        forums: []
    };

    try {
        // Execute all scraping phases
        allLeads.searchEngines = await scrapeSearchEngines();
        allLeads.reddit = await scrapeRedditSubreddits();
        allLeads.twitter = await scrapeTwitter();
        allLeads.facebook = await scrapeFacebook();
        allLeads.instagram = await scrapeInstagram();
        allLeads.tiktok = await scrapeTikTok();
        allLeads.youtube = await scrapeYouTube();
        allLeads.linkedin = await scrapeLinkedIn();
        allLeads.forums = await scrapeForumsAndCommunities();

        // Calculate totals
        const totalLeads = Object.values(allLeads).reduce((sum, arr) => sum + arr.length, 0);

        // Summary
        console.log('\n' + '═'.repeat(60));
        console.log('📊 SCRAPING COMPLETE - SUMMARY');
        console.log('═'.repeat(60));
        console.log(`\n📈 Total leads found: ${totalLeads}`);
        console.log(`   • Search Engines: ${allLeads.searchEngines.length}`);
        console.log(`   • Reddit: ${allLeads.reddit.length}`);
        console.log(`   • Twitter/X: ${allLeads.twitter.length}`);
        console.log(`   • Facebook: ${allLeads.facebook.length}`);
        console.log(`   • Instagram: ${allLeads.instagram.length}`);
        console.log(`   • TikTok: ${allLeads.tiktok.length}`);
        console.log(`   • YouTube: ${allLeads.youtube.length}`);
        console.log(`   • LinkedIn: ${allLeads.linkedin.length}`);
        console.log(`   • Forums: ${allLeads.forums.length}`);

        // Save results
        const outputDir = './output';
        if (!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputFile = `${outputDir}/aca-leads-${timestamp}.json`;

        writeFileSync(outputFile, JSON.stringify(allLeads, null, 2));
        console.log(`\n💾 Results saved to: ${outputFile}`);

        console.log(`\n⏰ Completed at: ${new Date().toISOString()}`);

        return allLeads;

    } catch (error) {
        console.error('\n❌ Error during scraping:', error.message);
        throw error;
    }
}

// Run if executed directly
main().catch(console.error);

export {
    searchEngine,
    scrapeAsMarkdown,
    scrapeRedditPost,
    scrapeTwitterPost,
    scrapeFacebookPost,
    scrapeInstagramPost,
    scrapeTikTokPost,
    scrapeYouTubeVideo,
    main
};
