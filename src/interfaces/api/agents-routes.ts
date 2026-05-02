import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { DataSource } from 'typeorm';
import {
  AgentService,
  TaskService,
  WorkflowService,
  SecurityAnalysisService,
  ExecutionLogService,
} from '../../core';
import { z } from 'zod';

const router = Router();

// Services will be initialized by the calling application
let agentService: AgentService;
let taskService: TaskService;
let workflowService: WorkflowService;
let securityService: SecurityAnalysisService;
let logService: ExecutionLogService;

function resolveWorkspaceId(req: Request): string | null {
  const userWorkspaceId = (req as any).user?.workspaceId as string | undefined;
  const queryWorkspaceId = req.query.workspaceId as string | undefined;
  if (userWorkspaceId && queryWorkspaceId && userWorkspaceId !== queryWorkspaceId) {
    return null;
  }
  return userWorkspaceId || queryWorkspaceId || null;
}

export function initializeAgentRoutes(db: DataSource) {
  agentService = new AgentService(db);
  taskService = new TaskService(db);
  workflowService = new WorkflowService(db);
  securityService = new SecurityAnalysisService(db);
  logService = new ExecutionLogService(db);
  return router;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENTS
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/api/v1/agents', async (req: Request, res: Response) => {
  try {
    const { workspaceId, name, description, capabilities, config } = req.body;

    if (!workspaceId || !name || !capabilities) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required fields: workspaceId, name, capabilities',
        },
        timestamp: new Date().toISOString(),
      });
    }

    const agent = await agentService.create({
      workspaceId,
      name,
      description,
      capabilities,
      config,
    });

    res.status(201).json({
      success: true,
      data: agent,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to create agent' },
      timestamp: new Date().toISOString(),
    });
  }
});

router.get('/api/v1/agents', async (req: Request, res: Response) => {
  try {
    const workspaceId = resolveWorkspaceId(req);
    if (!workspaceId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'workspaceId required' },
        timestamp: new Date().toISOString(),
      });
    }

    const agents = await agentService.listByWorkspace(workspaceId as string);
    res.json({
      success: true,
      data: agents,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to list agents' },
      timestamp: new Date().toISOString(),
    });
  }
});

router.get('/api/v1/agents/:agentId', async (req: Request, res: Response) => {
  try {
    const agent = await agentService.getById(req.params.agentId);
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Agent not found' },
        timestamp: new Date().toISOString(),
      });
    }
    res.json({
      success: true,
      data: agent,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get agent' },
      timestamp: new Date().toISOString(),
    });
  }
});

router.patch('/api/v1/agents/:agentId', async (req: Request, res: Response) => {
  try {
    const agent = await agentService.update(req.params.agentId, req.body);
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Agent not found' },
        timestamp: new Date().toISOString(),
      });
    }
    res.json({
      success: true,
      data: agent,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to update agent' },
      timestamp: new Date().toISOString(),
    });
  }
});

router.post('/api/v1/agents/:agentId/start', async (req: Request, res: Response) => {
  try {
    const agent = await agentService.setState(req.params.agentId, 'running');
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Agent not found' },
        timestamp: new Date().toISOString(),
      });
    }
    res.json({
      success: true,
      data: { message: 'Agent started', agent },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to start agent' },
      timestamp: new Date().toISOString(),
    });
  }
});

router.post('/api/v1/agents/:agentId/stop', async (req: Request, res: Response) => {
  try {
    const agent = await agentService.setState(req.params.agentId, 'stopped');
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Agent not found' },
        timestamp: new Date().toISOString(),
      });
    }
    res.json({
      success: true,
      data: { message: 'Agent stopped', agent },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to stop agent' },
      timestamp: new Date().toISOString(),
    });
  }
});

router.get('/api/v1/agents/:agentId/metrics', async (req: Request, res: Response) => {
  try {
    const agent = await agentService.getById(req.params.agentId);
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Agent not found' },
        timestamp: new Date().toISOString(),
      });
    }

    const successRate = agent.tasksCompleted + agent.tasksFailed > 0
      ? agent.tasksCompleted / (agent.tasksCompleted + agent.tasksFailed)
      : 0;

    res.json({
      success: true,
      data: {
        agentId: agent.id,
        tasksCompleted: agent.tasksCompleted,
        tasksFailed: agent.tasksFailed,
        successRate,
        state: agent.state,
        lastActivityAt: agent.lastActivityAt,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get metrics' },
      timestamp: new Date().toISOString(),
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TASKS
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/api/v1/tasks', async (req: Request, res: Response) => {
  try {
    const { workspaceId, agentId, type, description, input } = req.body;

    if (!workspaceId || !agentId || !type || !description) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required fields',
        },
        timestamp: new Date().toISOString(),
      });
    }

    const task = await taskService.create({
      workspaceId,
      agentId,
      type,
      description,
      input: input || {},
    });

    res.status(201).json({
      success: true,
      data: task,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to create task' },
      timestamp: new Date().toISOString(),
    });
  }
});

