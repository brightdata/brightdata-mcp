/**
 * ACA Health Insurance Scraping Tools for Bright Data MCP
 *
 * These tools extend the Bright Data MCP with specialized capabilities
 * for finding people interested in ACA health insurance.
 */

import {z} from 'zod';
import axios from 'axios';

// Search query templates for finding ACA leads
const ACA_SEARCH_TEMPLATES = {
    direct_intent: [
        'need health insurance ACA open enrollment',
        'how to sign up for Obamacare marketplace',
        'ACA marketplace plans comparison',
        'health insurance subsidy calculator'
    ],
    pain_points: [
        'lost job need health insurance',
        'can\'t afford health insurance options',
        'health insurance between jobs',
        'self employed health insurance ACA'
    ],
    life_events: [
        'just turned 26 need health insurance',
        'getting married health insurance options',
        'having a baby health insurance enrollment',
        'divorce health insurance coverage'
    ],
    cost_focused: [
        'cheapest ACA plans',
        'health insurance under $200 month',
        'ACA subsidies income limits'
    ]
};

// Social media platforms and their search patterns
const SOCIAL_PLATFORMS = {
    reddit: {
        siteSearch: 'site:reddit.com',
        keywords: [
            '"need health insurance advice"',
            '"ACA enrollment help"',
            '"marketplace plan recommendation"'
        ]
    },
    twitter: {
        siteSearch: 'site:twitter.com OR site:x.com',
        keywords: [
            '"#OpenEnrollment"',
            '"need health insurance"',
            '"ACA plan"'
        ]
    },
    facebook: {
        siteSearch: 'site:facebook.com',
        keywords: [
            '"ACA health insurance"',
            '"health insurance marketplace"',
            '"affordable care act enrollment"'
        ]
    },
    tiktok: {
        siteSearch: 'site:tiktok.com',
        keywords: [
            'health insurance ACA',
            'marketplace enrollment',
            'Obamacare signup'
        ]
    },
    youtube: {
        siteSearch: 'site:youtube.com',
        keywords: [
            '"how to enroll ACA"',
            '"health insurance marketplace tutorial"',
            '"Obamacare enrollment"'
        ]
    },
    instagram: {
        siteSearch: 'site:instagram.com',
        keywords: [
            '"#healthinsurance"',
            '"#openenrollment"',
            'ACA coverage'
        ]
    },
    linkedin: {
        siteSearch: 'site:linkedin.com',
        keywords: [
            '"health insurance agent"',
            '"ACA specialist"',
            '"insurance broker marketplace"'
        ]
    }
};

/**
 * Create ACA scraping tools for the MCP server
 * @param {Function} api_headers - Function to generate API headers
 * @param {string} unlocker_zone - The unlocker zone to use
 * @returns {Array} Array of tool configurations
 */
