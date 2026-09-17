'use strict'; /*jslint node:true es9:true*/

// Model-facing descriptions for the generated web_data_* tool inputs, keyed
// by input name (12 names cover all 50 datasets). Values travel to the
// trigger endpoint as STRINGS (the dataset table's own defaults are "3",
// "10", ""), so numeric inputs say "as a numeric string" and the
// empty-string defaults explain that empty means "no filter". A name missing
// from this map ships undescribed (the old behaviour) and is caught by the
// consistency check in test/dataset-inputs.test.js, not at runtime.
export const DATASET_INPUT_DESCRIPTIONS = {
    url: 'URL of the target page for this dataset (see the tool '
        +'description for the expected site and page type).',
    prompt: 'The prompt/question to submit. The tool returns the AI '
        +'answer as markdown.',
    package_name: 'The package name exactly as published on the registry '
        +'(e.g., "react" for npm, "langchain-brightdata" for PyPI).',
    keyword: 'Search keyword(s) to find products, as plain text '
        +'(e.g., "wireless earbuds").',
    first_name: 'First name of the person to search for.',
    last_name: 'Last name of the person to search for.',
    num_of_reviews: 'How many reviews to collect, as a numeric string '
        +'(e.g., "50").',
    days_limit: 'Only collect reviews from the last N days, as a numeric '
        +'string (e.g., "3").',
    start_date: 'Start of the date range (e.g., "2025-01-31"); empty '
        +'string (the default) applies no start-date filter.',
    end_date: 'End of the date range (e.g., "2025-01-31"); empty string '
        +'(the default) applies no end-date filter.',
    num_of_comments: 'How many comments to collect, as a numeric string '
        +'(e.g., "10").',
    days_back: 'Collect posts from the last N days, as a numeric string; '
        +'empty string (the default) applies no time filter.',
};
