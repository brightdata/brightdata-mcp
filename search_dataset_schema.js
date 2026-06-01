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

const leaf_value_schema = z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.union([z.string(), z.number(), z.boolean()])),
]);

const leaf_schema = z.object({
    name: z.string().describe('Field name to filter on. Get valid field '
        +'names from the list_dataset_fields tool.'),
    operator: z.string().describe('Filter operator, one of: '
        +FILTER_OPERATORS.join(', ')),
    value: leaf_value_schema,
});

// Build the filter node schema with a hard nesting cap (max depth 3).
// At max depth, only leaf nodes are allowed.
function build_node_schema(depth){
    if (depth<=1)
        return leaf_schema;
    const group_schema = z.object({
        operator: z.enum(['and', 'or']),
        filters: z.array(build_node_schema(depth-1)).min(1),
    });
    return z.union([group_schema, leaf_schema]);
}

// depth param counts schema layers incl. the leaf layer, so the value is
// MAX_NESTING + 1 to allow exactly MAX_NESTING levels of group nesting.
const MAX_NESTING = 3;
export const filter_schema = build_node_schema(MAX_NESTING+1);

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
