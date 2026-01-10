# ACA Health Insurance Lead Scraping Guide

This guide explains how to use the Bright Data MCP tools to find people looking for health insurance (ACA/Obamacare) across the internet and social media platforms.

## Prerequisites

1. **Bright Data API Token**: Get your token from [brightdata.com/cp/setting/users](https://brightdata.com/cp/setting/users)
2. **Pro Mode (recommended)**: Enable for full social media scraping capabilities

## Available Tools

### 1. `aca_search_leads`
Search Google for people actively looking for ACA health insurance.

**Parameters:**
- `category`: Type of leads to find
  - `direct_intent`: People directly searching for enrollment
  - `pain_points`: People with insurance problems
  - `life_events`: People with qualifying life events
  - `cost_focused`: Price-sensitive searchers
  - `all`: All categories
- `state`: Focus on specific US state (e.g., "California")
- `year`: Year for enrollment searches
- `max_queries`: Number of queries to run (1-10)

**Example:**
```
Tool: aca_search_leads
Parameters: {
  "category": "pain_points",
  "state": "Texas",
  "max_queries": 5
}
```

### 2. `aca_social_media_search`
Search social media for ACA health insurance discussions.

**Supported Platforms:**
- Reddit
- Twitter/X
- Facebook
- TikTok
- YouTube
- Instagram
- LinkedIn

**Parameters:**
- `platforms`: Array of platforms to search (or `["all"]`)
- `custom_keyword`: Additional search term

**Example:**
```
Tool: aca_social_media_search
Parameters: {
  "platforms": ["reddit", "twitter"],
  "custom_keyword": "enrollment deadline"
}
```

### 3. `aca_scrape_discussion`
Scrape a specific webpage about ACA health insurance.

**Parameters:**
- `url`: URL of the discussion page

**Example:**
```
Tool: aca_scrape_discussion
Parameters: {
  "url": "https://reddit.com/r/HealthInsurance/comments/..."
}
```

### 4. `aca_batch_scrape`
Scrape multiple ACA-related pages at once (max 10).

**Parameters:**
- `urls`: Array of URLs to scrape

### 5. `aca_find_resources`
Find official ACA enrollment resources.

**Parameters:**
- `state`: US state for state-specific resources
- `resource_type`: `enrollment`, `calculator`, `plans`, `deadlines`, or `all`

## Standalone Script Usage

Run the comprehensive scraper script:

```bash
# Set your API token
export API_TOKEN=your_bright_data_token
export PRO_MODE=true

# Run the scraper
cd examples
node aca-health-insurance-scraper.js
```

Results are saved to `examples/output/aca-leads-{timestamp}.json`.

## Lead Categories Explained

### Direct Intent
People actively searching for health insurance:
- "need health insurance ACA open enrollment"
- "how to sign up for Obamacare marketplace"
- "ACA marketplace plans comparison"

### Pain Points
People with problems needing solutions:
- "lost job need health insurance"
- "can't afford health insurance options"
- "health insurance between jobs"
- "self employed health insurance ACA"

### Life Events (Qualifying Events)
People eligible for special enrollment:
- "just turned 26 need health insurance"
- "getting married health insurance options"
- "having a baby health insurance enrollment"
- "divorce health insurance coverage"

### Cost-Focused
Price-sensitive leads:
- "cheapest ACA plans"
- "health insurance under $200 month"
- "ACA subsidies income limits"

## Social Media Strategy

### Reddit
High-value subreddits:
- r/HealthInsurance
- r/personalfinance
- r/povertyfinance
- r/ACA
- r/selfemployed

### Twitter/X
Hashtags to monitor:
- #ACA
- #Obamacare
- #HealthInsurance
- #OpenEnrollment
- #GetCovered

### Facebook
Groups and pages about:
- ACA Health Insurance Support
- Health Insurance Marketplace Help
- Self-Employed Insurance Options

### YouTube/TikTok
Educational content consumers searching for:
- "How to enroll in ACA"
- "Health insurance explained"
- "Marketplace tutorial"

## Best Practices

1. **Timing**: Focus searches during Open Enrollment (Nov 1 - Jan 15)
2. **State Targeting**: Many states have their own marketplaces
3. **Life Events**: Target users with qualifying life events for special enrollment
4. **Ethical Use**: Use data responsibly and comply with platform ToS
5. **Rate Limiting**: Set `RATE_LIMIT` env to avoid API limits

## Configuration

```bash
# Required
export API_TOKEN=your_api_token

# Recommended for social media access
export PRO_MODE=true

# Optional: Rate limiting
export RATE_LIMIT=100/1h

# Optional: Custom zones
export WEB_UNLOCKER_ZONE=my_unlocker
export BROWSER_ZONE=my_browser
```

## Sample Output

```json
{
  "searchEngines": [
    {
      "type": "search_result",
      "title": "Affordable Health Insurance - ACA Marketplace",
      "url": "https://example.com/aca-plans",
      "description": "Find affordable ACA plans..."
    }
  ],
  "reddit": [
    {
      "type": "social_media_post",
      "platform": "reddit",
      "content": "Need help choosing a marketplace plan...",
      "engagement": { "comments": 45 }
    }
  ]
}
```

## Compliance Notes

- Respect rate limits and platform terms of service
- Use data ethically for legitimate insurance lead generation
- Ensure compliance with applicable regulations (CAN-SPAM, TCPA, etc.)
- Never engage in unauthorized data scraping or spam

## Support

For Bright Data MCP issues: https://github.com/anthropics/claude-code/issues
For Bright Data API: https://brightdata.com/support
