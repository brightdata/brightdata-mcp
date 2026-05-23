// context_cache.js
// Deduplication layer for batch scraping
'use strict';

import crypto from 'node:crypto';

/**
 * SHA-256 prefix fingerprint cache.
 * Uses first 2048 chars as content signature to detect duplicates.
 */
export class ContextCache {
    constructor(options = {}) {
        this._seen = new Map();
        this._prefix_len = options.prefix_len ?? 2048;
        this._stats = { hits: 0, misses: 0, bytes_saved: 0 };
    }

    /**
     * Check if content is duplicate.
     * @param {string} content
     * @param {string} url
     * @returns {{ isDuplicate: boolean, contentHash: string, duplicateOf?: string }}
     */
    check(content, url) {
        let hash;
        if (content.length <= 2048) {
            // Short content: use full content hash
            hash = crypto.createHash('sha256').update(content).digest('hex');
        } else {
            // Long content: sample from start, middle, and end
            const prefix = content.slice(0, 2048);
            const midIdx = Math.floor(content.length / 2);
            const middle = content.slice(midIdx, midIdx + 256);
            const suffix = content.slice(-256);
            hash = crypto
                .createHash('sha256')
                .update(prefix + middle + suffix)
                .digest('hex');
        }

        if (this._seen.has(hash)) {
            this._stats.hits++;
            this._stats.bytes_saved += content.length;
            return {
                isDuplicate: true,
                contentHash: hash,
                duplicateOf: this._seen.get(hash),
            };
        }

        this._seen.set(hash, url);
        this._stats.misses++;
        return { isDuplicate: false, contentHash: hash };
    }

    /**
     * Return deduplication stats.
     */
    stats() {
        return {
            unique_blocks: this._stats.misses,
            duplicate_blocks: this._stats.hits,
            bytes_saved: this._stats.bytes_saved,
            dedup_ratio: this._stats.hits > 0
                ? (this._stats.hits / (this._stats.hits + this._stats.misses)).toFixed(3)
                : '0.000',
        };
    }

    /**
     * Clear the cache. Useful for long-running processes.
     */
    clear() {
        this._seen.clear();
        this._stats = { hits: 0, misses: 0, bytes_saved: 0 };
    }
}

/**
 * Filter fields from search results.
 * @param {Array} results
 * @param {string[]} fields
 * @returns {Array}
 */
export function filterFields(results, fields) {
    if (!fields || fields.length === 0) return results;
    if (!Array.isArray(results)) return results;
    return results.map(item => {
        if (item == null) return {};
        if (typeof item !== 'object') return {};
        return Object.fromEntries(
            fields.filter(f => f in item).map(f => [f, item[f]])
        );
    });
}

/**
 * Build metrics summary for batch responses.
 */
export function buildBatchMetrics(cache, timings = {}) {
    return {
        version: '1.0.0',
        dedup: cache.stats(),
        timings,
        timestamp_utc: new Date().toISOString(),
    };
}