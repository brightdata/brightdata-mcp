'use strict'; /*jslint node:true es9:true*/
import axios from 'axios';

const stub_url = process.env.__BRD_TEST_STUB_URL;

axios.interceptors.request.use(config=>{
    if (stub_url && typeof config.url=='string')
        config.url = config.url.replace(
            'https://api.brightdata.com',
            stub_url
        );
    return config;
});
