|Feature|Description|
|---|---|
|search_engine|Scrape search results from Google, Bing, or Yandex. Returns SERP results in JSON for Google and Markdown for Bing/Yandex; supports pagination with the cursor parameter.|
|scrape_as_markdown|Scrape a single webpage with advanced extraction and return Markdown. Uses Bright Data's unlocker to handle bot protection and CAPTCHA.|
|search_engine_batch|Run up to 10 search queries in parallel. Returns JSON for Google results and Markdown for Bing/Yandex.|
|scrape_batch|Scrape up to 10 webpages in one request and return an array of URL/content pairs in Markdown format.|
|scrape_as_html|Scrape a single webpage with advanced extraction and return the HTML response body. Handles sites protected by bot detection or CAPTCHA.|
|extract|Scrape a webpage as Markdown and convert it to structured JSON using AI sampling, with an optional custom extraction prompt.|
|session_stats|Report how many times each tool has been called during the current MCP session.|
|web_data_amazon_product|Quickly read structured Amazon product data. Requires a valid product URL containing /dp/. Often faster and more reliable than scraping.|
|web_data_amazon_product_reviews|Quickly read structured Amazon product review data. Requires a valid product URL containing /dp/. Often faster and more reliable than scraping.|
|web_data_amazon_product_search|Retrieve structured Amazon search results. Requires a search keyword and Amazon domain URL; limited to the first page of results.|
|web_data_walmart_product|Quickly read structured Walmart product data. Requires a product URL containing /ip/. Often faster and more reliable than scraping.|
|web_data_walmart_seller|Quickly read structured Walmart seller data. Requires a valid Walmart seller URL. Often faster and more reliable than scraping.|
|web_data_ebay_product|Quickly read structured eBay product data. Requires a valid eBay product URL. Often faster and more reliable than scraping.|
|web_data_homedepot_products|Quickly read structured Home Depot product data. Requires a valid homedepot.com product URL. Often faster and more reliable than scraping.|
|web_data_zara_products|Quickly read structured Zara product data. Requires a valid Zara product URL. Often faster and more reliable than scraping.|
|web_data_etsy_products|Quickly read structured Etsy product data. Requires a valid Etsy product URL. Often faster and more reliable than scraping.|
|web_data_bestbuy_products|Quickly read structured Best Buy product data. Requires a valid Best Buy product URL. Often faster and more reliable than scraping.|
|web_data_linkedin_person_profile|Quickly read structured LinkedIn people profile data. Requires a valid LinkedIn profile URL. Often faster and more reliable than scraping.|
|web_data_linkedin_company_profile|Quickly read structured LinkedIn company profile data. Requires a valid LinkedIn company URL. Often faster and more reliable than scraping.|
|web_data_linkedin_job_listings|Quickly read structured LinkedIn job listings data. Requires a valid LinkedIn jobs URL or search URL. Often faster and more reliable than scraping.|
|web_data_linkedin_posts|Quickly read structured LinkedIn posts data. Requires a valid LinkedIn post URL. Often faster and more reliable than scraping.|
|web_data_linkedin_people_search|Quickly read structured LinkedIn people search data. Requires a LinkedIn people search URL. Often faster and more reliable than scraping.|
|web_data_crunchbase_company|Quickly read structured Crunchbase company data. Requires a valid Crunchbase company URL. Often faster and more reliable than scraping.|
|web_data_zoominfo_company_profile|Quickly read structured ZoomInfo company profile data. Requires a valid ZoomInfo company URL. Often faster and more reliable than scraping.|
|web_data_instagram_profiles|Quickly read structured Instagram profile data. Requires a valid Instagram profile URL. Often faster and more reliable than scraping.|
|web_data_instagram_posts|Quickly read structured Instagram post data. Requires a valid Instagram post URL. Often faster and more reliable than scraping.|
|web_data_instagram_reels|Quickly read structured Instagram reel data. Requires a valid Instagram reel URL. Often faster and more reliable than scraping.|
|web_data_instagram_comments|Quickly read structured Instagram comments data. Requires a valid Instagram URL. Often faster and more reliable than scraping.|
|web_data_facebook_posts|Quickly read structured Facebook post data. Requires a valid Facebook post URL. Often faster and more reliable than scraping.|
|web_data_facebook_marketplace_listings|Quickly read structured Facebook Marketplace listing data. Requires a valid Marketplace listing URL. Often faster and more reliable than scraping.|
|web_data_facebook_company_reviews|Quickly read structured Facebook company reviews data. Requires a valid Facebook company URL and review count. Often faster and more reliable than scraping.|
|web_data_facebook_events|Quickly read structured Facebook events data. Requires a valid Facebook event URL. Often faster and more reliable than scraping.|
|web_data_tiktok_profiles|Quickly read structured TikTok profile data. Requires a valid TikTok profile URL. Often faster and more reliable than scraping.|
|web_data_tiktok_posts|Quickly read structured TikTok post data. Requires a valid TikTok post URL. Often faster and more reliable than scraping.|
|web_data_tiktok_shop|Quickly read structured TikTok Shop product data. Requires a valid TikTok Shop product URL. Often faster and more reliable than scraping.|
|web_data_tiktok_comments|Quickly read structured TikTok comments data. Requires a valid TikTok video URL. Often faster and more reliable than scraping.|
|web_data_google_maps_reviews|Quickly read structured Google Maps reviews data. Requires a valid Google Maps URL and optional days_limit (default 3). Often faster and more reliable than scraping.|
|web_data_google_shopping|Quickly read structured Google Shopping product data. Requires a valid Google Shopping product URL. Often faster and more reliable than scraping.|
|web_data_google_play_store|Quickly read structured Google Play Store app data. Requires a valid Play Store app URL. Often faster and more reliable than scraping.|
|web_data_apple_app_store|Quickly read structured Apple App Store app data. Requires a valid App Store app URL. Often faster and more reliable than scraping.|
|web_data_reuter_news|Quickly read structured Reuters news data. Requires a valid Reuters news article URL. Often faster and more reliable than scraping.|
|web_data_github_repository_file|Quickly read structured GitHub repository file data. Requires a valid GitHub file URL. Often faster and more reliable than scraping.|
|web_data_yahoo_finance_business|Quickly read structured Yahoo Finance company profile data. Requires a valid Yahoo Finance business URL. Often faster and more reliable than scraping.|
|web_data_x_posts|Quickly read structured X (Twitter) post data. Requires a valid X post URL. Often faster and more reliable than scraping.|
|web_data_zillow_properties_listing|Quickly read structured Zillow property listing data. Requires a valid Zillow listing URL. Often faster and more reliable than scraping.|
|web_data_booking_hotel_listings|Quickly read structured Booking.com hotel listing data. Requires a valid Booking.com listing URL. Often faster and more reliable than scraping.|
|web_data_youtube_profiles|Quickly read structured YouTube channel profile data. Requires a valid YouTube channel URL. Often faster and more reliable than scraping.|
|web_data_youtube_comments|Quickly read structured YouTube comments data. Requires a valid YouTube video URL and optional num_of_comments (default 10). Often faster and more reliable than scraping.|
|web_data_reddit_posts|Quickly read structured Reddit post data. Requires a valid Reddit post URL. Often faster and more reliable than scraping.|
|web_data_youtube_videos|Quickly read structured YouTube video metadata. Requires a valid YouTube video URL. Often faster and more reliable than scraping.|
|scraping_browser_navigate|Open or reuse a scraping-browser session and navigate to the provided URL, resetting tracked network requests.|
|scraping_browser_go_back|Navigate the active scraping-browser session back to the previous page and report the new URL and title.|
|scraping_browser_go_forward|Navigate the active scraping-browser session forward to the next page and report the new URL and title.|
|scraping_browser_snapshot|Capture an ARIA snapshot of the current page listing interactive elements and their refs for later ref-based actions.|
|scraping_browser_click_ref|Click an element using its ref from the latest ARIA snapshot; requires a ref and human-readable element description.|
|scraping_browser_type_ref|Fill an element identified by ref from the ARIA snapshot, optionally pressing Enter to submit after typing.|
|scraping_browser_screenshot|Capture a screenshot of the current page; supports optional full_page mode for full-length images.|
|scraping_browser_network_requests|List the network requests recorded since page load with HTTP method, URL, and response status for debugging.|
|scraping_browser_wait_for_ref|Wait until an element identified by ARIA ref becomes visible, with an optional timeout in milliseconds.|
|scraping_browser_get_text|Return the text content of the current page's body element.|
|scraping_browser_get_html|Return the HTML content of the current page; avoid the full_page option unless head or script tags are required.|
|scraping_browser_scroll|Scroll to the bottom of the current page in the scraping-browser session.|
|scraping_browser_scroll_to_ref|Scroll the page until the element referenced in the ARIA snapshot is in view.|
