import { ApiCtx } from '../common/context';
import { sysConfig } from '../common/support';
import { ApiError, msg, SseStream } from '../common/util';

interface AiModel {
    key: string;
    value: string;
}

interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface AiSettings {
    url: string;
    key: string;
    models: AiModel[];
    defaultModel: string;
}

export async function crudAiConfig(ctx: ApiCtx) {
    const settings = await aiSettings();
    if (!settings.url || !settings.key || !settings.models.length) throw new ApiError(msg(ctx.lang, 'aiOff'));
    return {
        default_model: settings.defaultModel,
        model_list: settings.models,
    };
}

export function crudAiStream(ctx: ApiCtx) {
    return new SseStream((write, signal) => streamDesign(ctx, write, signal));
}

export function chatCompletionsUrl(base: string): string {
    const trimmed = base.trim().replace(/\/+$/, '');
    if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
    return `${trimmed}/chat/completions`;
}

export function eventsFromCompletionChunk(payload: unknown): Array<{ event?: string; data: string }> {
    if (!payload || typeof payload !== 'object') return [];
    const row = payload as Record<string, unknown>;
    if (typeof row.type === 'string' && row.type.startsWith('response.')) return [{ data: JSON.stringify(row) }];
    const error = row.error;
    if (error && typeof error === 'object') {
        const message = String((error as Record<string, unknown>).message || 'AI 请求失败');
        return [{ event: 'error', data: JSON.stringify({ message }) }];
    }
    const choice = Array.isArray(row.choices) ? (row.choices[0] as Record<string, unknown> | undefined) : undefined;
    if (!choice) return [];
    const delta = choice.delta && typeof choice.delta === 'object' ? (choice.delta as Record<string, unknown>) : {};
    const events: Array<{ event?: string; data: string }> = [];
    const reasoning = delta.reasoning_content ?? delta.reasoning;
    if (typeof reasoning === 'string' && reasoning) {
        events.push({ data: JSON.stringify({ type: 'response.reasoning_text.delta', delta: reasoning }) });
    }
    if (typeof delta.content === 'string' && delta.content) {
        events.push({ data: JSON.stringify({ type: 'response.output_text.delta', delta: delta.content }) });
    }
    if (choice.finish_reason) events.push({ data: JSON.stringify({ type: 'response.completed' }) });
    return events;
}

async function streamDesign(ctx: ApiCtx, write: (chunk: string) => void, signal: AbortSignal) {
    const settings = await aiSettings();
    if (!settings.url || !settings.key || !settings.models.length) {
        write(frame('error', JSON.stringify({ message: msg(ctx.lang, 'aiOff') })));
        return;
    }
    const requested = String(ctx.body.model || '');
    const known = settings.models.some((item) => item.value === requested);
    const model = known ? requested : settings.defaultModel;
    const messages = chatMessages(ctx.body.messages);
    if (!messages.length) {
        write(frame('error', JSON.stringify({ message: msg(ctx.lang, 'param') })));
        return;
    }
    const response = await fetch(chatCompletionsUrl(settings.url), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            Authorization: `Bearer ${settings.key}`,
        },
        body: JSON.stringify({
            model,
            messages,
            temperature: clamp(ctx.body.temperature, 0, 2, 0.3),
            top_p: clamp(ctx.body.top_p, 0, 1, 1),
            stream: true,
        }),
        signal,
    });
    if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => '');
        write(frame('error', JSON.stringify({ message: safeError(detail, settings.key, response.status) })));
        return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let completed = false;
    while (!signal.aborted) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() || '';
        for (const block of blocks) {
            completed = emitBlock(write, block, settings.key) || completed;
        }
    }
    if (buffer.trim()) completed = emitBlock(write, buffer, settings.key) || completed;
    if (!completed && !signal.aborted) write(frame(undefined, JSON.stringify({ type: 'response.completed' })));
    if (!signal.aborted) write(frame(undefined, '[DONE]'));
}

function emitBlock(write: (chunk: string) => void, block: string, secret: string): boolean {
    const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
    if (!data) return false;
    if (data === '[DONE]') return true;
    let payload: unknown;
    try {
        payload = JSON.parse(data);
    } catch {
        return false;
    }
    let completed = false;
    for (const event of eventsFromCompletionChunk(payload)) {
        if (event.event === 'error') {
            const parsed = JSON.parse(event.data) as { message?: string };
            write(frame('error', JSON.stringify({ message: safeError(String(parsed.message || ''), secret, 0) })));
            return true;
        }
        if (event.data.includes('"response.completed"') || event.data.includes('"response.failed"')) completed = true;
        write(frame(event.event, event.data));
    }
    return completed;
}

async function aiSettings(): Promise<AiSettings> {
    const url = String((await sysConfig('ai_api_url')) || '').trim();
    const key = String((await sysConfig('ai_api_key')) || '').trim();
    const models = modelList(await sysConfig('ai_model_list'));
    const fallback = String((await sysConfig('ai_default_model')) || '').trim();
    const defaultModel = models.some((item) => item.value === fallback) ? fallback : models[0]?.value || fallback;
    return { url, key, models, defaultModel };
}

function modelList(value: unknown): AiModel[] {
    const rows = Array.isArray(value) ? value : [];
    const models: AiModel[] = [];
    for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const item = row as Record<string, unknown>;
        const key = String(item.key || '').trim();
        const model = String(item.value || '').trim();
        if (key && model) models.push({ key, value: model });
    }
    return models;
}

function chatMessages(value: unknown): ChatMessage[] {
    if (!Array.isArray(value)) return [];
    const messages: ChatMessage[] = [];
    for (const row of value) {
        if (!row || typeof row !== 'object') continue;
        const item = row as Record<string, unknown>;
        const role = String(item.role || '');
        const content = String(item.content || '').slice(0, 20000);
        if ((role === 'system' || role === 'user' || role === 'assistant') && content) messages.push({ role, content });
    }
    return messages.slice(-40);
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
}

function frame(event: string | undefined, data: string) {
    return `${event ? `event: ${event}\n` : ''}data: ${data}\n\n`;
}

function safeError(detail: string, secret: string, status: number) {
    let message = detail;
    try {
        const parsed = JSON.parse(detail) as { error?: { message?: string }; message?: string };
        message = String(parsed.error?.message || parsed.message || detail);
    } catch {
        // 上游错误不一定是 JSON
    }
    message = message.replace(/\s+/g, ' ').trim();
    if (secret) message = message.split(secret).join('');
    message = message.slice(0, 300);
    if (!message) return status ? `AI 请求失败 (${status})` : 'AI 请求失败';
    return status ? `AI 请求失败 (${status}): ${message}` : message;
}
