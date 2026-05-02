import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import * as http from 'http';
import crypto from 'crypto';
import { getDatabase, ChatHistoryService, ChatService, WebSocketServer } from '../../core';
import type { ChatMessage, SaveHistoryInput, HistoryFilter } from '../../core';
import { requireAuth, optionalAuth, getAuthContext } from './auth-middleware';

const app = new Hono();

// Middleware
app.use('*', cors());
app.use('*', logger());
app.use('*', optionalAuth);

// Instancias dos servicos (inicializadas apos conexao com DB)
let chatHistoryService: ChatHistoryService | null = null;
const chatServices = new Map<string, ChatService>();

/**
 * Obtem ou cria um ChatService para um canal especifico
 */
function getChatService(channel: string): ChatService {
  if (!chatServices.has(channel)) {
    chatServices.set(channel, new ChatService(channel));
  }
  return chatServices.get(channel)!;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'Vigil-api',
    timestamp: new Date().toISOString(),
    dbConnected: chatHistoryService !== null,
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CHAT HISTORY ENDPOINTS (Persistencia em SQLite via ChatHistoryService)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/chat/history
 * Lista todos os historicos com filtros opcionais (Requer autenticação)
 */
app.get('/api/chat/history', requireAuth, async (c) => {
  if (!chatHistoryService) {
    return c.json({ error: 'Database not initialized' }, 503);
  }

  const auth = getAuthContext(c);
  const workspaceId = c.req.query('workspaceId') || auth.workspaceId;

  if (!workspaceId) {
    return c.json({ error: 'workspaceId is required' }, 400);
  }

  const filter: HistoryFilter = {
    projectId: c.req.query('projectId'),
    pipelineId: c.req.query('pipelineId'),
    channel: c.req.query('channel'),
    workspace: workspaceId,
    limit: c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : undefined,
    offset: c.req.query('offset') ? parseInt(c.req.query('offset')!, 10) : undefined,
  };

  if (c.req.query('fromDate')) {
    filter.fromDate = new Date(c.req.query('fromDate')!);
  }
  if (c.req.query('toDate')) {
    filter.toDate = new Date(c.req.query('toDate')!);
  }

  const histories = await chatHistoryService.listHistories(filter);
  return c.json({ data: histories, count: histories.length });
});

/**
 * GET /api/chat/history/:id
 * Recupera historico por ID
 */
app.get('/api/chat/history/:id', async (c) => {
  if (!chatHistoryService) {
    return c.json({ error: 'Database not initialized' }, 503);
  }

  const id = c.req.param('id');
  const history = await chatHistoryService.getHistoryById(id);

  if (!history) {
    return c.json({ error: 'History not found' }, 404);
  }

  return c.json({ data: history });
});

/**
 * GET /api/chat/history/channel/:channel
 * Recupera historico por canal
 */
app.get('/api/chat/history/channel/:channel', async (c) => {
  if (!chatHistoryService) {
    return c.json({ error: 'Database not initialized' }, 503);
  }

  const channel = c.req.param('channel');
  const history = await chatHistoryService.getHistoryByChannel(channel);

  if (!history) {
    return c.json({ error: 'History not found', channel }, 404);
  }

  return c.json({ data: history });
});

/**
 * GET /api/chat/history/pipeline/:pipelineId
 * Recupera historico por pipeline
 */
app.get('/api/chat/history/pipeline/:pipelineId', async (c) => {
  if (!chatHistoryService) {
    return c.json({ error: 'Database not initialized' }, 503);
  }

  const pipelineId = c.req.param('pipelineId');
  const history = await chatHistoryService.getHistoryByPipeline(pipelineId);

  if (!history) {
    return c.json({ error: 'History not found', pipelineId }, 404);
  }

  return c.json({ data: history });
});

/**
 * POST /api/chat/history
 * Salva ou atualiza historico completo (Requer autenticação)
 */
app.post('/api/chat/history', requireAuth, async (c) => {
  if (!chatHistoryService) {
    return c.json({ error: 'Database not initialized' }, 503);
  }

  const body = await c.req.json<SaveHistoryInput>();

  if (!body.channel) {
    return c.json({ error: 'channel is required' }, 400);
  }
  if (!body.messages || !Array.isArray(body.messages)) {
    return c.json({ error: 'messages array is required' }, 400);
  }

  const auth = getAuthContext(c);
  const history = await chatHistoryService.saveHistory({
    projectId: body.projectId,
    pipelineId: body.pipelineId,
    channel: body.channel,
    workspace: auth.workspaceId || body.workspace || '',
    messages: body.messages,
  });

  return c.json({ data: history, message: 'History saved successfully' }, 201);
});

/**
 * POST /api/chat/history/:id/message
 * Adiciona uma mensagem ao historico existente
 */
app.post('/api/chat/history/:id/message', async (c) => {
  if (!chatHistoryService) {
    return c.json({ error: 'Database not initialized' }, 503);
  }

  const id = c.req.param('id');
  const body = await c.req.json<{ message: Omit<ChatMessage, 'id' | 'timestamp'> }>();

  if (!body.message) {
    return c.json({ error: 'message object is required' }, 400);
  }

  // Gera ID e timestamp para a mensagem
  const fullMessage: ChatMessage = {
    ...body.message,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };

  // Extrai channel e pipelineId do ID do historico
  let channel = 'default';
  let pipelineId: string | undefined;

  if (id.startsWith('history-pipeline-')) {
    pipelineId = id.replace('history-pipeline-', '');
    channel = `pipeline-${pipelineId}`;
  } else if (id.startsWith('history-')) {
    channel = id.replace('history-', '');
  }

  const history = await chatHistoryService.appendMessage(channel, fullMessage, pipelineId);
  return c.json({ data: history, message: 'Message appended successfully' });
});

/**
 * DELETE /api/chat/history/:id
 * Deleta historico por ID
 */
app.delete('/api/chat/history/:id', async (c) => {
  if (!chatHistoryService) {
    return c.json({ error: 'Database not initialized' }, 503);
  }

  const id = c.req.param('id');
  const deleted = await chatHistoryService.deleteHistory(id);

  if (!deleted) {
    return c.json({ error: 'History not found' }, 404);
  }

  return c.json({ message: 'History deleted successfully' });
});

/**
 * POST /api/chat/history/:id/clear
 * Limpa mensagens de um historico (mantem o registro)
 */
app.post('/api/chat/history/:id/clear', async (c) => {
  if (!chatHistoryService) {
    return c.json({ error: 'Database not initialized' }, 503);
  }

  const id = c.req.param('id');
  const history = await chatHistoryService.clearMessages(id);

  if (!history) {
    return c.json({ error: 'History not found' }, 404);
  }

  return c.json({ data: history, message: 'Messages cleared successfully' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BACKUP & RECOVERY ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/chat/backups
 * Lista todos os backups disponiveis
 */
app.get('/api/chat/backups', async (c) => {
  if (!chatHistoryService) {
    return c.json({ error: 'Database not initialized' }, 503);
  }

  const pipelineId = c.req.query('pipelineId');
  const backups = chatHistoryService.listBackups(pipelineId);

  return c.json({ data: backups, count: backups.length });
});

/**
 * POST /api/chat/history/:id/backup
 * Cria backup de um historico especifico
 */
app.post('/api/chat/history/:id/backup', async (c) => {
  if (!chatHistoryService) {
    return c.json({ error: 'Database not initialized' }, 503);
  }

  const id = c.req.param('id');
  const backup = await chatHistoryService.createBackup(id);

  if (!backup) {
    return c.json({ error: 'History not found' }, 404);
  }

  return c.json({ data: backup, message: 'Backup created successfully' }, 201);
});

/**
 * POST /api/chat/backups/full
 * Cria backup de todos os historicos
 */
app.post('/api/chat/backups/full', async (c) => {
  if (!chatHistoryService) {
    return c.json({ error: 'Database not initialized' }, 503);
  }

  const backups = await chatHistoryService.createFullBackup();

  return c.json({
    data: backups,
    count: backups.length,
    message: `Full backup created: ${backups.length} histories backed up`,
  }, 201);
});

/**
 * POST /api/chat/backups/restore
 * Restaura historico de um arquivo de backup
 */
app.post('/api/chat/backups/restore', async (c) => {
  if (!chatHistoryService) {
    return c.json({ error: 'Database not initialized' }, 503);
  }

  const body = await c.req.json<{ backupPath?: string; pipelineId?: string; latest?: boolean }>();

  let result;

  if (body.latest) {
    result = await chatHistoryService.restoreLatestBackup(body.pipelineId);
  } else if (body.backupPath) {
    result = await chatHistoryService.restoreFromBackup(body.backupPath);
  } else {
    return c.json({ error: 'Either backupPath or latest=true is required' }, 400);
  }

  if (!result.success) {
    return c.json({ error: result.error, success: false }, 400);
  }

  return c.json({
    success: true,
    messagesRestored: result.messagesRestored,
    message: `Restored ${result.messagesRestored} messages`,
  });
});

/**
 * DELETE /api/chat/backups/cleanup
 * Remove backups antigos
 */
app.delete('/api/chat/backups/cleanup', async (c) => {
  if (!chatHistoryService) {
    return c.json({ error: 'Database not initialized' }, 503);
  }

  const daysOld = c.req.query('daysOld') ? parseInt(c.req.query('daysOld')!, 10) : 30;
  const deleted = chatHistoryService.cleanupOldBackups(daysOld);

  return c.json({
    deleted,
    message: `Removed ${deleted} backups older than ${daysOld} days`,
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SYNC ENDPOINTS (Sincronizacao com arquivos JSONL do ChatService)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/chat/sync
 * Sincroniza historico do arquivo JSONL com o banco de dados
 */
app.post('/api/chat/sync', async (c) => {
  if (!chatHistoryService) {
    return c.json({ error: 'Database not initialized' }, 503);
  }

  const body = await c.req.json<{ channel: string; pipelineId?: string }>();

  if (!body.channel) {
    return c.json({ error: 'channel is required' }, 400);
  }

  const result = await chatHistoryService.syncWithJsonl(body.channel, body.pipelineId);

  return c.json({
    success: result.success,
    messagesRestored: result.messagesRestored,
    error: result.error,
  });
});

/**
 * POST /api/chat/import
 * Importa historico de um arquivo JSONL
 */
app.post('/api/chat/import', async (c) => {
  if (!chatHistoryService) {
    return c.json({ error: 'Database not initialized' }, 503);
  }

  const body = await c.req.json<{ filePath: string; channel: string; pipelineId?: string }>();

  if (!body.filePath || !body.channel) {
    return c.json({ error: 'filePath and channel are required' }, 400);
  }

  const result = await chatHistoryService.importFromJsonl(body.filePath, body.channel, body.pipelineId);

  return c.json({
    success: result.success,
    messagesRestored: result.messagesRestored,
    error: result.error,
  });
});

/**
 * POST /api/chat/export
 * Exporta historico para arquivo JSONL
 */
app.post('/api/chat/export', async (c) => {
  if (!chatHistoryService) {
    return c.json({ error: 'Database not initialized' }, 503);
  }

  const body = await c.req.json<{ historyId: string; outputPath: string }>();

  if (!body.historyId || !body.outputPath) {
    return c.json({ error: 'historyId and outputPath are required' }, 400);
  }

  const success = await chatHistoryService.exportToJsonl(body.historyId, body.outputPath);

  if (!success) {
    return c.json({ error: 'History not found' }, 404);
  }

  return c.json({ success: true, message: `Exported to ${body.outputPath}` });
});

// ═══════════════════════════════════════════════════════════════════════════════
// LIVE CHAT ENDPOINTS (Compatibilidade com ChatService para operacoes em tempo real)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/chat/live/:channel
 * Recupera mensagens do chat em tempo real (arquivo JSONL)
 */
app.get('/api/chat/live/:channel', async (c) => {
  const channel = c.req.param('channel');
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : undefined;

  const chatService = getChatService(channel);
  const messages = chatService.getHistory(limit);

  return c.json({ data: messages, count: messages.length, channel });
});

/**
 * POST /api/chat/live/:channel/send
 * Envia uma mensagem no chat em tempo real
 */
app.post('/api/chat/live/:channel/send', async (c) => {
  const channel = c.req.param('channel');
  const body = await c.req.json<Omit<ChatMessage, 'id' | 'timestamp'>>();

  if (!body.sender || !body.content || !body.type) {
    return c.json({ error: 'sender, content, and type are required' }, 400);
  }

  const chatService = getChatService(channel);
  const message = chatService.send(body);

  // Sincroniza automaticamente com o banco de dados
  if (chatHistoryService) {
    try {
      await chatHistoryService.appendMessage(channel, message);
    } catch (err) {
      console.error('[server] Erro ao sincronizar mensagem com DB:', err);
    }
  }

  return c.json({ data: message, message: 'Message sent successfully' }, 201);
});

/**
 * POST /api/chat/live/:channel/clear
 * Limpa o chat em tempo real
 */
app.post('/api/chat/live/:channel/clear', async (c) => {
  const channel = c.req.param('channel');

  const chatService = getChatService(channel);
  chatService.backup(); // Faz backup antes de limpar
  chatService.clear();

  return c.json({ message: 'Chat cleared successfully', channel });
});

/**
 * POST /api/chat/live/:channel/backup
 * Faz backup do chat em tempo real
 */
app.post('/api/chat/live/:channel/backup', async (c) => {
  const channel = c.req.param('channel');

  const chatService = getChatService(channel);
  chatService.backup();

  return c.json({ message: 'Backup created successfully', channel });
});

/**
 * POST /api/chat/live/:channel/restore
 * Restaura backup do chat em tempo real
 */
app.post('/api/chat/live/:channel/restore', async (c) => {
  const channel = c.req.param('channel');

  const chatService = getChatService(channel);
  chatService.restore();
  const messages = chatService.getHistory();

  return c.json({ data: messages, count: messages.length, message: 'Backup restored successfully', channel });
});

// Integrar syncEndpoints
import { createSyncEndpoints } from './syncEndpoints';
import { createServicesEndpoints } from './servicesEndpoints';
import {
  AdvancedFeaturesFactory,
  type AdvancedFeaturesConfig,
} from '../../core';

const db = getDatabase();
const syncApp = createSyncEndpoints({ db });
app.route('/api/sync', syncApp);

// ═══════════════════════════════════════════════════════════════════════════════
// ADVANCED FEATURES FACTORY & SERVICES ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

let advancedFactory: AdvancedFeaturesFactory | null = null;

/**
 * Inicializar AdvancedFeaturesFactory com configuracoes da aplicacao
 */
function initializeAdvancedFeatures(httpServer: http.Server): void {
  const jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
  const projectPath = process.env.PROJECT_PATH || process.cwd();

  const factoryConfig: AdvancedFeaturesConfig = {
    httpServer,
    jwtSecret,
    aiProvider: undefined as any, // Will be injected via environment
    db,
    projectPath,
    enableTaskExecutor: true,
    enableWebSocket: true,
    enableWorkflowEngine: true,
    enableSecurityAnalysis: false, // Desabilitado por default
    enableAttackSimulation: false, // Desabilitado por default
    enablePipelineExecution: true,
    enableStreaming: true,
    enablePersistence: true,
    enableMonitoring: true,
    enableAutomation: true,
  };

  advancedFactory = new AdvancedFeaturesFactory(factoryConfig);

  // Injetar servicos de chat
  if (chatHistoryService) {
    const chatService = getChatService('default');
    advancedFactory.injectChatServices(chatHistoryService, chatService);
  }

  // Criar endpoints de servicos e integrar ao app
  const servicesApp = createServicesEndpoints({
    pipelineExecutor: advancedFactory.getPipelineExecutor(),
    streamingChat: advancedFactory.getStreamingChat(),
    eventStore: advancedFactory.getEventStore(),
    chatSync: advancedFactory.getChatSync(),
    safetyNet: advancedFactory.getSafetyNet(),
    modelFallback: advancedFactory.getModelFallback(),
    metrics: advancedFactory.getMetrics(),
    retentionPolicy: advancedFactory.getRetentionPolicy(),
    diagnosticPipelines: advancedFactory.getDiagnosticPipelines(),
    workflowExecutor: advancedFactory.getWorkflowExecutor(),
    workflowTriggers: advancedFactory.getWorkflowTriggers(),
  });

  app.route('/api/services', servicesApp);
  console.log('[server] Advanced Features Factory initialized and services endpoints registered');
}

/**
 * Obter instancia da Advanced Features Factory
 */
export function getAdvancedFactory(): AdvancedFeaturesFactory | null {
  return advancedFactory;
}

let webSocketServer: WebSocketServer | null = null;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * Inicializar conexao com banco de dados e iniciar servidor com WebSocket integrado
 */
export async function startServer(port: number = 3000): Promise<http.Server> {
  try {
    // Inicializar conexao com banco de dados
    await db.initialize();
    console.log('[server] Database connected');

    // Inicializar servicos
    chatHistoryService = new ChatHistoryService(db);

    // Criar servidor HTTP
    const httpServer = http.createServer();

    // Integrar Hono no servidor HTTP
    httpServer.on('request', app.fetch as any);

    // Integrar Advanced Features Factory e Services Endpoints
    initializeAdvancedFeatures(httpServer);

    // Integrar WebSocket Server
    webSocketServer = new WebSocketServer(httpServer, JWT_SECRET);
    console.log('[server] WebSocket Server initialized and integrated');

    // Iniciar servidor HTTP
    httpServer.listen(port, () => {
      console.log(`[server] Server running on port ${port}`);
      console.log(`[server] WebSocket endpoint: ws://localhost:${port}`);
      console.log('[server] Advanced Services available at /api/services/*');
    });

    return httpServer;
  } catch (error) {
    console.error('[server] Failed to start server:', error);
    throw error;
  }
}

/**
 * Obter instancia do WebSocket Server (para uso em outros serviços)
 */
export function getWebSocketServer(): WebSocketServer | null {
  return webSocketServer;
}