router.get('/api/v1/tasks', async (req: Request, res: Response) => {
  try {
    const { agentId, status } = req.query;
    const workspaceId = resolveWorkspaceId(req);

    if (!workspaceId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'workspaceId required' },
        timestamp: new Date().toISOString(),
      });
    }

    const tasks = agentId
      ? await taskService.listByAgent(agentId as string, status as any)
      : await taskService.listByWorkspace(workspaceId as string, status as any);

    res.json({
      success: true,
      data: tasks,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to list tasks' },
      timestamp: new Date().toISOString(),
    });
  }
});

router.get('/api/v1/tasks/:taskId', async (req: Request, res: Response) => {
  try {
    const task = await taskService.getById(req.params.taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Task not found' },
        timestamp: new Date().toISOString(),
      });
    }
    res.json({
      success: true,
      data: task,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get task' },
      timestamp: new Date().toISOString(),
    });
  }
});

router.post('/api/v1/tasks/:taskId/execute', async (req: Request, res: Response) => {
  try {
    const task = await taskService.start(req.params.taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Task not found' },
        timestamp: new Date().toISOString(),
      });
    }
    res.json({
      success: true,
      data: { message: 'Task execution started', task },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to execute task' },
      timestamp: new Date().toISOString(),
    });
  }
});

router.post('/api/v1/tasks/:taskId/pause', async (req: Request, res: Response) => {
  try {
    const task = await taskService.pause(req.params.taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Task not found' },
        timestamp: new Date().toISOString(),
      });
    }
    res.json({
      success: true,
      data: task,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to pause task' },
      timestamp: new Date().toISOString(),
    });
  }
});

router.post('/api/v1/tasks/:taskId/resume', async (req: Request, res: Response) => {
  try {
    const task = await taskService.resume(req.params.taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Task not found' },
        timestamp: new Date().toISOString(),
      });
    }
    res.json({
      success: true,
      data: task,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to resume task' },
      timestamp: new Date().toISOString(),
    });
  }
});

router.post('/api/v1/tasks/:taskId/cancel', async (req: Request, res: Response) => {
  try {
    const task = await taskService.cancel(req.params.taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Task not found' },
        timestamp: new Date().toISOString(),
      });
    }
    res.json({
      success: true,
      data: task,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to cancel task' },
      timestamp: new Date().toISOString(),
    });
  }
});

router.get('/api/v1/tasks/:taskId/logs', async (req: Request, res: Response) => {
  try {
    const logs = await logService.getTaskLogs(req.params.taskId);
    res.json({
      success: true,
      data: logs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get task logs' },
      timestamp: new Date().toISOString(),
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// WORKFLOWS
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/api/v1/workflows', async (req: Request, res: Response) => {
  try {
    const { workspaceId, name, description, steps, triggers, schedule, retryPolicy } = req.body;

    if (!workspaceId || !name || !steps) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required fields: workspaceId, name, steps',
        },
        timestamp: new Date().toISOString(),
      });
    }

    const workflow = await workflowService.create({
      workspaceId,
      name,
      description,
      steps,
      triggers: triggers || [],
      schedule,
      retryPolicy,
    });

    res.status(201).json({
      success: true,
      data: workflow,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to create workflow' },
      timestamp: new Date().toISOString(),
    });
  }
});

router.get('/api/v1/workflows', async (req: Request, res: Response) => {
  try {
    const workspaceId = resolveWorkspaceId(req);
    if (!workspaceId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'workspaceId required' },
        timestamp: new Date().toISOString(),
      });
    }

    const workflows = await workflowService.listByWorkspace(workspaceId);
    res.json({
      success: true,
      data: workflows,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to list workflows' },
      timestamp: new Date().toISOString(),
    });
  }
});

router.post('/api/v1/workflows/:workflowId/execute', async (req: Request, res: Response) => {
  try {
    const workflow = await workflowService.getById(req.params.workflowId);
    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Workflow not found' },
        timestamp: new Date().toISOString(),
      });
    }

    // Record execution start
    const execution = {
      id: crypto.randomUUID(),
      startedAt: new Date(),
      status: 'running' as const,
      tasksRun: 0,
      tasksFailed: 0,
    };

    await workflowService.recordExecution(req.params.workflowId, execution);

    res.json({
      success: true,
      data: { message: 'Workflow execution started', execution },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to execute workflow' },
      timestamp: new Date().toISOString(),
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/api/v1/security/analyze', async (req: Request, res: Response) => {
  try {
    const {
      workspaceId,
      targetId,
      targetName,
      type,
      vulnerabilities,
      recommendations,
      scanMethod,
      durationMs,
    } = req.body;

    if (!workspaceId || !targetId || !type) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required fields',
        },
        timestamp: new Date().toISOString(),
      });
    }

    const analysis = await securityService.create({
      workspaceId,
      targetId,
      targetName: targetName || 'Unknown',
      type,
      vulnerabilities: vulnerabilities || [],
      recommendations: recommendations || [],
      scanMethod,
      durationMs,
    });

    res.status(201).json({
      success: true,
      data: analysis,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error?.message || 'Failed to create security analysis',
      },
      timestamp: new Date().toISOString(),
    });
  }
});

router.get('/api/v1/security/results/:resultId', async (req: Request, res: Response) => {
  try {
    const analysis = await securityService.getById(req.params.resultId);
    if (!analysis) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Analysis not found' },
        timestamp: new Date().toISOString(),
      });
    }
    res.json({
      success: true,
      data: analysis,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get analysis' },
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
