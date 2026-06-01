'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {DATASET_IDS, dataset_id_schema, metadata_to_fields, FILTER_OPERATORS}
    from '../search_dataset_schema.js';
import {filter_schema} from '../search_dataset_schema.js';

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
    assert.deepEqual(FILTER_OPERATORS, [
        '=', '!=', '<', '<=', '>', '>=',
        'in', 'not_in',
        'includes', 'not_includes',
        'array_includes', 'not_array_includes',
        'is_null', 'is_not_null',
    ]);
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

test('metadata_to_fields skips non-object field entries', ()=>{
    assert.deepEqual(metadata_to_fields({fields: {bad: null,
        ok: {type: 'text', description: 'fine'}}}),
        [{name: 'ok', type: 'text', description: 'fine'}]);
});

test('filter_schema accepts the documented flat example', ()=>{
    const filter = {operator: 'and', filters: [
        {name: 'name', value: 'Egor', operator: 'includes'},
    ]};
    assert.deepEqual(filter_schema.parse(filter), filter);
});

test('filter_schema accepts a single leaf node', ()=>{
    const filter = {name: 'cb_rank', value: 100, operator: '<'};
    assert.deepEqual(filter_schema.parse(filter), filter);
});

test('filter_schema accepts array and boolean leaf values', ()=>{
    const filter = {operator: 'or', filters: [
        {name: 'tags', value: ['a', 'b'], operator: 'array_includes'},
        {name: 'verified', value: true, operator: '='},
    ]};
    assert.deepEqual(filter_schema.parse(filter), filter);
});

test('filter_schema accepts nesting up to depth 3', ()=>{
    const filter = {operator: 'and', filters: [
        {operator: 'or', filters: [
            {operator: 'and', filters: [
                {name: 'name', value: 'x', operator: 'includes'},
            ]},
        ]},
    ]};
    assert.deepEqual(filter_schema.parse(filter), filter);
});

test('filter_schema rejects nesting deeper than 3', ()=>{
    const filter = {operator: 'and', filters: [
        {operator: 'or', filters: [
            {operator: 'and', filters: [
                {operator: 'or', filters: [
                    {name: 'name', value: 'x', operator: 'includes'},
                ]},
            ]},
        ]},
    ]};
    assert.throws(()=>filter_schema.parse(filter));
});

test('filter_schema rejects an empty object', ()=>{
    assert.throws(()=>filter_schema.parse({}));
});
