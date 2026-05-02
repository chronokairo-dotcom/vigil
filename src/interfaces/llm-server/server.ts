import * as http from 'http';
import * as vscode from 'vscode';
import {
    findModel,
    isAutoModel,
    listVSCodeModels,
    modelToOllamaName,
    routeAuto,
    toVSCodeMessages,
    countMessageChars,
    AUTO_MODEL_NAME,
    ROUTER_MODEL_FAMILY,
} from './modelBridge';
import type {
    AnthropicMessageContentBlock,
    AnthropicMessageInput,
    AnthropicMessagesRequest,
    AnthropicMessagesResponse,
    OllamaChatChunk,
    OllamaChatMessage,
    OllamaChatRequest,
    OllamaGenerateChunk,
    OllamaGenerateRequest,
    OllamaShowRequest,
    OllamaShowResponse,
    OllamaTagsResponse,
    OllamaVersionResponse,
} from './types';

const SERVER_VERSION = '0.1.0';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk: Buffer) => {
            data += chunk.toString();
        });
        req.on('end', () => resolve(data));
        req.on('error', reject);
    });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
    if (res.writableEnded) return;
    const json = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(json),
    });
    res.end(json);
}

function sendError(res: http.ServerResponse, status: number, message: string): void {
    sendJson(res, status, { error: message });
}

function nowNano(): number {
    return Number(process.hrtime.bigint());
}

function asAnthropicText(content: string | AnthropicMessageContentBlock[] | undefined): string {
    if (!content) return '';
    if (typeof content === 'string') return content;
    return content
        .filter((part) => part && typeof part === 'object' && part.type === 'text')
        .map((part) => part.text ?? '')
        .join('');
}

function toOllamaFromAnthropic(
    system: AnthropicMessagesRequest['system'],
    messages: AnthropicMessageInput[],
): OllamaChatMessage[] {
    const out: OllamaChatMessage[] = [];

    const systemText = asAnthropicText(system);
    if (systemText.trim()) {
        out.push({ role: 'system', content: systemText });
    }

    for (const msg of messages) {
        const text = asAnthropicText(msg.content);
        if (!text.trim()) continue;
        out.push({ role: msg.role, content: text });
    }

    return out;
}

