'use strict'; /*jslint node:true es9:true*/
import axios from 'axios';

const CATALOG_URL = 'https://docs.brightdata.com/scrapers.json';
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

export function create_scraper_catalog(opt = {}){
    const url = opt.url||CATALOG_URL;
    const ttl_ms = opt.ttl_ms||DAY_MS;
    const now = opt.now||Date.now;
    let scrapers = null, loaded_at = 0;
    const load_catalog = async({force} = {})=>{
        if (scrapers && !force && now()-loaded_at<ttl_ms)
            return scrapers;
        try {
            const res = await axios.get(url, {timeout: 30000});
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
    return {load_catalog, search};
}
