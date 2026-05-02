/**
 * Conversation and message store.

 *
 * Persists conversations and messages as JSON files under data/conversations/.
 * No SQLite dependency; compatible with any runtime.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ─── Types ─────────────────────────────────────────────────────

export interface Conversation {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
}

export interface ConversationMessage {
    id: string;
    conversationId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
}

// ─── Storage helpers ────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), 'data', 'conversations');

function ensureDir(): void {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function convFile(): string {
    return path.join(DATA_DIR, 'conversations.json');
}

function msgsFile(conversationId: string): string {
    return path.join(DATA_DIR, `${conversationId}.json`);
}

function loadConversations(): Conversation[] {
    ensureDir();
    if (!fs.existsSync(convFile())) return [];
    try { return JSON.parse(fs.readFileSync(convFile(), 'utf8')) as Conversation[]; }
    catch { return []; }
}

function persistConversations(convs: Conversation[]): void {
    ensureDir();
    fs.writeFileSync(convFile(), JSON.stringify(convs, null, 2), 'utf8');
}

function loadMessages(conversationId: string): ConversationMessage[] {
    if (!fs.existsSync(msgsFile(conversationId))) return [];
    try { return JSON.parse(fs.readFileSync(msgsFile(conversationId), 'utf8')) as ConversationMessage[]; }
    catch { return []; }
}

function persistMessages(conversationId: string, msgs: ConversationMessage[]): void {
    ensureDir();
    fs.writeFileSync(msgsFile(conversationId), JSON.stringify(msgs, null, 2), 'utf8');
}

// ─── CRUD ──────────────────────────────────────────────────────

/**
 * List all conversations, newest first.
 */
export function listConversations(): Conversation[] {
    return loadConversations().sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Create a new empty conversation.
 */
export function createConversation(title = 'New Chat'): Conversation {
    const now = Date.now();
    const conv: Conversation = {
        id: crypto.randomUUID(),
        title,
        createdAt: now,
        updatedAt: now,
    };
    const convs = loadConversations();
    convs.unshift(conv);
    persistConversations(convs);
    return conv;
}

/**
 * Get a conversation by id.
 */
export function getConversation(id: string): Conversation | undefined {
    return loadConversations().find(c => c.id === id);
}

/**
 * Update a conversation's title.
 */
export function updateConversationTitle(id: string, title: string): void {
    const convs = loadConversations();
    const idx = convs.findIndex(c => c.id === id);
    if (idx < 0) throw new Error(`Conversation not found: ${id}`);
    convs[idx].title = title;
    convs[idx].updatedAt = Date.now();
    persistConversations(convs);
}

/**
 * Delete a conversation and all its messages.
 */
export function deleteConversation(id: string): void {
    persistConversations(loadConversations().filter(c => c.id !== id));
    const mf = msgsFile(id);
    if (fs.existsSync(mf)) fs.unlinkSync(mf);
}

// ─── Messages ──────────────────────────────────────────────────

/**
 * Get all messages for a conversation.
 */
export function getMessages(conversationId: string): ConversationMessage[] {
    return loadMessages(conversationId);
}

/**
 * Append a message to a conversation.
 */
export function addMessage(
    conversationId: string,
    role: ConversationMessage['role'],
    content: string
): ConversationMessage {
    const msg: ConversationMessage = {
        id: crypto.randomUUID(),
        conversationId,
        role,
        content,
        timestamp: Date.now(),
    };
    const msgs = loadMessages(conversationId);
    msgs.push(msg);
    persistMessages(conversationId, msgs);

    // Touch the conversation's updatedAt
    const convs = loadConversations();
    const idx = convs.findIndex(c => c.id === conversationId);
    if (idx >= 0) {
        convs[idx].updatedAt = Date.now();
        persistConversations(convs);
    }

    return msg;
}

/**
 * Delete all messages in a conversation (reset history).
 */
export function clearMessages(conversationId: string): void {
    persistMessages(conversationId, []);
}
