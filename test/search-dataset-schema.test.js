'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {DATASET_IDS, dataset_id_schema, metadata_to_fields, FILTER_OPERATORS}
    from '../search_dataset_schema.js';

test('DATASET_IDS lists the three supported datasets', ()=>{
    assert.deepEqual(DATASET_IDS, [
        'gd_l1viktl72bvl7bjuj0',
        'gd_me5ppxjr2ge6icjuh0',
        'gd_l1vikfnt1wgvvqz95w',
    ]);
});

test('dataset_id_schema accepts a supported id', ()=>{
    assert.equal(dataset_id_schema.parse('gd_l1viktl72bvl7bjuj0'),
        'gd_l1viktl72bvl7bjuj0');
});

test('dataset_id_schema rejects an unknown id', ()=>{
    assert.throws(()=>dataset_id_schema.parse('gd_not_a_real_dataset'));
});

test('FILTER_OPERATORS lists the documented operators', ()=>{
    assert.ok(FILTER_OPERATORS.includes('includes'));
    assert.ok(FILTER_OPERATORS.includes('is_null'));
    assert.ok(FILTER_OPERATORS.includes('not_array_includes'));
});

test('metadata_to_fields keeps active fields as name/type/description', ()=>{
    const metadata = {
        id: 'gd_l1vijqt9jfj7olije',
        fields: {
            name: {type: 'text', active: true,
                description: 'The name of the company'},
            url: {type: 'url', required: true,
                description: 'The company URL'},
            cb_rank: {type: 'number', active: false,
                description: 'Crunchbase rank'},
        },
    };
    assert.deepEqual(metadata_to_fields(metadata), [
        {name: 'name', type: 'text', description: 'The name of the company'},
        {name: 'url', type: 'url', description: 'The company URL'},
    ]);
});

test('metadata_to_fields tolerates missing fields object', ()=>{
    assert.deepEqual(metadata_to_fields({id: 'x'}), []);
    assert.deepEqual(metadata_to_fields(null), []);
});
