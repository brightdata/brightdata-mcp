'use strict'; /*jslint node:true es9:true*/
import {site_not_found} from './fetch_api.js';

export const BROWSER_RULES = [
    site_not_found,
    {reason: 'ref_not_found', title: 'Element not found',
        what: 'Ref {ref} isn\'t on the current page',
        todo: 'Take a new snapshot and use a ref from it.'},
    {reason: 'ref_ambiguous', title: 'Element ambiguous',
        what: 'Ref {ref} appears more than once in the snapshot',
        todo: 'Take a new snapshot and use the ref from an element line, '
            +'not from page text.'},
    {kind: 'timeout', title: 'Browser timed out',
        what: 'The browser didn\'t finish this step in time',
        todo: 'Take a new snapshot to see the page, then retry once.'},
    {kind: 'other', title: 'Browser action failed',
        what: 'The browser couldn\'t finish this step',
        todo: 'Read the details. Take a new snapshot to see the page, then '
            +'retry once.'},
];
