'use strict'; /*jslint node:true es9:true*/
import axios from 'axios';

const API_URL = 'https://api.brightdata.com';
const PENDING = ['starting', 'running', 'building'];
const DISCOVER = 'discover_by_';
const enc = encodeURIComponent;

const api_error = (step, e)=>{
    const body = e.response?.data;
    const msg = typeof body=='string' ? body : JSON.stringify(body??'');
    const err = new Error(`${step} failed`
        +(e.response ? ` (HTTP ${e.response.status}): ${msg.slice(0, 500)}`
        : `: ${e.message}`));
    err.step = step;
    return err;
};

const call = async(step, req)=>{
    try {
        return await axios({timeout: 30000, ...req});
    } catch(e){
        throw api_error(step, e);
    }
};

const strip_nulls = data=>JSON.parse(JSON.stringify(data,
    (_k, v)=>v==null ? undefined : v));

export function create_scraper_run(opt = {}){
    const api_url = opt.api_url||API_URL;
    const poll_ms = opt.poll_ms||2000;
    const trigger = async({dataset_id, method, input, limit_per_input = 10,
        headers})=>
    {
        const discover = method.startsWith(DISCOVER) && {type: 'discover_new',
            discover_by: method.slice(DISCOVER.length), limit_per_input};
        const res = await call('trigger', {method: 'POST',
            url: `${api_url}/datasets/v3/trigger`, headers,
            params: {dataset_id, include_errors: true, ...discover},
            data: [].concat(input)});
        if (!res.data?.snapshot_id)
            throw api_error('trigger', new Error('no snapshot_id returned'));
        return res.data.snapshot_id;
    };
    const progress = async(snapshot_id, headers)=>{
        const res = await call('progress', {headers,
            url: `${api_url}/datasets/v3/progress/${enc(snapshot_id)}`});
        return res.data;
    };
    const results = async(snapshot_id, headers)=>{
        const res = await call('results', {headers, params: {format: 'json'},
            url: `${api_url}/datasets/v3/snapshot/${enc(snapshot_id)}`});
        if (res.status==202 || PENDING.includes(res.data?.status))
            return {snapshot_id, status: 'running'};
        return {snapshot_id, status: 'ready', data: strip_nulls(res.data)};
    };
    const run = async({wait_ms = 60000, headers, ...req})=>{
        const snapshot_id = await trigger({...req, headers});
        const deadline = Date.now()+wait_ms;
        for (;;)
        {
            const res = await results(snapshot_id, headers);
            if (res.status=='ready' || Date.now()+poll_ms>deadline)
                return res;
            await new Promise(done=>setTimeout(done, poll_ms));
        }
    };
    return {trigger, progress, results, run};
}
