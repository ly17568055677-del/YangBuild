export function nestQuery(query: Record<string, unknown>): Record<string, unknown> {
    const root: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(query)) {
        if (!key.includes('[')) {
            root[key] = value;
            continue;
        }
        assignQuery(root, queryTokens(key), value);
    }
    return root;
}

function queryTokens(key: string): string[] {
    const head = /^([^[]+)/.exec(key);
    if (!head) return [key];
    const tokens = [head[1]];
    for (const match of key.slice(head[1].length).matchAll(/\[([^\]]*)\]/g)) tokens.push(match[1]);
    return tokens;
}

function assignQuery(root: Record<string, unknown>, tokens: string[], value: unknown) {
    let current: unknown = root;
    for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index];
        const last = index === tokens.length - 1;
        const next = tokens[index + 1];
        if (token === '') {
            if (!Array.isArray(current)) return;
            if (last) {
                if (Array.isArray(value)) current.push(...value);
                else current.push(value);
            } else {
                const child = containerFor(tokens[index + 2]);
                current.push(child);
                current = child;
            }
            continue;
        }
        if (Array.isArray(current)) {
            const at = Number(token);
            if (last) {
                current[at] = value;
                return;
            }
            if (current[at] == null || typeof current[at] !== 'object') current[at] = containerFor(next);
            current = current[at];
            continue;
        }
        if (!current || typeof current !== 'object') return;
        const record = current as Record<string, unknown>;
        if (last) {
            record[token] = value;
            return;
        }
        if (record[token] == null || typeof record[token] !== 'object') record[token] = containerFor(next);
        current = record[token];
    }
}

function containerFor(next: string | undefined): unknown[] | Record<string, unknown> {
    if (next === '' || (next !== undefined && /^\d+$/.test(next))) return [];
    return {};
}
