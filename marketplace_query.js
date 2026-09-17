'use strict'; /*jslint node:true es9:true*/

// Dataset Marketplace queries, split so no tool call blocks on a collection
// job. Measured on the live API: a job needs ~73s of fixed scheduling plus
// ~1.8s per record (76s for 2 records, 119s for 25), so start_query returns a
// snapshot handle and collect_query retrieves it. The three LinkedIn datasets
// that the synchronous /datasets/search endpoint accepts are dispatched to it
// instead and complete in one call.
//
// IO is injected so every exit path is unit-testable without minute-long
// round-trips.

const FIXED_JOB_SECONDS = 73;
const SECONDS_PER_RECORD = 1.8;

export function estimate_seconds(records_limit){
    return Math.round(FIXED_JOB_SECONDS + SECONDS_PER_RECORD*(records_limit||0));
}

// The marketplace API has no field projection (verified: fields/select/
// columns/include_fields/output_fields/custom_output_fields are all rejected
// with "not allowed"), so trimming happens here. Records still arrive whole --
// this protects the model's context, not bandwidth.
export function default_trim(records, fields){
    if (!fields || !fields.length)
        return records;
    const wanted = new Set(fields);
    const present = new Set();
    for (const rec of records)
        for (const key of Object.keys(rec||{}))
            if (wanted.has(key))
                present.add(key);
    if (!present.size)
    {
        throw new Error(`None of the requested fields exist in this dataset: `
            +`${fields.join(', ')}. Call list_dataset_fields to get valid `
            +`field names.`);
    }
    return records.map(rec=>{
        const out = {};
        for (const key of fields)
            if (present.has(key) && key in (rec||{}))
                out[key] = rec[key];
        return out;
    });
}

function complete_envelope({dataset_id, records, records_limit, snapshot_id}){
    return {
        status: 'complete',
        dataset_id,
        records,
        records_returned: records.length,
        records_limit,
        // There is no total-matching count to compare against (the snapshot
        // payload's dataset_size is the snapshot's own size), so this is a
        // heuristic named for exactly what it measures: the cap was reached.
        may_have_more: records.length >= records_limit,
        ...snapshot_id ? {snapshot_id} : {},
    };
}

// Runs the query. Searchable datasets return records immediately; every other
// dataset starts a job and returns a handle for collect_query.
export async function start_query({dataset_id, filter, records_limit, fields,
    is_searchable, sync_search, create, trim = default_trim}){
    if (is_searchable(dataset_id))
    {
        const records = await sync_search({dataset_id, filter, records_limit});
        return complete_envelope({dataset_id,
            records: trim(records, fields), records_limit});
    }
    const snapshot_id = await create({dataset_id, filter, records_limit});
    if (!snapshot_id)
        throw new Error('No snapshot_id returned from the dataset filter request');
    return {
        status: 'pending',
        dataset_id,
        snapshot_id,
        estimated_seconds: estimate_seconds(records_limit),
        hint: `Collection started. Call collect_dataset with snapshot_id `
            +`"${snapshot_id}" to get the records.`,
    };
}

// Waits up to wait_seconds for a started job, then reports back: records when
// ready, a pending envelope while it is still running (healthy -- the caller
// retries), and a throw if the job failed, because a failed job must never
// read as "no matches".
//
// wait_seconds must stay below the MCP client's default 60s request timeout
// (DEFAULT_REQUEST_TIMEOUT_MSEC): waiting longer inside a single call gets the
// request cancelled client-side rather than answered. This is also why the
// query is split in two -- a job takes 76-165s, which no single call survives.
export async function collect_query({snapshot_id, dataset_id, fields,
    wait_seconds = 25, records_limit, poll, download, trim = default_trim,
    sleep = ms=>new Promise(resolve=>setTimeout(resolve, ms)),
    poll_interval_ms = 3000}){
    const deadline = wait_seconds*1000;
    let waited = 0;
    for (;;)
    {
        const info = await poll(snapshot_id);
        const status = info?.status;
        if (status==='ready')
        {
            const records = await download(snapshot_id);
            const limit = records_limit ?? records.length;
            return complete_envelope({dataset_id: dataset_id ?? info?.dataset_id,
                records: trim(records, fields), records_limit: limit,
                snapshot_id});
        }
        if (status==='failed')
        {
            throw new Error(`Dataset collection ${snapshot_id} failed: `
                +`${info?.error || JSON.stringify(info||{}).slice(0, 300)}`);
        }
        if (waited>=deadline)
        {
            return {
                status: 'pending',
                dataset_id: dataset_id ?? info?.dataset_id,
                snapshot_id,
                hint: `Still running (status "${status ?? 'unknown'}"). Call `
                    +`collect_dataset again with the same snapshot_id.`,
            };
        }
        await sleep(poll_interval_ms);
        waited += poll_interval_ms;
    }
}
