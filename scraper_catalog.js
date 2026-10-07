'use strict'; /*jslint node:true es9:true*/
import axios from 'axios';

const DOCS_URL = 'https://docs.brightdata.com';
const API_URL = 'https://api.brightdata.com';
const DAY_MS = 24*60*60*1000;

const to_entry = s=>({
    dataset_id: s.dataset_id,
    name: String(s.name||'').trim(),
    domain: s.domain||'',
    collection_methods: s.collection_methods||[],
});

const score = (entry, words)=>{
    const text = `${entry.name} ${entry.domain} ${entry.dataset_id}`
        .toLowerCase();
    return words.filter(w=>text.includes(w)).length;
};

const to_method = (m, source)=>({
    input_fields: (m.input_schema||[]).map(f=>({name: f.name, type: f.type,
        required: !!f.required, description: f.description})),
    output_fields: (m.output_fields||[]).map(f=>({name: f.name,
        description: f.description})),
    sample_input: source=='api' && m.sample_input?.length
        ? m.sample_input : null,
});

const notes_for = (d, source)=>{
    const notes = [];
    if (!d.sample_input)
    {
        notes.push(source=='api' ? 'No example input for this method.'
            : 'Example input unavailable: details API failed.');
    }
    if (!d.input_fields.length)
        notes.push('This method has no documented input fields.');
    else if (!d.input_fields.some(f=>f.required))
        notes.push('This method has no required input fields.');
    return notes;
};

export function create_scraper_catalog(opt = {}){
    const docs_url = opt.docs_url||DOCS_URL;
    const api_url = opt.api_url||API_URL;
    const ttl_ms = opt.ttl_ms||DAY_MS;
    const now = opt.now||Date.now;
    let scrapers = null, loaded_at = 0;
    const load_catalog = async({force} = {})=>{
        if (scrapers && !force && now()-loaded_at<ttl_ms)
            return scrapers;
        try {
            const res = await axios.get(`${docs_url}/scrapers.json`,
                {timeout: 30000});
            if (!Array.isArray(res.data?.scrapers))
                throw new Error('scrapers.json has no scrapers list');
            scrapers = res.data.scrapers.map(to_entry);
            loaded_at = now();
        } catch(e){
            if (!scrapers)
                throw e;
            console.error(`[scraper_catalog] refresh failed, serving `
                +`catalog from ${new Date(loaded_at).toISOString()}: `
                +e.message);
        }
        return scrapers;
    };
    const search = async(query, limit = 10)=>{
        const words = String(query).toLowerCase().split(/\s+/)
            .filter(Boolean);
        const list = await load_catalog();
        return list.map(entry=>({entry, n: score(entry, words)}))
            .filter(r=>r.n>0)
            .sort((a, b)=>b.n-a.n || a.entry.name.localeCompare(b.entry.name))
            .slice(0, limit)
            .map(r=>r.entry);
    };
    const details_cache = new Map();
    const fetch_methods = async(id, headers)=>{
        const hit = details_cache.get(id);
        if (hit && now()-hit.at<ttl_ms)
            return hit;
        try {
            const res = await axios.get(`${api_url}/datasets/v3/scrapers`,
                {params: {dataset_id: id}, headers, timeout: 30000});
            const ds = [].concat(res.data||[]).find(d=>d.id==id);
            if (!ds?.scrapers)
                throw new Error('scraper not returned by API');
            const d = {source: 'api', methods: ds.scrapers,
                description: ds.description||null, at: now()};
            details_cache.set(id, d);
            return d;
        } catch(e){
            console.error(`[scraper_catalog] details API failed for ${id}, `
                +`using docs: ${e.message}`);
        }
        const res = await axios.get(`${docs_url}/scrapers/${id}.json`,
            {timeout: 30000});
        return {source: 'docs', methods: res.data?.collection_methods||{},
            description: null};
    };
    const get_details = async(id, method, headers)=>{
        const entry = (await load_catalog()).find(s=>s.dataset_id==id);
        if (!entry)
            throw new Error(`Unknown dataset_id ${id}, use search_scrapers`);
        const {source, methods, description} = await fetch_methods(id,
            headers);
        if (!methods[method])
        {
            throw new Error(`${entry.name} has no method ${method}, `
                +`available: ${Object.keys(methods).join(', ')}`);
        }
        const d = to_method(methods[method], source);
        return {dataset_id: id, name: entry.name, domain: entry.domain,
            description, method, source, ...d, notes: notes_for(d, source)};
    };
    return {load_catalog, search, get_details};
}
