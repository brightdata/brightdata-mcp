'use strict'; /*jslint node:true es9:true*/
import {z} from 'zod';

export const DATASET_IDS = [
    'gd_l1viktl72bvl7bjuj0',
    'gd_me5ppxjr2ge6icjuh0',
    'gd_l1vikfnt1wgvvqz95w',
];

export const dataset_id_schema = z.enum(DATASET_IDS);

export const FILTER_OPERATORS = ['=', '!=', '<', '<=', '>', '>=', 'in',
    'not_in', 'includes', 'not_includes', 'array_includes',
    'not_array_includes', 'is_null', 'is_not_null'];

export function metadata_to_fields(metadata){
    const fields = metadata && typeof metadata=='object'
        && metadata.fields && typeof metadata.fields=='object'
        ? metadata.fields : {};
    const out = [];
    for (const [name, meta] of Object.entries(fields))
    {
        if (!meta || typeof meta!='object')
            continue;
        if (meta.active===false)
            continue;
        out.push({
            name,
            type: meta.type,
            description: meta.description,
        });
    }
    return out;
}
