'use strict'; /*jslint node:true es9:true*/

const base_tools = ['search_engine', 'scrape_as_markdown'];

export const GROUPS = {
    ECOMMERCE: {
        id: 'ecommerce',
        name: 'E-commerce',
        description: 'Retail and marketplace datasets for product intel.',
        tools: [
            ...base_tools,
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
            'web_data_google_shopping',
        ],
    },
    SOCIAL_MEDIA: {
        id: 'social',
        name: 'Social Media',
        description: 'Social networks, UGC platforms, and creator insights.',
        tools: [
            ...base_tools,
            'web_data_linkedin_person_profile',
            'web_data_linkedin_company_profile',
            'web_data_linkedin_job_listings',
            'web_data_linkedin_posts',
            'web_data_linkedin_people_search',
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
            'web_data_x_posts',
            'web_data_youtube_profiles',
            'web_data_youtube_comments',
            'web_data_youtube_videos',
            'web_data_reddit_posts',
        ],
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
        tools: [
            ...base_tools,
            'web_data_yahoo_finance_business',
        ],
    },
    BUSINESS: {
        id: 'business',
        name: 'Business Intelligence',
        description: 'Company, and location intelligence datasets.',
        tools: [
            ...base_tools,
            'web_data_crunchbase_company',
            'web_data_zoominfo_company_profile',
            'web_data_google_maps_reviews',
            'web_data_zillow_properties_listing',
            'web_data_booking_hotel_listings',
        ],
    },
    RESEARCH: {
        id: 'research',
        name: 'Research',
        description: 'App stores, news, and developer data feeds.',
        tools: [
            ...base_tools,
            'web_data_github_repository_file',
            'web_data_reuter_news',
        ],
    },
    APP_STORES: {
        id: 'app_stores',
        name: 'App stores',
        description: 'App stores.',
        tools: [
            ...base_tools,
            'web_data_google_play_store',
            'web_data_apple_app_store',
        ],
    },
    TRAVEL: {
        id: 'travel',
        name: 'Travel',
        description: 'Travel information.',
        tools: [
            ...base_tools,
            'web_data_booking_hotel_listings',
        ],
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

export {base_tools};
