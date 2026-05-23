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
        // Use prefix (first 2048) + suffix (last 64) for fingerprint.
        // This catches duplicate headers/footers even when pages share
        // the same total length but differ in body content.
        const prefix = content.slice(0, this._prefix_len);
        const suffix = content.slice(-64);
        const hash = crypto
            .createHash('sha256')
            .update(prefix + suffix)
            .digest('hex');

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
        if (item == null) return item; // pass through null/undefined
        return Object.fromEntries(
            fields.filter(f => f in item).map(f => [f, item[f]])
        );
    });
}

/**
 * Build metrics summary for batch responses.
 */
export function buildForgeMetrics(cache, timings = {}) {
    return {
        forge_version: '1.0.0',
        invariant: 'INV-CF-1',
        doi: 'https://doi.org/10.5281/zenodo.20277875',
        dedup: cache.stats(),
        timings,
        timestamp_utc: new Date().toISOString(),
    };
}