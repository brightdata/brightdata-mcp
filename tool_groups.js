'use strict'; /*jslint node:true es9:true*/
import {scraper_tool_names} from './scraper_tools.js';

const base_tools = ['search_engine', 'scrape_as_markdown',
    'ask_brightdata_assistant'];
const scraper_tools = [...base_tools, ...scraper_tool_names];
const dataset_search = ['list_dataset_fields', 'search_dataset'];
const ai_tools = ['chatgpt_ai_insights', 'perplexity_ai_insights'];

export const GROUPS = {
    ECOMMERCE: {
        id: 'ecommerce',
        name: 'E-commerce',
        description: 'Retail and marketplace datasets for product intel.',
        tools: scraper_tools,
    },
    SOCIAL_MEDIA: {
        id: 'social',
        name: 'Social Media',
        description: 'Social networks, UGC platforms, and creator insights.',
        tools: [...scraper_tools, ...dataset_search],
    },
    BROWSER: {
        id: 'browser',
        name: 'Browser Automation',
        description: 'Bright Data Scraping Browser tools for automation.',
        tools: [
            ...base_tools,
            'scraping_browser_navigate',
            'scraping_browser_go_back',
            'scraping_browser_go_forward',
            'scraping_browser_snapshot',
            'scraping_browser_fill_form',
            'scraping_browser_click_ref',
            'scraping_browser_type_ref',
            'scraping_browser_screenshot',
            'scraping_browser_network_requests',
            'scraping_browser_wait_for_ref',
            'scraping_browser_get_text',
            'scraping_browser_get_html',
            'scraping_browser_scroll',
            'scraping_browser_scroll_to_ref',
        ],
    },
    FINANCE: {
        id: 'finance',
        name: 'Finance Intelligence',
        description: 'Company, financial, and location intelligence datasets.',
        tools: scraper_tools,
    },
    BUSINESS: {
        id: 'business',
        name: 'Business Intelligence',
        description: 'Company, and location intelligence datasets.',
        tools: [...scraper_tools, ...dataset_search],
    },
    RESEARCH: {
        id: 'research',
        name: 'Research',
        description: 'App stores, news, and developer data feeds.',
        tools: scraper_tools,
    },
    APP_STORES: {
        id: 'app_stores',
        name: 'App stores',
        description: 'App stores.',
        tools: scraper_tools,
    },
    TRAVEL: {
        id: 'travel',
        name: 'Travel',
        description: 'Travel information.',
        tools: scraper_tools,
    },
    ADVANCED_SCRAPING: {
        id: 'advanced_scraping',
        name: 'Advanced Scraping',
        description: 'Higher-throughput scraping utilities and batch helpers.',
        tools: [
            ...base_tools,
            'search_engine_batch',
            'scrape_batch',
            'scrape_as_html',
            'extract',
            'session_stats',
        ],
    },
    GEO: {
        id: 'geo',
        name: 'GEO & LLM Visibility',
        description: 'Tools for measuring and analyzing AI/LLM brand '
        +'visibility and generative engine optimization.',
        tools: [...base_tools, ...ai_tools],
    },
    CODE: {
        id: 'code',
        name: 'Code',
        description: 'Developer tools and package information datasets.',
        tools: scraper_tools,
    },
    SCRAPERS: {
        id: 'scrapers',
        name: 'Web Scraper API',
        description: 'Search and run any of 1,200+ pre-built scrapers.',
        tools: scraper_tools,
    },
    CUSTOM: {
        id: 'custom',
        name: 'Custom',
        description: 'Placeholder for user-defined tool selections.',
        tools: [...base_tools],
    },
};

export const get_all_group_ids = ()=>{
    return Object.values(GROUPS)
        .map(group=>group.id)
        .filter(id=>id!=='custom');
};

export const get_total_tool_count = ()=>{
    const all_tools = new Set();
    for (let group of Object.values(GROUPS))
        for (let tool of group.tools)
            all_tools.add(tool);
    return all_tools.size;
};

export const resolve_tool = name=>{
    const short = name.replace(/^web_data_/, '');
    if (short==name)
        return [name];
    return ai_tools.includes(short) ? [short] : scraper_tool_names;
};

export {base_tools};
