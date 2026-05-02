/**
 * Advanced Services REST Endpoints
 * 
 * Endpoints para:
 * - Pipeline Task Execution
 * - Streaming Chat
 * - Persistent Events
 * - Chat Sync
 * - Safety Net (Snapshots)
 * - Model Fallback
 * - Metrics & Monitoring
 * - Retention Policies
 * - Diagnostic Pipelines
 * - Parallel Workflows
 * - Workflow Triggers
 */

import { Hono } from 'hono';
import { requireAuth, optionalAuth, getAuthContext } from './auth-middleware';
import type {
  PipelineTaskExecutionService,
  StreamingChatService,
  PersistentEventStore,
  ChatSyncService,
  SafetyNetIntegrationService,
  ModelFallbackService,
  MetricsService,
  RetentionPolicyService,
  DiagnosticPipelineService,
  ParallelWorkflowExecutor,
  WorkflowTriggerService,
  TaskDefinition,
  TaskExecutionConfig,
  FallbackStrategy,
  RetentionPolicy,
  WorkflowStep,
} from '../../core';
import { ChatMessage } from '../../core';

export interface ServicesEndpointsConfig {
  pipelineExecutor?: PipelineTaskExecutionService;
  streamingChat?: StreamingChatService;
  eventStore?: PersistentEventStore;
  chatSync?: ChatSyncService;
  safetyNet?: SafetyNetIntegrationService;
  modelFallback?: ModelFallbackService;
  metrics?: MetricsService;
  retentionPolicy?: RetentionPolicyService;
  diagnosticPipelines?: DiagnosticPipelineService;
  workflowExecutor?: ParallelWorkflowExecutor;
  workflowTriggers?: WorkflowTriggerService;
}

