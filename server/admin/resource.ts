import { ApiCtx } from '../common/context';

export interface JoinDef {
    as: string;
    nest: string;
    table: string;
    local: string;
    foreign: string;
    fields?: string[];
}

export interface LookupField {
    field: string;
    table: string;
    pk: string;
    label: string;
    text: string;
}

export interface CrudResource {
    key: string;
    table: string;
    pk?: string;
    alias?: string;
    quickSearchField?: string[];
    defaultSort?: string | Record<string, 'asc' | 'desc'>;
    orderGuarantee?: Record<string, 'asc' | 'desc'>;
    weighField?: string;
    preExcludeFields?: string[];
    hiddenFields?: string[];
    dataLimit?: false | 'personal' | 'allAuth' | 'allAuthAndOthers' | 'parent' | number;
    dataLimitField?: string;
    dataLimitFieldAutoFill?: boolean;
    joins?: JoinDef[];
    jsonFields?: string[];
    arrayFields?: string[];
    yearFields?: string[];
    cityFields?: string[];
    lookupFields?: LookupField[];
    centsFields?: string[];
    timestamps?: { create: boolean; update: boolean };
    blockDelete?: boolean;
    afterSelect?: (rows: Record<string, unknown>[], ctx: ApiCtx) => Promise<void>;
    afterFind?: (row: Record<string, unknown>, ctx: ApiCtx) => Promise<void>;
}

export const resources = new Map<string, CrudResource>();

export function registerResource(resource: CrudResource) {
    resources.set(resource.key.toLowerCase(), resource);
}
