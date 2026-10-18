'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {ask_sophie} from '../sophie_assistant.js';

const make_axios_mock = responses=>{
    const calls = [];
    const axios_impl = async cfg=>{
        calls.push(cfg);
        const next = responses.shift();
        if (!next)
            throw new Error('unexpected extra axios call');
        if (next instanceof Error)
            throw next;
        return {data: next};
    };
    axios_impl.calls = calls;
    return axios_impl;
};

const noop_sleep = async()=>{};

test('ask_sophie posts with dialog_id omitted when not provided', async()=>{
    const axios_impl = make_axios_mock([
        {dialog_id: 'a'.repeat(24), message_id: 'm1'},
        [
            {type: 'human', role: 'user', ts: 1000, message: 'hi'},
            {type: 'ai', role: 'ai', message: 'hello there'},
        ],
    ]);
    const result = await ask_sophie({
        question: 'hi',
        api_token: 'tok',
        axios_impl,
        sleep_impl: noop_sleep,
    });
    assert.equal(result.answer, 'hello there');
    assert.equal(result.dialog_id, 'a'.repeat(24));
    assert.equal(axios_impl.calls[0].method, 'POST');
    assert.deepEqual(axios_impl.calls[0].data, {message: 'hi'});
    assert.equal(axios_impl.calls[0].headers.authorization, 'Bearer tok');
    assert.equal(axios_impl.calls[1].method, 'GET');
    assert.ok(axios_impl.calls[1].url.endsWith('/'+'a'.repeat(24)));
});

test('ask_sophie includes dialog_id in POST body when provided', async()=>{
    const dialog_id = 'b'.repeat(24);
    const axios_impl = make_axios_mock([
        {dialog_id, message_id: 'm2'},
        [
            {type: 'human', role: 'user', ts: 1, message: 'follow up'},
            {type: 'ai', role: 'ai', message: 'ok'},
        ],
    ]);
    await ask_sophie({
        question: 'follow up',
        dialog_id,
        api_token: 'tok',
        axios_impl,
        sleep_impl: noop_sleep,
    });
    assert.deepEqual(axios_impl.calls[0].data, {
        message: 'follow up',
        dialog_id,
    });
});

test('ask_sophie ignores the previous reply in a follow-up thread',
    async()=>
{
    const dialog_id = 'c'.repeat(24);
    const old_turn = [
        {type: 'human', role: 'user', ts: 1, message: 'old q'},
        {type: 'ai', role: 'ai', message: 'old reply'},
    ];
    const new_q = {type: 'human', role: 'user', ts: 2, message: 'new q'};
    const fresh = {type: 'ai', role: 'ai', message: 'fresh reply'};
    const axios_impl = make_axios_mock([
        {dialog_id, message_id: 'm3'},
        old_turn,
        [...old_turn, new_q],
        [...old_turn, new_q, fresh],
    ]);
    const result = await ask_sophie({
        question: 'new q',
        dialog_id,
        api_token: 'tok',
        axios_impl,
        sleep_impl: noop_sleep,
    });
    assert.equal(result.answer, 'fresh reply');
});

test('ask_sophie throws with dialog_id when polling times out',
    async()=>
{
    const dialog_id = 'd'.repeat(24);
    const responses = [{dialog_id, message_id: 'm4'}];
    for (let i = 0; i < 20; i++)
        responses.push([{type: 'human', role: 'user', ts: 100, message: 'q'}]);
    const axios_impl = make_axios_mock(responses);
    await assert.rejects(
        ask_sophie({
            question: 'q',
            api_token: 'tok',
            axios_impl,
            sleep_impl: noop_sleep,
        }),
        err=>err.message.includes('timed out')
            && err.message.includes(dialog_id),
    );
});

test('ask_sophie throws when POST returns no dialog_id', async()=>{
    const axios_impl = make_axios_mock([{message_id: 'm5'}]);
    await assert.rejects(
        ask_sophie({
            question: 'q',
            api_token: 'tok',
            axios_impl,
            sleep_impl: noop_sleep,
        }),
        /no dialog_id/,
    );
});

test('ask_sophie propagates axios errors from POST', async()=>{
    const axios_impl = make_axios_mock([new Error('401 unauthorized')]);
    await assert.rejects(
        ask_sophie({
            question: 'q',
            api_token: 'bad',
            axios_impl,
            sleep_impl: noop_sleep,
        }),
        /401 unauthorized/,
    );
});

test('ask_sophie treats non-array GET body as empty and times out',
    async()=>
{
    const dialog_id = 'e'.repeat(24);
    const responses = [{dialog_id, message_id: 'm6'}];
    for (let i = 0; i < 20; i++)
        responses.push({error: 'not found'});
    const axios_impl = make_axios_mock(responses);
    await assert.rejects(
        ask_sophie({
            question: 'q',
            api_token: 'tok',
            axios_impl,
            sleep_impl: noop_sleep,
        }),
        err=>err.message.includes('timed out')
            && err.message.includes(dialog_id),
    );
});
