'use strict'; /*jslint node:true es9:true*/
// What the model should know before it calls anything.
//
// This is standing context: a client may put it in front of the model in every
// session, so it carries only what NO single tool description can — the
// escalation ladder between tools, and what to do when a collection job
// outlives the client's request timeout.
//
// Per-tool reasons stay in per-tool descriptions. Each web_data_* description
// already explains that it can be a cache lookup and more reliable than
// scraping; that is the specific, honest version of a claim a global rule
// about 74 heterogeneous tools could only approximate, and it is where a
// maintainer will look when one tool's trade-off changes.
//
// Ordering matters as much as content: the most important details belong in
// the first 512 characters, so clauses carry a priority and are emitted
// high-first.
//
// Every clause is gated on what the session actually registers. A rule naming
// a tool the model cannot see is worse than no rule, because the model looks
// for something that is not there.

export const PRIORITY_WINDOW = 512;

export function capabilities_from(names = []){
    const has = prefix=>names.some(name=>name.startsWith(prefix));
    const includes = name=>names.includes(name);
    return {
        has_search: includes('search_engine'),
        has_scrape: includes('scrape_as_markdown'),
        has_datasets: has('web_data_'),
        has_browser: has('scraping_browser_'),
        has_marketplace: includes('query_dataset'),
        // Anything that starts a billed collection job.
        //
        // `discover` is deliberately not counted. Its API was retired --
        // POST /discover answers 410 "Discover API is no longer available"
        // for every query (verified 2026-09-10) -- so it starts nothing, and
        // guidance must not shape itself around a tool that cannot work. The
        // server still registers it; removing it is PR #164's job.
        has_jobs: has('web_data_') || includes('query_dataset'),
    };
}

export const CLAUSES = [
    {
        id: 'ladder',
        priority: 'high',
        // Only worth saying when there is more than one way to get a page.
        when: c=>[c.has_datasets, c.has_browser, c.has_scrape].filter(Boolean)
            .length>1 || (c.has_scrape && c.has_search),
        text: c=>{
            if (c.has_datasets || c.has_browser)
            {
                const tiers = [];
                if (c.has_datasets)
                {
                    tiers.push('a web_data_* tool when one matches the URL');
                }
                if (c.has_scrape)
                {
                    tiers.push(`${tiers.length ? 'else ' : 'use '}`
                        +'scrape_as_markdown');
                }
                if (c.has_browser)
                {
                    tiers.push('and scraping_browser_* only when the page '
                        +'needs JavaScript or interaction');
                }
                return 'Escalate only as far as the page needs: '
                    +tiers.join(', ')+'.';
            }
            // No dataset family and no browser: the ordering that remains is
            // between finding a page and reading one.
            return 'Reach for the simplest tool that answers: use '
                +'search_engine to find pages and scrape_as_markdown to '
                +'read them.';
        },
    },
    {
        id: 'job_timing',
        priority: 'high',
        when: c=>c.has_jobs,
        // Measured 2026-09-10 against the deployed server: web_data_* tools
        // answered in 4-16s across five calls, while a request for a delisted
        // product took 55s before coming back empty. So slowness signals a bad
        // target rather than a busy server, which is the opposite of what an
        // earlier draft assumed -- that draft quoted 30-120s, a figure
        // measured on the marketplace /datasets/filter flow, which no
        // web_data_* tool uses.
        text: c=>'These start billed collection jobs. Most answer in '
            +'seconds; one that is unusually slow is more often a bad target '
            +'than a busy server, so report it rather than retrying -- each '
            +'retry costs another job.'
            +(c.has_marketplace
                ? ' Marketplace queries take a minute or more: redeem '
                    +'query_dataset\'s snapshot id with collect_dataset.'
                : ''),
    },
    {
        id: 'usage_limit',
        priority: 'normal',
        when: ()=>true,
        text: ()=>'If a tool reports the free-tier request limit, follow the '
            +'instructions in that message rather than retrying.',
    },
];

const PRIORITIES = ['high', 'normal'];

// Returns {text, ids, rendered}: the string a client receives, the clause ids
// it contains in order, and each clause's rendered text so a test can assert
// where it landed without matching prose.
export function build_instructions(capabilities = {}){
    const applicable = CLAUSES.filter(clause=>clause.when(capabilities));
    const ordered = PRIORITIES.flatMap(priority=>
        applicable.filter(clause=>clause.priority===priority));
    const rendered = {};
    for (const clause of ordered)
        rendered[clause.id] = clause.text(capabilities);
    return {
        text: ordered.map(clause=>rendered[clause.id]).join(' '),
        ids: ordered.map(clause=>clause.id),
        rendered,
    };
}
