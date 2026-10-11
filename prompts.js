// LICENSE_CODE ZON
'use strict'; /*jslint node:true es9:true*/

const web_scraping_strategy = {
    name: 'web_scraping_strategy',
    description: 'Decision tree for picking the right Bright Data tool. '
        +'Invoke at the start of any scraping session to learn the correct '
        +'tool selection order '
        +'(pre-built scrapers -> Web Unlocker -> Browser API).',
    arguments: [],
    load: ()=>'You have access to Bright Data tools at three tiers of cost'
        +' and capability.\n'
        +'Always follow this order -- do not skip ahead:\n'
        +'\nSTEP 1 -- Check for a pre-built scraper (fastest, cheapest,'
        +' structured JSON):'
        +'\n  Call search_scrapers with the site or data type (e.g.'
        +' "amazon product", "linkedin.com"). If one matches, call'
        +' get_scraper_details, then run_scraper with input shaped like'
        +' sample_input.'
        +'\n\nSTEP 2 -- If no scraper matches, use scrape_as_markdown'
        +' (default):'
        +'\n  This handles anti-bot protection and CAPTCHA automatically.'
        +'\n  Retry once if the first attempt returns empty or blocked'
        +' content.'
        +'\n\nSTEP 3 -- If scrape_as_markdown fails twice, escalate to'
        +' scraping_browser_navigate:'
        +'\n  Use ONLY when the page requires JavaScript execution,'
        +' user interaction'
        +'\n  (clicking, form submission), or dynamic content loading.'
        +'\n  This is slower and more expensive'
        +' -- do not use as a first attempt.'
        +'\n\nNEVER use the browser tools for sites'
        +' scrape_as_markdown can handle.'
        +'\nNEVER use scrape_as_markdown when a pre-built scraper covers'
        +' the site.',
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
        +'\n   - If it returns useful content'
        +' -> Web Unlocker is the correct integration. Stop.'
        +'\n   - If it returns empty, blocked, or low-quality content'
        +' -> continue to step 2.'
        +'\n\n2. Try scraping_browser_navigate + scraping_browser_snapshot'
        +' on the same URL.'
        +'\n   - If it returns useful content'
        +' -> Browser API is the correct integration. Stop.'
        +'\n   - If both fail -> report to the user that the target may'
        +' require a specialized'
        +'\n     Bright Data product'
        +' (SERP API, a pre-built scraper, or custom configuration).'
        +'\n\nReport which approach succeeded and recommend it as the'
        +' integration method.'
        +'\nDo not proceed with data extraction until the diagnostic'
        +' is complete.',
};

const prompts = [web_scraping_strategy, diagnose_scraping_approach];

export default prompts;