function sseWrite(res: http.ServerResponse, event: string, data: unknown): void {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function makeMessageId(): string {
    return `msg_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleTags(res: http.ServerResponse): Promise<void> {
    const models = await listVSCodeModels();
    const body: OllamaTagsResponse = { models };
    sendJson(res, 200, body);
}

function handleVersion(res: http.ServerResponse): void {
    const body: OllamaVersionResponse = { version: SERVER_VERSION };
    sendJson(res, 200, body);
}

async function handleGenerate(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    output: vscode.OutputChannel,
): Promise<void> {
    const raw = await readBody(req);
    let payload: OllamaGenerateRequest;
    try {
        payload = JSON.parse(raw);
    } catch {
        sendError(res, 400, 'invalid JSON in request body');
        return;
    }

    const stream = payload.stream !== false;
    const startNs = nowNano();
    const cts = new vscode.CancellationTokenSource();

    let model: vscode.LanguageModelChat;
    let messages: vscode.LanguageModelChatMessage[];

    try {
        if (isAutoModel(payload.model)) {
            const autoMsgs: OllamaChatMessage[] = [];
            if (payload.system) {
                autoMsgs.push({ role: 'system', content: payload.system });
            }
            autoMsgs.push({ role: 'user', content: payload.prompt ?? '' });
            const autoResult = await routeAuto(autoMsgs, cts.token);
            model = autoResult.model;
            messages = autoResult.messages;
            output.appendLine(`[/api/generate] auto-routed to '${autoResult.selectedModelName}'`);
        } else {
            const found = await findModel(payload.model);
            if (!found) {
                sendError(res, 404, `model '${payload.model}' not found, try pulling it first`);
                cts.dispose();
                return;
            }
            model = found;
            messages = [];
            if (payload.system) {
                messages.push(vscode.LanguageModelChatMessage.User(payload.system));
                messages.push(vscode.LanguageModelChatMessage.Assistant('Understood.'));
            }
            messages.push(vscode.LanguageModelChatMessage.User(payload.prompt ?? ''));
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        output.appendLine(`[/api/generate] Routing error: ${msg}`);
        sendError(res, 500, `routing failed: ${msg}`);
        cts.dispose();
        return;
    }

    try {
        const lmResponse = await model.sendRequest(
            messages,
            { justification: 'VS Code LLM Server /api/generate request' },
            cts.token,
        );

        const promptChars = messages.reduce((s, m) => s + String(m.content).length, 0);
        const modelName = modelToOllamaName(model);

        if (stream) {
            res.writeHead(200, {
                'Content-Type': 'application/x-ndjson',
                'Transfer-Encoding': 'chunked',
            });

            let evalCount = 0;
            for await (const text of lmResponse.text) {
                evalCount++;
                const part: OllamaGenerateChunk = {
                    model: modelName,
                    created_at: new Date().toISOString(),
                    response: text,
                    done: false,
                };
                res.write(JSON.stringify(part) + '\n');
            }

            const totalNs = nowNano() - startNs;
            const finalChunk: OllamaGenerateChunk = {
                model: modelName,
                created_at: new Date().toISOString(),
                response: '',
                done: true,
                done_reason: 'stop',
                total_duration: totalNs,
                load_duration: 0,
                prompt_eval_count: promptChars,
                prompt_eval_duration: Math.floor(totalNs * 0.1),
                eval_count: evalCount,
                eval_duration: Math.floor(totalNs * 0.9),
            };
            res.write(JSON.stringify(finalChunk) + '\n');
            res.end();
        } else {
            let fullText = '';
            for await (const text of lmResponse.text) {
                fullText += text;
            }

            const totalNs = nowNano() - startNs;
            const result: OllamaGenerateChunk = {
                model: modelName,
                created_at: new Date().toISOString(),
                response: fullText,
                done: true,
                done_reason: 'stop',
                total_duration: totalNs,
                load_duration: 0,
                prompt_eval_count: promptChars,
                prompt_eval_duration: Math.floor(totalNs * 0.1),
                eval_count: fullText.split(/\s+/).length,
                eval_duration: Math.floor(totalNs * 0.9),
            };
            sendJson(res, 200, result);
        }
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        output.appendLine(`[/api/generate] Error: ${message}`);
        if (!res.headersSent) {
            sendError(res, 500, `generation failed: ${message}`);
        } else {
            res.end();
        }
    } finally {
        cts.dispose();
    }
}

async function handleChat(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    output: vscode.OutputChannel,
): Promise<void> {
    const raw = await readBody(req);
    let payload: OllamaChatRequest;
    try {
        payload = JSON.parse(raw);
    } catch {
        sendError(res, 400, 'invalid JSON in request body');
        return;
    }

    if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
        sendError(res, 400, 'messages array is required and must not be empty');
        return;
    }

    const stream = payload.stream !== false;
    const startNs = nowNano();
    const cts = new vscode.CancellationTokenSource();

    let model: vscode.LanguageModelChat;
    let messages: vscode.LanguageModelChatMessage[];

    try {
        if (isAutoModel(payload.model)) {
            const autoResult = await routeAuto(payload.messages, cts.token);
            model = autoResult.model;
            messages = autoResult.messages;
            output.appendLine(`[/api/chat] auto-routed to '${autoResult.selectedModelName}'`);
        } else {
            const found = await findModel(payload.model);
            if (!found) {
                sendError(res, 404, `model '${payload.model}' not found, try pulling it first`);
                cts.dispose();
                return;
            }
            model = found;
            messages = toVSCodeMessages(payload.messages);
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        output.appendLine(`[/api/chat] Routing error: ${msg}`);
        sendError(res, 500, `routing failed: ${msg}`);
        cts.dispose();
        return;
    }

    if (messages.length === 0) {
        sendError(res, 400, 'no valid messages after filtering');
        cts.dispose();
        return;
    }

    try {
        const lmResponse = await model.sendRequest(
            messages,
            { justification: 'VS Code LLM Server /api/chat request' },
            cts.token,
        );

        const promptChars = countMessageChars(payload.messages);
        const modelName = modelToOllamaName(model);

        if (stream) {
            res.writeHead(200, {
                'Content-Type': 'application/x-ndjson',
                'Transfer-Encoding': 'chunked',
            });

            let evalCount = 0;
            for await (const text of lmResponse.text) {
                evalCount++;
                const part: OllamaChatChunk = {
                    model: modelName,
                    created_at: new Date().toISOString(),
                    message: { role: 'assistant', content: text },
                    done: false,
                };
                res.write(JSON.stringify(part) + '\n');
            }

            const totalNs = nowNano() - startNs;
            const finalChunk: OllamaChatChunk = {
                model: modelName,
                created_at: new Date().toISOString(),
                message: { role: 'assistant', content: '' },
                done: true,
                done_reason: 'stop',
                total_duration: totalNs,
                load_duration: 0,
                prompt_eval_count: promptChars,
                prompt_eval_duration: Math.floor(totalNs * 0.1),
                eval_count: evalCount,
                eval_duration: Math.floor(totalNs * 0.9),
            };
            res.write(JSON.stringify(finalChunk) + '\n');
            res.end();
        } else {
            let fullText = '';
            for await (const text of lmResponse.text) {
                fullText += text;
            }

            const totalNs = nowNano() - startNs;
            const result: OllamaChatChunk = {
                model: modelName,
                created_at: new Date().toISOString(),
                message: { role: 'assistant', content: fullText },
                done: true,
                done_reason: 'stop',
                total_duration: totalNs,
                load_duration: 0,
                prompt_eval_count: promptChars,
                prompt_eval_duration: Math.floor(totalNs * 0.1),
                eval_count: fullText.split(/\s+/).length,
                eval_duration: Math.floor(totalNs * 0.9),
            };
            sendJson(res, 200, result);
        }
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        output.appendLine(`[/api/chat] Error: ${message}`);
        if (!res.headersSent) {
            sendError(res, 500, `chat failed: ${message}`);
        } else {
            res.end();
        }
    } finally {
        cts.dispose();
    }
}

async function handleAnthropicMessages(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    output: vscode.OutputChannel,
): Promise<void> {
    const raw = await readBody(req);
    let payload: AnthropicMessagesRequest;
    try {
        payload = JSON.parse(raw);
    } catch {
        sendError(res, 400, 'invalid JSON in request body');
        return;
    }

    if (!payload.model || !Array.isArray(payload.messages) || payload.messages.length === 0) {
        sendError(res, 400, 'model and non-empty messages are required');
        return;
    }

    const ollamaMessages = toOllamaFromAnthropic(payload.system, payload.messages);
    if (ollamaMessages.length === 0) {
        sendError(res, 400, 'no valid text content in messages');
        return;
    }

    const stream = payload.stream === true;
    const cts = new vscode.CancellationTokenSource();
    const startNs = nowNano();

    let model: vscode.LanguageModelChat;
    let messages: vscode.LanguageModelChatMessage[];

    try {
        if (isAutoModel(payload.model)) {
            const autoResult = await routeAuto(ollamaMessages, cts.token);
            model = autoResult.model;
            messages = autoResult.messages;
            output.appendLine(`[/v1/messages] auto-routed to '${autoResult.selectedModelName}'`);
        } else {
            const found = await findModel(payload.model);
            if (!found) {
                sendError(res, 404, `model '${payload.model}' not found`);
                cts.dispose();
                return;
            }
            model = found;
            messages = toVSCodeMessages(ollamaMessages);
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        output.appendLine(`[/v1/messages] Routing error: ${msg}`);
        sendError(res, 500, `routing failed: ${msg}`);
        cts.dispose();
        return;
    }

    if (messages.length === 0) {
        sendError(res, 400, 'no valid messages after filtering');
        cts.dispose();
        return;
    }

    const promptChars = countMessageChars(ollamaMessages);
    const responseModelName = modelToOllamaName(model);
    const responseId = makeMessageId();

    try {
        const lmResponse = await model.sendRequest(
            messages,
            { justification: 'VS Code LLM Server /v1/messages request' },
            cts.token,
        );

        if (stream) {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
            });

            sseWrite(res, 'message_start', {
                type: 'message_start',
                message: {
                    id: responseId,
                    type: 'message',
                    role: 'assistant',
                    model: responseModelName,
                    content: [],
                    stop_reason: null,
                    stop_sequence: null,
                    usage: {
                        input_tokens: promptChars,
                        output_tokens: 0,
                    },
                },
            });
            sseWrite(res, 'content_block_start', {
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'text', text: '' },
            });

            let outputChars = 0;
            for await (const text of lmResponse.text) {
                outputChars += text.length;
                sseWrite(res, 'content_block_delta', {
                    type: 'content_block_delta',
                    index: 0,
                    delta: {
                        type: 'text_delta',
                        text,
                    },
                });
            }

            sseWrite(res, 'content_block_stop', {
                type: 'content_block_stop',
                index: 0,
            });

            sseWrite(res, 'message_delta', {
                type: 'message_delta',
                delta: {
                    stop_reason: 'end_turn',
                    stop_sequence: null,
                },
                usage: {
                    output_tokens: Math.max(1, Math.ceil(outputChars / 4)),
                },
            });

            sseWrite(res, 'message_stop', { type: 'message_stop' });
            res.end();
            return;
        }

        let fullText = '';
        for await (const text of lmResponse.text) {
            fullText += text;
        }

        const totalNs = nowNano() - startNs;
        const body: AnthropicMessagesResponse = {
            id: responseId,
            type: 'message',
            role: 'assistant',
            model: responseModelName,
            content: [{ type: 'text', text: fullText }],
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: {
                input_tokens: promptChars,
                output_tokens: Math.max(1, Math.ceil(fullText.length / 4)),
            },
        };

        void totalNs;
        sendJson(res, 200, body);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        output.appendLine(`[/v1/messages] Error: ${message}`);
        if (!res.headersSent) {
            sendError(res, 500, `chat failed: ${message}`);
        } else {
            res.end();
        }
    } finally {
        cts.dispose();
    }
}

async function handleShow(
    req: http.IncomingMessage,
    res: http.ServerResponse,
): Promise<void> {
    const raw = await readBody(req);
    let payload: OllamaShowRequest;
    try {
        payload = JSON.parse(raw || '{}');
    } catch {
        sendError(res, 400, 'invalid JSON in request body');
        return;
    }

    if (!payload.model) {
        sendError(res, 400, 'model field is required');
        return;
    }

    if (isAutoModel(payload.model)) {
        const body: OllamaShowResponse = {
            details: {
                parent_model: ROUTER_MODEL_FAMILY,
                format: 'router',
                family: AUTO_MODEL_NAME,
                families: [AUTO_MODEL_NAME],
                parameter_size: 'router',
                quantization_level: 'none',
            },
            modelfile: `# Auto model router\n# Uses ${ROUTER_MODEL_FAMILY} to improve prompts and select the best model\n`,
            template: '{{ .Prompt }}',
            modelinfo: {
                'general.architecture': 'router',
                'general.name': 'Auto Router',
                'general.family': AUTO_MODEL_NAME,
                'general.vendor': 'vscode-llm-server',
                'general.version': '1',
                'llm.context_length': 0,
            },
        };
        sendJson(res, 200, body);
        return;
    }

    const model = await findModel(payload.model);
    if (!model) {
        sendError(res, 404, `model '${payload.model}' not found`);
        return;
    }

    const body: OllamaShowResponse = {
        details: {
            parent_model: '',
            format: 'api',
            family: model.family,
            families: [model.family],
            parameter_size: model.maxInputTokens > 0 ? `${model.maxInputTokens}ctx` : 'unknown',
            quantization_level: 'none',
        },
        modelfile: `# ${model.family} via VS Code LM API\nFROM vscode/${model.vendor}/${model.family}\n`,
        template: '{{ .Prompt }}',
        modelinfo: {
            'general.architecture': 'api',
            'general.name': model.name,
            'general.family': model.family,
            'general.vendor': model.vendor,
            'general.version': model.version,
            'llm.context_length': model.maxInputTokens,
        },
    };
    sendJson(res, 200, body);
}

