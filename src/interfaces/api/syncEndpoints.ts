/**
 * Auto-Sync REST API Endpoints
 * 
 * Endpoints para gerenciamento de configuracoes de sync automatico
 * e controle do scheduler de sync.
 * 
 * Base path: /api/sync
 */

import { Hono } from 'hono';
import { DataSource } from 'typeorm';
import {
  SyncConfigService,
  AutoSyncService,
} from '../../core';

export interface SyncEndpointsConfig {
  db: DataSource;
  autoSyncService?: AutoSyncService;
}

export function createSyncEndpoints(config: SyncEndpointsConfig): Hono {
  const app = new Hono();
  const syncConfigService = new SyncConfigService(config.db);
  const autoSyncService = config.autoSyncService ?? new AutoSyncService(config.db);

  // GET /configs - List all sync configs
  app.get('/configs', async (c) => {
    try {
      const projectId = c.req.query('projectId');
      const configs = await syncConfigService.list(projectId);
      return c.json({ success: true, data: configs, count: configs.length });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  // GET /configs/:id - Get single config
  app.get('/configs/:id', async (c) => {
    try {
      const id = c.req.param('id');
      const config = await syncConfigService.get(id);
      if (!config) return c.json({ success: false, error: 'Not found' }, 404);
      return c.json({ success: true, data: config });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  // POST /configs - Create new config
  app.post('/configs', async (c) => {
    try {
      const body = await c.req.json();
      const config = await syncConfigService.create(body);
      return c.json({ success: true, data: config }, 201);
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 400);
    }
  });

  // PATCH /configs/:id - Update config
  app.patch('/configs/:id', async (c) => {
    try {
      const id = c.req.param('id');
      const body = await c.req.json();
      const config = await syncConfigService.update(id, body);
      return c.json({ success: true, data: config });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 400);
    }
  });

  // DELETE /configs/:id - Delete config
  app.delete('/configs/:id', async (c) => {
    try {
      const id = c.req.param('id');
      await syncConfigService.delete(id);
      return c.json({ success: true, message: 'Deleted' });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  // POST /configs/:id/execute - Execute sync manually
  app.post('/configs/:id/execute', async (c) => {
    try {
      const id = c.req.param('id');
      const config = await syncConfigService.get(id);
      if (!config) return c.json({ success: false, error: 'Not found' }, 404);
      const result = await syncConfigService.executeSyncForConfig(config);
      return c.json({ success: true, data: result });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  // GET /scheduler/status - Get scheduler status
  app.get('/scheduler/status', (c) => {
    const status = autoSyncService.getStatus();
    return c.json({ success: true, data: status });
  });

  // POST /scheduler/start - Start scheduler
  app.post('/scheduler/start', async (c) => {
    try {
      await autoSyncService.start();
      return c.json({ success: true, message: 'Started', data: autoSyncService.getStatus() });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  // POST /scheduler/stop - Stop scheduler
  app.post('/scheduler/stop', (c) => {
    autoSyncService.stop();
    return c.json({ success: true, message: 'Stopped' });
  });

  // GET /targets - List available sync targets
  app.get('/targets', (c) => {
    return c.json({
      success: true,
      data: [
        { id: 'copilot', name: 'GitHub Copilot', defaultPath: '.github/copilot-instructions.md' },
        { id: 'claude', name: 'Claude', defaultPath: 'CLAUDE.md' },
        { id: 'cursor', name: 'Cursor', defaultPath: '.cursorrules' },
        { id: 'windsurf', name: 'Windsurf', defaultPath: '.windsurfrules' },
        { id: 'vscode', name: 'VS Code', defaultPath: '.vscode/settings.json' },
        { id: 'jetbrains', name: 'JetBrains', defaultPath: '.idea/README.md' },
      ],
    });
  });

  return app;
}

export { SyncConfigService, AutoSyncService };