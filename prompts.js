// LICENSE_CODE ZON
'use strict'; /*jslint node:true es9:true*/

const web_scraping_strategy = {
    name: 'web_scraping_strategy',
    description: 'Decision tree for picking the right Bright Data tool. '
        +'Invoke at the start of any scraping session to learn the correct '
        +'tool selection order '
        +'(dataset tools -> Web Unlocker -> Browser API).',
    arguments: [],
    load: ()=>'You have access to Bright Data tools at three tiers of cost'
        +' and capability.\n'
        +'Always follow this order -- do not skip ahead:\n'
        +'\nSTEP 1 -- Check for a dedicated dataset tool (fastest, cheapest):'
        +'\n  Look at the URL. If it matches a known platform, use the'
        +' corresponding web_data_* tool:'
        +'\n  - Amazon product page (/dp/)     -> web_data_amazon_product'
        +'\n  - Amazon search results'
        +'          -> web_data_amazon_product_search'
        +'\n  - LinkedIn profile'
        +'               -> web_data_linkedin_person_profile'
        +'\n  - LinkedIn company'
        +'               -> web_data_linkedin_company_profile'
        +'\n  - Instagram profile/post/reel'
        +'    -> web_data_instagram_profiles / _posts / _reels'
        +'\n  - TikTok profile/post'
        +'            -> web_data_tiktok_profiles / _posts'
        +'\n  - YouTube video/channel'
        +'          -> web_data_youtube_videos / _profiles'
        +'\n  - Reddit post                    -> web_data_reddit_posts'
        +'\n  - X (Twitter) post               -> web_data_x_posts'
        +'\n  - Zillow listing'
        +'                 -> web_data_zillow_properties_listing'
        +'\n  - Booking.com hotel'
        +'              -> web_data_booking_hotel_listings'
        +'\n  - GitHub file'
        +'                    -> web_data_github_repository_file'
        +'\n  - Google Maps reviews            -> web_data_google_maps_reviews'
        +'\n  - Google Shopping                -> web_data_google_shopping'
        +'\n  - (and more -- check all web_data_* tools before proceeding)'
        +'\n\nSTEP 2 -- If no dataset tool matches, use scrape_as_markdown'
        +' (default):'
        +'\n  This is the general-purpose reader for a public page and the'
        +' right first choice for almost any URL.'
        +'\n\nSTEP 3 -- Use scraping_browser_navigate when the page needs a'
        +' real browser:'
        +'\n  content that renders after load, or a flow that requires'
        +' interaction'
        +'\n  (clicking, form submission). Also use it if scrape_as_markdown'
        +' did not return the page content on two attempts.'
        +'\n  This is slower and more expensive'
        +' -- do not use it as a first attempt.'
        +'\n\nNEVER use the browser tools for sites'
        +' scrape_as_markdown can handle.'
        +'\nNEVER use scrape_as_markdown when a web_data_* tool matches'
        +' the URL pattern.',
};

const diagnose_scraping_approach = {
    name: 'diagnose_scraping_approach',
    description: 'Run a two-step diagnostic to discover the correct '
        +'Bright Data product for a new website. Tries Web Unlocker first, '
        +'then Browser API, then reports which succeeded.',
    arguments: [],
    load: ()=>'To discover the correct Bright Data product for a new'
        +' website, run this diagnostic:\n'
        +'\n1. Try scrape_as_markdown on the target URL.'
        +'\n   - If it returns the page content'
        +' -> Web Unlocker is the correct integration. Stop.'
        +'\n   - Otherwise -> continue to step 2.'
        +'\n\n2. Try scraping_browser_navigate + scraping_browser_snapshot'
        +' on the same URL.'
        +'\n   - If it returns the page content'
        +' -> Browser API is the correct integration. Stop.'
        +'\n   - If both fail -> report to the user that the target may'
        +' require a specialized'
        +'\n     Bright Data product'
        +' (SERP API, specific dataset tool, or custom configuration).'
        +'\n\nReport which approach succeeded and recommend it as the'
        +' integration method.'
        +'\nDo not proceed with data extraction until the diagnostic'
        +' is complete.',
};

const prompts = [web_scraping_strategy, diagnose_scraping_approach];

export default prompts;
