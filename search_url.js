'use strict'; /*jslint node:true es9:true*/

// Builds the SERP URL fetched through Bright Data's /request endpoint.
// geo_location is applied per engine the same way Bright Data's own CLI does
// (github.com/brightdata/cli, src/commands/search.ts): gl= for Google, cc=
// for Bing. Yandex has no country-code parameter (its lr= takes numeric
// Yandex region ids), so geo_location with yandex is rejected loudly rather
// than silently ignored -- silently returning non-geo-targeted results that
// look normal was the bug.
export function search_url(engine, query, cursor, geo_location){
    let q = encodeURIComponent(query);
    let page = cursor ? parseInt(cursor) : 0;
    let start = page * 10;
    if (engine=='yandex')
    {
        if (geo_location)
            throw new Error('geo_location is not supported for engine '
                +'"yandex" (Yandex uses numeric region ids, not country '
                +'codes). Omit geo_location, or use google/bing.');
        return `https://yandex.com/search/?text=${q}&p=${page}`;
    }
    if (engine=='bing')
    {
        const cc = geo_location ? `&cc=${geo_location}` : '';
        return `https://www.bing.com/search?q=${q}&first=${start + 1}${cc}`;
    }
    let gl = geo_location ? `&gl=${geo_location}` : '';
    return `https://www.google.com/search?q=${q}&start=${start}${gl}`;
}