function handleEmbed(res: http.ServerResponse): void {
    sendError(res, 501, 'embeddings are not supported via VS Code LM API');
}

// ─── Server factory ───────────────────────────────────────────────────────────

export function createServer(output: vscode.OutputChannel): http.Server {
    const server = http.createServer(async (req, res) => {
        // Basic CORS for local tooling (e.g. Open WebUI, Ollama clients)
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        const method = req.method ?? 'GET';
        const url = (req.url ?? '/').split('?')[0]; // strip query params

        output.appendLine(`[server] ${method} ${url}`);

        if (method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        try {
            // Root ping (Ollama compatibility check)
            if (method === 'GET' && url === '/') {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('Ollama is running');
                return;
            }

            if (method === 'HEAD' && url === '/') {
                res.writeHead(200);
                res.end();
                return;
            }

            if (method === 'GET' && url === '/api/version') {
                handleVersion(res);
                return;
            }

            // List models — Ollama uses /api/tags; OpenAI compat uses /v1/models
            if (method === 'GET' && (url === '/api/tags' || url === '/api/models')) {
                await handleTags(res);
                return;
            }

            // OpenAI-compatible models list (used by many Ollama clients)
            if (method === 'GET' && url === '/v1/models') {
                const models = await listVSCodeModels();
                sendJson(res, 200, {
                    object: 'list',
                    data: models.map((m) => ({
                        id: m.name,
                        object: 'model',
                        created: Math.floor(Date.now() / 1000),
                        owned_by: m.details.family,
                    })),
                });
                return;
            }

            if (method === 'POST' && url === '/api/generate') {
                await handleGenerate(req, res, output);
                return;
            }

            if (method === 'POST' && url === '/api/chat') {
                await handleChat(req, res, output);
                return;
            }

            // Anthropic-compatible messages endpoint (Claude Code)
            if (method === 'POST' && url === '/v1/messages') {
                await handleAnthropicMessages(req, res, output);
                return;
            }

            if (method === 'POST' && url === '/api/show') {
                await handleShow(req, res);
                return;
            }

            if (method === 'POST' && url === '/api/embed') {
                handleEmbed(res);
                return;
            }

            // Debug endpoint — sends first 3 raw stream parts as JSON
            if (method === 'POST' && url === '/api/debug') {
                const raw = await readBody(req);
                let modelName = 'gpt-4o:copilot';
                try { modelName = (JSON.parse(raw) as { model?: string }).model ?? modelName; } catch { /* ignore */ }
                const m = await findModel(modelName);
                if (!m) { sendError(res, 404, `model '${modelName}' not found`); return; }
                const cts = new vscode.CancellationTokenSource();
                try {
                    const r = await m.sendRequest(
                        [vscode.LanguageModelChatMessage.User('Say hi')],
                        { justification: 'debug' }, cts.token,
                    );
                    const parts: unknown[] = [];
                    let n = 0;
                    for await (const chunk of r.stream) {
                        if (n++ >= 5) break;
                        const c = chunk as Record<string, unknown>;
                        parts.push({ type: c.constructor?.name ?? typeof c, keys: Object.keys(c), value: c['value'] });
                    }
                    const textParts: string[] = [];
                    const r2 = await m.sendRequest(
                        [vscode.LanguageModelChatMessage.User('Say hi')],
                        { justification: 'debug' }, cts.token,
                    );
                    for await (const t of r2.text) { textParts.push(t); if (textParts.length >= 5) break; }
                    sendJson(res, 200, { streamChunks: parts, textChunks: textParts });
                } finally { cts.dispose(); }
                return;
            }

            // Unsupported but recognized Ollama endpoints
            if (method === 'POST' && url === '/api/pull') {
                sendError(res, 501, 'model pulling is not supported; models are provided by VS Code');
                return;
            }

            if (method === 'POST' && url === '/api/push') {
                sendError(res, 501, 'model pushing is not supported');
                return;
            }

            if (method === 'POST' && url === '/api/copy') {
                sendError(res, 501, 'model copying is not supported');
                return;
            }

            if (method === 'DELETE' && url === '/api/delete') {
                sendError(res, 501, 'model deletion is not supported');
                return;
            }

            if (method === 'POST' && url === '/api/create') {
                sendError(res, 501, 'model creation is not supported');
                return;
            }

            sendError(res, 404, `unknown endpoint: ${method} ${url}`);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            output.appendLine(`[server] Unhandled error: ${message}`);
            if (!res.headersSent) {
                sendError(res, 500, `internal server error: ${message}`);
            }
        }
    });

    return server;
}