export function createAcaScrapingTools(api_headers, unlocker_zone) {
    const tools = [];

    // Tool 1: Search for ACA health insurance leads
    tools.push({
        name: 'aca_search_leads',
        description: 'Search Google for people looking for ACA/Obamacare health insurance. ' +
            'Returns search results from people actively seeking health insurance information, ' +
            'including those who lost jobs, turning 26, self-employed, or experiencing life events. ' +
            'Use category parameter to focus on specific lead types.',
        parameters: z.object({
            category: z.enum(['direct_intent', 'pain_points', 'life_events', 'cost_focused', 'all'])
                .optional()
                .default('all')
                .describe('Category of search queries to use'),
            state: z.string()
                .optional()
                .describe('US state to focus search on (e.g., "California", "Texas")'),
            year: z.string()
                .optional()
                .default(new Date().getFullYear().toString())
                .describe('Year for enrollment-related searches'),
            max_queries: z.number()
                .optional()
                .default(5)
                .describe('Maximum number of search queries to run')
        }),
        execute: async (params, ctx) => {
            const { category, state, year, max_queries } = params;

            let queries = [];

            if (category === 'all') {
                queries = Object.values(ACA_SEARCH_TEMPLATES).flat();
            } else {
                queries = ACA_SEARCH_TEMPLATES[category] || [];
            }

            // Add state and year modifiers
            queries = queries.slice(0, max_queries).map(q => {
                let modifiedQuery = `${q} ${year}`;
                if (state) modifiedQuery += ` ${state}`;
                return modifiedQuery;
            });

            const results = [];

            for (const query of queries) {
                try {
                    const response = await axios({
                        url: 'https://api.brightdata.com/request',
                        method: 'POST',
                        headers: api_headers(ctx.clientName),
                        data: {
                            url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
                            zone: unlocker_zone,
                            format: 'raw',
                            data_format: 'parsed'
                        }
                    });

                    const searchData = JSON.parse(response.data);
                    results.push({
                        query,
                        organic: searchData.organic || [],
                        related: searchData.related || []
                    });
                } catch (e) {
                    console.error(`Error searching: ${query}`, e.message);
                }
            }

            return JSON.stringify({
                total_queries: queries.length,
                total_results: results.reduce((sum, r) => sum + (r.organic?.length || 0), 0),
                results
            }, null, 2);
        }
    });

    // Tool 2: Search social media for ACA discussions
    tools.push({
        name: 'aca_social_media_search',
        description: 'Search social media platforms for people discussing ACA/Obamacare health insurance. ' +
            'Finds conversations, posts, and discussions where people are asking about or looking for health insurance. ' +
            'Supports Reddit, Twitter/X, Facebook, TikTok, YouTube, Instagram, and LinkedIn.',
        parameters: z.object({
            platforms: z.array(z.enum(['reddit', 'twitter', 'facebook', 'tiktok', 'youtube', 'instagram', 'linkedin', 'all']))
                .optional()
                .default(['all'])
                .describe('Social media platforms to search'),
            custom_keyword: z.string()
                .optional()
                .describe('Additional keyword to include in searches')
        }),
        execute: async (params, ctx) => {
            let { platforms, custom_keyword } = params;

            if (platforms.includes('all')) {
                platforms = Object.keys(SOCIAL_PLATFORMS);
            }

            const results = {};

            for (const platform of platforms) {
                const config = SOCIAL_PLATFORMS[platform];
                if (!config) continue;

                results[platform] = [];

                for (const keyword of config.keywords.slice(0, 2)) {
                    const query = custom_keyword
                        ? `${config.siteSearch} ${keyword} ${custom_keyword}`
                        : `${config.siteSearch} ${keyword}`;

                    try {
                        const response = await axios({
                            url: 'https://api.brightdata.com/request',
                            method: 'POST',
                            headers: api_headers(ctx.clientName),
                            data: {
                                url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
                                zone: unlocker_zone,
                                format: 'raw',
                                data_format: 'parsed'
                            }
                        });

                        const searchData = JSON.parse(response.data);
                        results[platform].push({
                            query,
                            results: searchData.organic || []
                        });
                    } catch (e) {
                        console.error(`Error searching ${platform}:`, e.message);
                    }
                }
            }

            return JSON.stringify({
                platforms_searched: platforms,
                results
            }, null, 2);
        }
    });

    // Tool 3: Scrape specific ACA-related pages
    tools.push({
        name: 'aca_scrape_discussion',
        description: 'Scrape a specific webpage (forum post, social media discussion, or article) ' +
            'about ACA health insurance and extract relevant lead information. ' +
            'Returns the content in markdown format for analysis.',
        parameters: z.object({
            url: z.string().url().describe('URL of the discussion or page to scrape')
        }),
        execute: async (params, ctx) => {
            const { url } = params;

            try {
                const response = await axios({
                    url: 'https://api.brightdata.com/request',
                    method: 'POST',
                    headers: api_headers(ctx.clientName),
                    data: {
                        url,
                        zone: unlocker_zone,
                        format: 'raw',
                        data_format: 'markdown'
                    }
                });

                return JSON.stringify({
                    url,
                    content: response.data,
                    scraped_at: new Date().toISOString()
                }, null, 2);
            } catch (e) {
                return JSON.stringify({
                    url,
                    error: e.message,
                    scraped_at: new Date().toISOString()
                }, null, 2);
            }
        }
    });

    // Tool 4: Batch scrape multiple ACA-related URLs
    tools.push({
        name: 'aca_batch_scrape',
        description: 'Scrape multiple ACA health insurance related pages at once. ' +
            'Useful for extracting content from multiple forum posts, social media pages, or articles simultaneously.',
        parameters: z.object({
            urls: z.array(z.string().url())
                .min(1)
                .max(10)
                .describe('Array of URLs to scrape (max 10)')
        }),
        execute: async (params, ctx) => {
            const { urls } = params;

            const scrapePromises = urls.map(url =>
                axios({
                    url: 'https://api.brightdata.com/request',
                    method: 'POST',
                    headers: api_headers(ctx.clientName),
                    data: {
                        url,
                        zone: unlocker_zone,
                        format: 'raw',
                        data_format: 'markdown'
                    }
                }).then(response => ({
                    url,
                    success: true,
                    content: response.data
                })).catch(e => ({
                    url,
                    success: false,
                    error: e.message
                }))
            );

            const results = await Promise.all(scrapePromises);

            return JSON.stringify({
                total_urls: urls.length,
                successful: results.filter(r => r.success).length,
                failed: results.filter(r => !r.success).length,
                results
            }, null, 2);
        }
    });

    // Tool 5: Find ACA enrollment resources and official pages
    tools.push({
        name: 'aca_find_resources',
        description: 'Find official ACA enrollment resources, healthcare.gov pages, ' +
            'state marketplace websites, and trusted health insurance information sources. ' +
            'Useful for providing accurate information to potential leads.',
        parameters: z.object({
            state: z.string()
                .optional()
                .describe('US state to find state-specific marketplace (e.g., "California")'),
            resource_type: z.enum(['enrollment', 'calculator', 'plans', 'deadlines', 'all'])
                .optional()
                .default('all')
                .describe('Type of resource to find')
        }),
        execute: async (params, ctx) => {
            const { state, resource_type } = params;

            const queries = [];

            if (resource_type === 'all' || resource_type === 'enrollment') {
                queries.push(`site:healthcare.gov enrollment ${state || ''}`);
            }
            if (resource_type === 'all' || resource_type === 'calculator') {
                queries.push(`ACA subsidy calculator ${new Date().getFullYear()} ${state || ''}`);
            }
            if (resource_type === 'all' || resource_type === 'plans') {
                queries.push(`${state || ''} health insurance marketplace plans ${new Date().getFullYear()}`);
            }
            if (resource_type === 'all' || resource_type === 'deadlines') {
                queries.push(`ACA open enrollment deadline ${new Date().getFullYear()}`);
            }

            const results = [];

            for (const query of queries) {
                try {
                    const response = await axios({
                        url: 'https://api.brightdata.com/request',
                        method: 'POST',
                        headers: api_headers(ctx.clientName),
                        data: {
                            url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
                            zone: unlocker_zone,
                            format: 'raw',
                            data_format: 'parsed'
                        }
                    });

                    const searchData = JSON.parse(response.data);
                    results.push({
                        query,
                        resources: searchData.organic?.slice(0, 5) || []
                    });
                } catch (e) {
                    console.error(`Error finding resources:`, e.message);
                }
            }

            return JSON.stringify({
                state: state || 'all states',
                resource_type,
                results
            }, null, 2);
        }
    });

    return tools;
}

export { ACA_SEARCH_TEMPLATES, SOCIAL_PLATFORMS };
