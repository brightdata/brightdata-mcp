// LICENSE_CODE ZON
'use strict'; /*jslint node:true es9:true*/
import axios from 'axios';
import {z} from 'zod';

const SOPHIE_BASE = 'https://api.brightdata.com/sophie/dialog';
const POLL_INTERVAL_MS = 1500;
const POLL_MAX_ATTEMPTS = 20;

const sleep = ms=>new Promise(r=>setTimeout(r, ms));

const find_reply = (messages, question)=>{
    const i = messages.findLastIndex(m=>m?.type=='human');
    if (i<0 || messages[i].message!=question)
        return;
    return messages.slice(i+1).find(m=>m?.type=='ai'
        && typeof m.message=='string');
};

export const ask_sophie = async({question, dialog_id, api_token,
    axios_impl = axios, sleep_impl = sleep})=>
{
    const post_body = dialog_id
        ? {message: question, dialog_id}
        : {message: question};
    const post_res = await axios_impl({
        url: SOPHIE_BASE,
        method: 'POST',
        data: post_body,
        headers: {
            authorization: `Bearer ${api_token}`,
            'content-type': 'application/json',
        },
        responseType: 'json',
    });
    const returned_dialog_id = post_res.data?.dialog_id;
    if (!returned_dialog_id)
        throw new Error('Sophie POST returned no dialog_id');
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++)
    {
        await sleep_impl(POLL_INTERVAL_MS);
        const get_res = await axios_impl({
            url: `${SOPHIE_BASE}/${returned_dialog_id}`,
            method: 'GET',
            headers: {authorization: `Bearer ${api_token}`},
            responseType: 'json',
        });
        const messages = Array.isArray(get_res.data) ? get_res.data : [];
        const reply = find_reply(messages, question);
        if (reply)
            return {answer: reply.message, dialog_id: returned_dialog_id};
    }
    throw new Error('Bright Data assistant timed out after 30s; '
        +`retry with dialog_id=${returned_dialog_id} to fetch the reply `
        +`later`);
};

export const sophie_assistant_tool = {
    name: 'ask_brightdata_assistant',
    description: 'Ask Bright Data\'s support assistant (Sophie) a question '
        +'about Bright Data products, APIs, MCP usage, zones, scraping, or '
        +'account setup. Use when the user asks "how do I..." about Bright '
        +'Data, when you hit a Bright Data error you don\'t recognize, or '
        +'when deciding between products (Web Unlocker vs. Scraping Browser '
        +'vs. dataset tools). Supports threaded follow-ups via dialog_id.',
    annotations: {
        title: 'Ask Bright Data Assistant',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
    },
    parameters: z.object({
        question: z.string().min(1).max(20480)
            .describe('The question to ask. Max 20480 chars.'),
        dialog_id: z.string().length(24).optional()
            .describe('Optional 24-char dialog_id from a previous call to '
                +'continue the same thread.'),
    }),
    execute: null,
};
