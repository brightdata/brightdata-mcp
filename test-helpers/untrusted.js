'use strict'; /*jslint node:true es9:true*/
// Tool results from external-content tools arrive wrapped by
// wrap_untrusted(); tests that inspect the payload read the body back out.
const WRAPPED_RE = new RegExp('=====UNTRUSTED_[0-9a-f]{32}_BEGIN=====\\n'
    +'([\\s\\S]*)\\n=====UNTRUSTED_[0-9a-f]{32}_END=====$');

export const unwrap = text=>WRAPPED_RE.exec(text)?.[1] ?? text;
