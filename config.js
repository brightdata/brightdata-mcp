'use strict'; /*jslint node:true es9:true*/

export function get_brightdata_api_url(env=process.env){
    const default_url = 'https://api.brightdata.com';
    if (env.NODE_ENV != 'test')
        return default_url;
    if (!env.BRIGHTDATA_API_URL)
        return default_url;
    const url = new URL(env.BRIGHTDATA_API_URL);
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    if (!['127.0.0.1', 'localhost', '::1'].includes(hostname))
        throw new Error('BRIGHTDATA_API_URL must point to loopback');
    if (!['http:', 'https:'].includes(url.protocol))
        throw new Error('BRIGHTDATA_API_URL must use HTTP or HTTPS');
    return url.origin;
}
