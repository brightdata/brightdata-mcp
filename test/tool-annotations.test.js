'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';

// The module warns through logger.js, whose threshold is fixed at import from
// LOG_LEVEL. Clear it first, then import dynamically, so these assertions hold
// whatever level the developer or CI happens to export.
delete process.env.LOG_LEVEL;
const {annotate, ANNOTATION_CLASSES, REQUIRED_HINTS} =
    await import('../tool_annotations.js');

function capture(t){
    const lines = [];
    t.mock.method(console, 'error', (...args)=>{ lines.push(args.join(' ')); });
    return lines;
}

test('a known class produces exactly a title and the three hints', ()=>{
    const result = annotate('sync_fetch', 'Search Engine');
    assert.deepEqual(result, {
        title: 'Search Engine',
        readOnlyHint: true,
        openWorldHint: true,
        destructiveHint: false,
    });
    assert.equal(Object.keys(result).length, 4, 'no extra keys reach the wire');
});

test('every call returns a fresh object', ()=>{
    const first = annotate('closed_read', 'Session Stats');
    first.readOnlyHint = false;
    assert.equal(annotate('closed_read', 'Session Stats').readOnlyHint, true,
        'mutating one result must not affect the next');
});

test('the class table and its hint objects are frozen', ()=>{
    assert.ok(Object.isFrozen(ANNOTATION_CLASSES));
    for (const [name, definition] of Object.entries(ANNOTATION_CLASSES))
    {
        assert.ok(Object.isFrozen(definition), `${name} frozen`);
        assert.ok(Object.isFrozen(definition.hints), `${name}.hints frozen`);
    }
});

test('every class defines all three hints as booleans and explains itself',
    ()=>{
    for (const [name, definition] of Object.entries(ANNOTATION_CLASSES))
    {
        for (const hint of REQUIRED_HINTS)
        {
            assert.equal(typeof definition.hints[hint], 'boolean',
                `${name}.${hint}`);
        }
        assert.ok(definition.why?.length>10, `${name} has a reason`);
    }
});

test('an unknown class warns, marks the title, and stays conservative',
    async t=>{
    const lines = capture(t);
    const result = annotate('browser_acts', 'Browser Click Element');
    assert.deepEqual(result, {
        title: 'Browser Click Element [unclassified]',
        readOnlyHint: false,
        openWorldHint: true,
        destructiveHint: true,
    });
    assert.equal(lines.length, 1, 'exactly one warning');
    assert.match(lines[0], /^\[config\] tool "Browser Click Element" has /);
    assert.match(lines[0], /unknown annotation class "browser_acts"/);
    assert.match(lines[0], /valid: sync_fetch, job_start, closed_read/);
});

// The reason the fallback marks the title: its hints are indistinguishable
// from a real class, so a value-only check cannot catch a typo on those tools.
test('the conservative fallback is indistinguishable from browser_act by value',
    async t=>{
    capture(t);
    const fallback = annotate('nonexistent_class', 'X');
    const real = annotate('browser_act', 'X');
    for (const hint of REQUIRED_HINTS)
        assert.equal(fallback[hint], real[hint], hint);
    assert.notEqual(fallback.title, real.title,
        'only the title distinguishes them -- keep the [unclassified] mark');
});

test('a missing title warns and omits the key rather than inventing one',
    async t=>{
    const lines = capture(t);
    const result = annotate('sync_fetch', '   ');
    assert.deepEqual(result, {
        readOnlyHint: true,
        openWorldHint: true,
        destructiveHint: false,
    });
    assert.ok(!('title' in result), 'no placeholder title');
    assert.equal(lines.length, 1);
    assert.match(lines[0],
        /^\[config\] tool annotations without a title \(class "sync_fetch"\)/);
});

// Logs are configurable -- LOG_LEVEL=silent drops every line, and nobody
// reads a warning printed at a user's startup anyway. The tool list is not
// configurable, so carrying the mark in the returned value is what makes the
// mistake dependably visible.
test('the mistake is carried in the returned value, not only in the log',
    async t=>{
    const lines = capture(t);
    const result = annotate('typo_class', 'Browser Click Element');
    lines.length = 0;
    assert.equal(result.title, 'Browser Click Element [unclassified]',
        'a client reading tools/list sees the mistake with no log access');
});

test('annotate never throws, whatever it is given', async t=>{
    capture(t);
    for (const args of [[], [undefined, undefined], [null, null], [42, 42],
        ['', ''], ['job_start'], [{}, []]])
    {
        assert.doesNotThrow(()=>annotate(...args), `annotate(${args})`);
    }
});
