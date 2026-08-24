'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {parse_bool_env, find_unknown_groups, find_unknown_tools}
    from '../tool_config.js';
import {get_all_group_ids, get_total_tool_count} from '../tool_groups.js';

test('parse_bool_env accepts true/false in any case', ()=>{
    for (const v of ['true', 'TRUE', 'True', ' true '])
        assert.deepEqual(parse_bool_env(v), {value: true, recognized: true}, v);
    for (const v of ['false', 'FALSE', 'False'])
        assert.deepEqual(parse_bool_env(v), {value: false, recognized: true}, v);
});

test('parse_bool_env treats unset/empty as recognized false', ()=>{
    assert.deepEqual(parse_bool_env(undefined), {value: false, recognized: true});
    assert.deepEqual(parse_bool_env(null), {value: false, recognized: true});
    assert.deepEqual(parse_bool_env(''), {value: false, recognized: true});
    assert.deepEqual(parse_bool_env('   '), {value: false, recognized: true});
});

test('parse_bool_env flags other values instead of guessing', ()=>{
    // Deliberately NOT truthy: accepting 1/yes/on would silently flip deployed
    // configs that carry those values today. They stay false and warn.
    for (const v of ['1', 'yes', 'on', 'enabled', 'foo'])
        assert.deepEqual(parse_bool_env(v),
            {value: false, recognized: false}, v);
});

test('find_unknown_groups names only the ids that match no group', ()=>{
    const valid = ['ecommerce', 'social', 'custom'];
    assert.deepEqual(find_unknown_groups(['ecommerce', 'ecomerce'], valid),
        ['ecomerce']);
    assert.deepEqual(find_unknown_groups(['ecommerce', 'custom'], valid), []);
    assert.deepEqual(find_unknown_groups([], valid), []);
});

test('find_unknown_tools flags misses with a case-insensitive suggestion', ()=>{
    const known = new Set(['search_engine', 'session_stats']);
    assert.deepEqual(
        find_unknown_tools(['search_engine', 'Search_Engine', 'bogus'], known),
        [
            {name: 'Search_Engine', suggestion: 'search_engine'},
            {name: 'bogus', suggestion: null},
        ]);
    assert.deepEqual(find_unknown_tools(['session_stats'], known), []);
});

test('the previously-dead tool_groups helpers behave as designed', ()=>{
    const ids = get_all_group_ids();
    assert.ok(ids.length>0, 'has user-facing group ids');
    assert.ok(!ids.includes('custom'), 'custom is internal, not suggested');
    assert.ok(get_total_tool_count()>0, 'counts distinct tools across groups');
});