export function createServicesEndpoints(config: ServicesEndpointsConfig): Hono {
  const app = new Hono();

  // ═══════════════════════════════════════════════════════════════════════════
  // PIPELINE TASK EXECUTION ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  if (config.pipelineExecutor) {
    /**
     * POST /api/services/pipeline/execute
     * Execute a task in the pipeline
     */
    app.post('/pipeline/execute', requireAuth, async (c) => {
      try {
        const body = await c.req.json<{
          taskId: string;
          agentRole: string;
          pipelineId: string;
          phaseId: string;
          title: string;
          description: string;
          context?: string;
          timeout?: number;
        }>();

        const taskDef: TaskDefinition = {
          taskId: body.taskId,
          agentRole: body.agentRole,
          pipelineId: body.pipelineId,
          phaseId: body.phaseId,
          title: body.title,
          description: body.description,
          context: body.context,
        };

        const config: TaskExecutionConfig = {
          timeout: body.timeout,
          sandboxed: true,
        };

        const result = await config.pipelineExecutor.executeTask(taskDef, config);

        return c.json({ success: result.success, result }, result.success ? 200 : 400);
      } catch (error) {
        return c.json(
          {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          500
        );
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STREAMING CHAT ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  if (config.streamingChat) {
    /**
     * POST /api/services/chat/stream/:channel
     * Start streaming chat response
     */
    app.post('/chat/stream/:channel', requireAuth, async (c) => {
      const channel = c.req.param('channel');
      const body = await c.req.json<{ messages: ChatMessage[] }>();
      const auth = getAuthContext(c);

      await config.streamingChat.createStream(c, body.messages, {
        channel,
        userId: auth.userId || 'anonymous',
        pipelineId: c.req.query('pipelineId'),
      });
    });

    /**
     * GET /api/services/chat/streams/active
     * Get active streams count
     */
    app.get('/chat/streams/active', requireAuth, (c) => {
      const count = config.streamingChat.getActiveStreamsCount();
      return c.json({ activeStreams: count });
    });

    /**
     * DELETE /api/services/chat/streams/:streamId
     * Cancel a stream
     */
    app.delete('/chat/streams/:streamId', requireAuth, (c) => {
      const streamId = c.req.param('streamId');
      config.streamingChat.cancelStream(streamId);
      return c.json({ success: true, message: 'Stream canceled' });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSISTENT EVENTS ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  if (config.eventStore) {
    /**
     * GET /api/services/events/recent
     * Get recent events
     */
    app.get('/events/recent', requireAuth, async (c) => {
      const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 100;
      const auth = getAuthContext(c);

      const events = await config.eventStore.getRecentEvents(limit, {
        projectId: c.req.query('projectId'),
        workspaceId: auth.workspaceId,
      });

      return c.json({ data: events, count: events.length });
    });

    /**
     * GET /api/services/events/by-type/:type
     * Get events by type
     */
    app.get('/events/by-type/:type', requireAuth, async (c) => {
      const type = c.req.param('type');
      const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 50;
      const auth = getAuthContext(c);

      const events = await config.eventStore.getEventsByType(type, {
        limit,
        projectId: c.req.query('projectId'),
        workspaceId: auth.workspaceId,
      });

      return c.json({ data: events, count: events.length });
    });

    /**
     * GET /api/services/events/count
     * Get event count
     */
    app.get('/events/count', requireAuth, async (c) => {
      const auth = getAuthContext(c);

      const count = await config.eventStore.getEventCount({
        projectId: c.req.query('projectId'),
        workspaceId: auth.workspaceId,
      });

      return c.json({ count });
    });

    /**
     * POST /api/services/events/export
     * Export events to JSON
     */
    app.post('/events/export', requireAuth, async (c) => {
      try {
        const body = await c.req.json<{ outputPath: string }>();
        const success = await config.eventStore.exportToJson(body.outputPath);

        return c.json({ success, path: body.outputPath });
      } catch (error) {
        return c.json(
          {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          400
        );
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHAT SYNC ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  if (config.chatSync) {
    /**
     * POST /api/services/chat-sync/sync-from-jsonl
     * Sync from JSONL to SQLite
     */
    app.post('/chat-sync/sync-from-jsonl', requireAuth, async (c) => {
      try {
        const body = await c.req.json<{ channel: string; pipelineId?: string }>();
        const status = await config.chatSync.syncFromJSONLtoSQLite(
          body.channel,
          body.pipelineId
        );

        return c.json({ success: status.status === 'success', status });
      } catch (error) {
        return c.json(
          {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          500
        );
      }
    });

    /**
     * POST /api/services/chat-sync/bidirectional
     * Bidirectional sync
     */
    app.post('/chat-sync/bidirectional', requireAuth, async (c) => {
      try {
        const body = await c.req.json<{ channel: string; pipelineId?: string }>();
        const status = await config.chatSync.bidirectionalSync(
          body.channel,
          body.pipelineId
        );

        return c.json({ success: status.status === 'success', status });
      } catch (error) {
        return c.json(
          {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          500
        );
      }
    });

    /**
     * GET /api/services/chat-sync/status/:channel
     * Get sync status
     */
    app.get('/chat-sync/status/:channel', requireAuth, (c) => {
      const channel = c.req.param('channel');
      const status = config.chatSync.getSyncStatus(channel);

      return c.json({ channel, status: status || null });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SAFETY NET (SNAPSHOTS) ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  if (config.safetyNet) {
    /**
     * GET /api/services/safety-net/snapshots/:pipelineId
     * List snapshots for pipeline
     */
    app.get('/safety-net/snapshots/:pipelineId', requireAuth, async (c) => {
      const pipelineId = c.req.param('pipelineId');
      const snapshots = await config.safetyNet.listPipelineSnapshots(pipelineId);

      return c.json({ pipelineId, snapshots, count: snapshots.length });
    });

    /**
     * POST /api/services/safety-net/rollback/:snapshotId
     * Rollback to snapshot
     */
    app.post('/safety-net/rollback/:snapshotId', requireAuth, async (c) => {
      try {
        const snapshotId = c.req.param('snapshotId');
        const body = await c.req.json<{ pipelineId: string; phaseId: string }>();

        const success = await config.safetyNet.rollbackToSnapshot(
          snapshotId,
          body.pipelineId,
          body.phaseId
        );

        return c.json({ success, snapshotId });
      } catch (error) {
        return c.json(
          {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          500
        );
      }
    });

    /**
     * POST /api/services/safety-net/cleanup/:pipelineId
     * Cleanup old snapshots
     */
    app.post('/safety-net/cleanup/:pipelineId', requireAuth, async (c) => {
      try {
        const pipelineId = c.req.param('pipelineId');
        const daysOld = c.req.query('daysOld')
          ? parseInt(c.req.query('daysOld')!, 10)
          : 7;

        const deleted = await config.safetyNet.cleanupOldSnapshots(pipelineId, daysOld);

        return c.json({ success: true, deleted, pipelineId });
      } catch (error) {
        return c.json(
          {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          500
        );
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODEL FALLBACK ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  if (config.modelFallback) {
    /**
     * GET /api/services/models/stats/:model
     * Get model statistics
     */
    app.get('/models/stats/:model', requireAuth, (c) => {
      const model = c.req.param('model');
      const stats = config.modelFallback.getModelStats(model);
      const successRate = config.modelFallback.getSuccessRate(model);

      return c.json({ model, stats, successRate: `${successRate.toFixed(2)}%` });
    });

    /**
     * GET /api/services/models/recommend
     * Get recommended fallback strategy
     */
    app.get('/models/recommend', requireAuth, (c) => {
      const primaryModel = c.req.query('primaryModel') || 'gpt-5.4-mini';
      const strategy = config.modelFallback.recommendFallbackStrategy(primaryModel);

      return c.json({ strategy });
    });

    /**
     * POST /api/services/models/reset-stats
     * Reset model statistics
     */
    app.post('/models/reset-stats', requireAuth, (c) => {
      config.modelFallback.resetStats();
      return c.json({ success: true, message: 'Model statistics reset' });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // METRICS ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  if (config.metrics) {
    /**
     * GET /api/services/metrics
     * Get metrics
     */
    app.get('/metrics', requireAuth, (c) => {
      const period = (c.req.query('period') as 'hour' | 'day' | 'week') || 'day';
      const metrics = config.metrics.getMetrics(period);

      return c.json({ metrics });
    });

    /**
     * GET /api/services/metrics/pipeline/:pipelineId
     * Get pipeline metrics
     */
    app.get('/metrics/pipeline/:pipelineId', requireAuth, (c) => {
      const pipelineId = c.req.param('pipelineId');
      const metrics = config.metrics.getPipelineMetrics(pipelineId);

      return c.json({ pipelineId, metrics });
    });

    /**
     * GET /api/services/metrics/alerts
     * Get active alerts
     */
    app.get('/metrics/alerts', requireAuth, (c) => {
      const alerts = config.metrics.getActiveAlerts();

      return c.json({ alerts, count: alerts.length });
    });

    /**
     * POST /api/services/metrics/alerts/:alertId/resolve
     * Resolve alert
     */
    app.post('/metrics/alerts/:alertId/resolve', requireAuth, (c) => {
      const alertId = c.req.param('alertId');
      config.metrics.resolveAlert(alertId);

      return c.json({ success: true, alertId });
    });

    /**
     * GET /api/services/metrics/export
     * Export metrics data
     */
    app.get('/metrics/export', requireAuth, (c) => {
      const period = (c.req.query('period') as 'hour' | 'day' | 'week') || 'day';
      const data = config.metrics.exportMetricsData(period);

      return c.json(data);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RETENTION POLICY ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  if (config.retentionPolicy) {
    /**
     * POST /api/services/retention/start
     * Start retention policy scheduler
     */
    app.post('/retention/start', requireAuth, async (c) => {
      try {
        await config.retentionPolicy.start();
        return c.json({ success: true, message: 'Retention policy started' });
      } catch (error) {
        return c.json(
          {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          500
        );
      }
    });

    /**
     * POST /api/services/retention/stop
     * Stop retention policy scheduler
     */
    app.post('/retention/stop', requireAuth, async (c) => {
      try {
        await config.retentionPolicy.stop();
        return c.json({ success: true, message: 'Retention policy stopped' });
      } catch (error) {
        return c.json(
          {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          500
        );
      }
    });

    /**
     * POST /api/services/retention/cleanup
     * Run manual cleanup
     */
    app.post('/retention/cleanup', requireAuth, async (c) => {
      try {
        const result = await config.retentionPolicy.runManualCleanup();

        return c.json({ success: true, result });
      } catch (error) {
        return c.json(
          {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          500
        );
      }
    });

    /**
     * GET /api/services/retention/policy
     * Get current policy
     */
    app.get('/retention/policy', requireAuth, (c) => {
      const policy = config.retentionPolicy.getPolicy();

      return c.json({ policy });
    });

    /**
     * PATCH /api/services/retention/policy
     * Update retention policy
     */
    app.patch('/retention/policy', requireAuth, async (c) => {
      try {
        const body = await c.req.json<Partial<RetentionPolicy>>();
        config.retentionPolicy.updatePolicy(body);

        return c.json({ success: true, policy: config.retentionPolicy.getPolicy() });
      } catch (error) {
        return c.json(
          {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          400
        );
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DIAGNOSTIC PIPELINE ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  if (config.diagnosticPipelines) {
    /**
     * POST /api/services/diagnostic/create
     * Create diagnostic sub-pipeline
     */
    app.post('/diagnostic/create', requireAuth, async (c) => {
      try {
        const body = await c.req.json<{
          parentPipelineId: string;
          reason: string;
          phaseId?: string;
          error?: string;
        }>();

        // TODO: Get parent pipeline from database
        const diagnostic = await config.diagnosticPipelines.createDiagnosticSubPipeline(
          {} as any, // Will need actual pipeline object
          body.reason as any,
          {
            phaseId: body.phaseId,
            error: body.error,
          }
        );

        return c.json({ success: true, diagnostic }, 201);
      } catch (error) {
        return c.json(
          {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          500
        );
      }
    });

    /**
     * GET /api/services/diagnostic/:diagnosticId
     * Get diagnostic pipeline
     */
    app.get('/diagnostic/:diagnosticId', requireAuth, (c) => {
      const diagnosticId = c.req.param('diagnosticId');
      const diagnostic = config.diagnosticPipelines.getDiagnosticPipeline(diagnosticId);

      if (!diagnostic) {
        return c.json({ error: 'Diagnostic not found' }, 404);
      }

      return c.json({ diagnostic });
    });

    /**
     * GET /api/services/diagnostic/report/:diagnosticId
     * Get diagnostic report
     */
    app.get('/diagnostic/report/:diagnosticId', requireAuth, (c) => {
      const diagnosticId = c.req.param('diagnosticId');
      const report = config.diagnosticPipelines.getDiagnosticReport(diagnosticId);

      if (!report) {
        return c.json({ error: 'Diagnostic not found' }, 404);
      }

      return c.json({ report });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PARALLEL WORKFLOW EXECUTOR ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  if (config.workflowExecutor) {
    /**
     * POST /api/services/workflows/execute
     * Execute parallel workflow
     */
    app.post('/workflows/execute', requireAuth, async (c) => {
      try {
        const body = await c.req.json<{
          steps: WorkflowStep[];
          maxParallel?: number;
        }>();

        const results = await config.workflowExecutor.executeWorkflow(
          body.steps,
          body.maxParallel
        );

        const resultsArray = Array.from(results.entries()).map(([stepId, execution]) => ({
          stepId,
          ...execution,
        }));

        return c.json({ success: true, results: resultsArray });
      } catch (error) {
        return c.json(
          {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          500
        );
      }
    });

    /**
     * GET /api/services/workflows/executions
     * Get active executions
     */
    app.get('/workflows/executions', requireAuth, (c) => {
      const executions = config.workflowExecutor.getActiveExecutions();

      return c.json({ executions, count: executions.length });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WORKFLOW TRIGGER ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  if (config.workflowTriggers) {
    /**
     * POST /api/services/triggers/event
     * Register event trigger
     */
    app.post('/triggers/event', requireAuth, async (c) => {
      try {
        const body = await c.req.json<{
          workflowId: string;
          eventType: string;
          eventFilter?: Record<string, any>;
        }>();

        const trigger = config.workflowTriggers.registerEventTrigger(
          body.workflowId,
          body.eventType,
          body.eventFilter
        );

        return c.json({ success: true, trigger }, 201);
      } catch (error) {
        return c.json(
          {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          400
        );
      }
    });

    /**
     * POST /api/services/triggers/schedule
     * Register schedule trigger (cron)
     */
    app.post('/triggers/schedule', requireAuth, async (c) => {
      try {
        const body = await c.req.json<{
          workflowId: string;
          cronExpression: string;
          timezone?: string;
        }>();

        const trigger = config.workflowTriggers.registerScheduleTrigger(
          body.workflowId,
          body.cronExpression,
          body.timezone
        );

        return c.json({ success: true, trigger }, 201);
      } catch (error) {
        return c.json(
          {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          400
        );
      }
    });

    /**
     * POST /api/services/triggers/webhook
     * Register webhook trigger
     */
    app.post('/triggers/webhook', requireAuth, async (c) => {
      try {
        const body = await c.req.json<{
          workflowId: string;
          secret?: string;
          ipWhitelist?: string[];
        }>();

        const trigger = config.workflowTriggers.registerWebhookTrigger(
          body.workflowId,
          body.secret,
          body.ipWhitelist
        );

        return c.json({ success: true, trigger }, 201);
      } catch (error) {
        return c.json(
          {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          400
        );
      }
    });

    /**
     * GET /api/services/triggers/workflow/:workflowId
     * List triggers for workflow
     */
    app.get('/triggers/workflow/:workflowId', requireAuth, (c) => {
      const workflowId = c.req.param('workflowId');
      const triggers = config.workflowTriggers.getWorkflowTriggers(workflowId);

      return c.json({ workflowId, triggers, count: triggers.length });
    });

    /**
     * POST /api/services/triggers/:triggerId/disable
     * Disable trigger
     */
    app.post('/triggers/:triggerId/disable', requireAuth, (c) => {
      const triggerId = c.req.param('triggerId');
      config.workflowTriggers.disableTrigger(triggerId);

      return c.json({ success: true, triggerId });
    });

    /**
     * POST /api/services/triggers/:triggerId/enable
     * Enable trigger
     */
    app.post('/triggers/:triggerId/enable', requireAuth, (c) => {
      const triggerId = c.req.param('triggerId');
      config.workflowTriggers.enableTrigger(triggerId);

      return c.json({ success: true, triggerId });
    });

    /**
     * DELETE /api/services/triggers/:triggerId
     * Delete trigger
     */
    app.delete('/triggers/:triggerId', requireAuth, (c) => {
      const triggerId = c.req.param('triggerId');
      config.workflowTriggers.deleteTrigger(triggerId);

      return c.json({ success: true, triggerId });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTH CHECK
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/services/health
   * Health check for all advanced services
   */
  app.get('/health', optionalAuth, (c) => {
    const status = {
      pipelineExecutor: !!config.pipelineExecutor,
      streamingChat: !!config.streamingChat,
      eventStore: !!config.eventStore,
      chatSync: !!config.chatSync,
      safetyNet: !!config.safetyNet,
      modelFallback: !!config.modelFallback,
      metrics: !!config.metrics,
      retentionPolicy: !!config.retentionPolicy,
      diagnosticPipelines: !!config.diagnosticPipelines,
      workflowExecutor: !!config.workflowExecutor,
      workflowTriggers: !!config.workflowTriggers,
      timestamp: new Date().toISOString(),
    };

    return c.json(status);
  });

  return app;
}
