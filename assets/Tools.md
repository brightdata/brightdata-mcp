|Feature|Description|
|---|---|
|search_engine|Scrape search results from Google, Bing, or Yandex. Returns SERP results in JSON for Google and Markdown for Bing/Yandex; supports pagination with the cursor parameter.|
|scrape_as_markdown|Scrape a single webpage with advanced extraction and return Markdown. Uses Bright Data's unlocker to handle bot protection and CAPTCHA.|
|search_engine_batch|Run up to 10 search queries in parallel. Returns JSON for Google results and Markdown for Bing/Yandex.|
|scrape_batch|Scrape up to 10 webpages in one request and return an array of URL/content pairs in Markdown format.|
|scrape_as_html|Scrape a single webpage with advanced extraction and return the HTML response body. Handles sites protected by bot detection or CAPTCHA.|
|extract|Scrape a webpage as Markdown and convert it to structured JSON using AI sampling, with an optional custom extraction prompt.|
|ask_brightdata_assistant|Ask Bright Data's support assistant (Sophie) about Bright Data products, APIs, MCP usage, zones, scraping, or account setup. Supports threaded follow-ups via dialog_id.|
|session_stats|Report how many times each tool has been called during the current MCP session.|
|search_scrapers|Find a pre-built Web Scraper API scraper (1,200+ sites) by site or data type. Returns dataset ID, name, domain and collection methods.|
|get_scraper_details|Show a scraper's description, input fields, example input and main output fields for one collection method.|
|run_scraper|Run a scraper method on a list of inputs. Waits up to 45 seconds; if still running, returns a snapshot ID to check later. Billed per record.|
|get_scraper_progress|Status of a scraper run: starting, running, ready, failed or canceled.|
|get_scraper_results|Records of a finished scraper run.|
|refresh_scrapers|Reload the scraper list now instead of waiting for the daily refresh.|
|chatgpt_ai_insights|Send a prompt to ChatGPT and get its answer back as Markdown. Useful for GEO and LLM-as-a-judge.|
|perplexity_ai_insights|Send a prompt to Perplexity and get its answer back as Markdown. Useful for GEO and LLM-as-a-judge.|
|list_dataset_fields|List the filterable fields (name, type, description) of a searchable LinkedIn dataset. Call before search_dataset.|
|search_dataset|Search a stored dataset by a filter and get up to 10 matching records directly, with a cursor for more.|
|scraping_browser_navigate|Open or reuse a scraping-browser session and navigate to the provided URL, resetting tracked network requests.|
|scraping_browser_go_back|Navigate the active scraping-browser session back to the previous page and report the new URL and title.|
|scraping_browser_go_forward|Navigate the active scraping-browser session forward to the next page and report the new URL and title.|
|scraping_browser_snapshot|Capture an ARIA snapshot of the current page listing interactive elements and their refs for later ref-based actions.|
|scraping_browser_click_ref|Click an element using its ref from the latest ARIA snapshot; requires a ref and human-readable element description.|
|scraping_browser_type_ref|Fill an element identified by ref from the ARIA snapshot, optionally pressing Enter to submit after typing.|
|scraping_browser_fill_form|Fill several form fields identified by ARIA refs in one call.|
|scraping_browser_screenshot|Capture a screenshot of the current page; supports optional full_page mode for full-length images.|
|scraping_browser_network_requests|List the network requests recorded since page load with HTTP method, URL, and response status for debugging.|
|scraping_browser_wait_for_ref|Wait until an element identified by ARIA ref becomes visible, with an optional timeout in milliseconds.|
|scraping_browser_get_text|Return the text content of the current page's body element.|
|scraping_browser_get_html|Return the HTML content of the current page; avoid the full_page option unless head or script tags are required.|
|scraping_browser_scroll|Scroll to the bottom of the current page in the scraping-browser session.|
|scraping_browser_scroll_to_ref|Scroll the page until the element referenced in the ARIA snapshot is in view.|
