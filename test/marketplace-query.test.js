'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {start_query, collect_query, default_trim, estimate_seconds}
    from '../marketplace_query.js';

const no_sleep = ()=>Promise.resolve();
const REC = {name: 'Acme', website: 'acme.com', employees: 100};

// --- dispatch: searchable ids answer in one call, others hand back a handle
test('start_query runs the sync path for searchable datasets', async()=>{
    let created = 0;
    const out = await start_query({
        dataset_id: 'gd_linkedin', filter: {}, records_limit: 10,
        is_searchable: id=>id==='gd_linkedin',
        sync_search: async()=>[REC],
        create: async()=>{ created++; return 'snap_x'; },
    });
    assert.equal(created, 0, 'no collection job for a searchable dataset');
    assert.equal(out.status, 'complete');
    assert.deepEqual(out.records, [REC]);
    assert.equal(out.records_returned, 1);
    assert.equal(out.may_have_more, false);
});

test('start_query returns a pending handle for marketplace datasets', async()=>{
    const out = await start_query({
        dataset_id: 'gd_crunchbase', filter: {}, records_limit: 10,
        is_searchable: ()=>false,
        sync_search: async()=>{ throw new Error('must not run'); },
        create: async()=>'snap_abc',
    });
    assert.equal(out.status, 'pending');
    assert.equal(out.snapshot_id, 'snap_abc');
    assert.equal(out.estimated_seconds, estimate_seconds(10));
    assert.match(out.hint, /collect_dataset/);
});

test('start_query throws when no snapshot_id comes back', async()=>{
    await assert.rejects(start_query({
        dataset_id: 'gd_x', filter: {}, records_limit: 5,
        is_searchable: ()=>false, create: async()=>undefined,
    }), /No snapshot_id/);
});

test('start_query calls create with exactly the API body keys', async()=>{
    let seen = null;
    await start_query({
        dataset_id: 'gd_x', filter: {name: 'a', operator: 'is_not_null'},
        records_limit: 7, is_searchable: ()=>false,
        create: async args=>{ seen = args; return 'snap_1'; },
    });
    assert.deepEqual(Object.keys(seen).sort(),
        ['dataset_id', 'filter', 'records_limit'],
        'the filter API rejects any other body key');
});

// --- collect: ready / still-running / failed
test('collect_query returns records once the job is ready', async()=>{
    let polls = 0;
    const out = await collect_query({
        snapshot_id: 'snap_1', records_limit: 2, sleep: no_sleep,
        poll: async()=>(++polls<2 ? {status: 'running'} : {status: 'ready'}),
        download: async()=>[REC, REC],
    });
    assert.equal(out.status, 'complete');
    assert.equal(out.records_returned, 2);
    assert.equal(out.may_have_more, true, 'hit the cap -> may have more');
    assert.equal(out.snapshot_id, 'snap_1');
});

test('collect_query reports pending (not an error) while still running',
    async()=>{
    const out = await collect_query({
        snapshot_id: 'snap_2', wait_seconds: 6, sleep: no_sleep,
        poll: async()=>({status: 'running'}),
        download: async()=>{ throw new Error('must not download'); },
    });
    assert.equal(out.status, 'pending');
    assert.equal(out.snapshot_id, 'snap_2');
    assert.match(out.hint, /call collect_dataset again/i);
});

test('collect_query throws on a failed job, never an empty result', async()=>{
    await assert.rejects(collect_query({
        snapshot_id: 'snap_3', sleep: no_sleep,
        poll: async()=>({status: 'failed', error: 'boom'}),
        download: async()=>[],
    }), /failed: boom/);
});

// --- client-side trimming (the API has no projection)
test('default_trim keeps only requested fields', ()=>{
    assert.deepEqual(default_trim([REC], ['name', 'employees']),
        [{name: 'Acme', employees: 100}]);
    assert.deepEqual(default_trim([REC], undefined), [REC], 'no fields -> untouched');
});

test('default_trim tolerates partially unknown fields', ()=>{
    assert.deepEqual(default_trim([REC], ['name', 'nope']), [{name: 'Acme'}]);
});

test('default_trim throws when no requested field exists', ()=>{
    assert.throws(()=>default_trim([REC], ['nope', 'also_nope']),
        /None of the requested fields exist/);
});

test('estimate_seconds follows the measured curve', ()=>{
    // measured live: ~76s at limit 2, ~119s at limit 25
    assert.ok(Math.abs(estimate_seconds(2)-76)<=5, 'limit 2 ~= 76s');
    assert.ok(Math.abs(estimate_seconds(25)-119)<=5, 'limit 25 ~= 119s');
});
