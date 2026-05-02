#!/usr/bin/env node

import express, { Application, NextFunction, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import {
  getDatabase,
  AuthService,
  WorkspaceService,
  ProjectService,
  OrchestratorRuntimeService,
} from '../../core';
import type { ApiResponse } from '../../core';
import { signupSchema, loginSchema, createWorkspaceSchema } from '../../core';
import { z } from 'zod';

const app: Application = express();
const PORT = process.env.PORT || 3000;
const API_VERSION = 'v1';
const BASE_URL = `/api/${API_VERSION}`;

// ═══════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Compression
app.use(compression());

// Request logging (simple version)
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

interface RequestWithUser extends express.Request {
  userId?: string;
  email?: string;
  user?: any;
}

function successResponse<T>(data: T, message?: string): ApiResponse<T> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };
}

function errorResponse(code: string, message: string, details?: any): ApiResponse<any> {
  return {
    success: false,
    error: { code, message, details },
    timestamp: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTHENTICATION MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

let authService: AuthService;

const authenticate = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(errorResponse('UNAUTHORIZED', 'Missing or invalid token'));
    }

    const token = authHeader.substring(7);
    const user = await authService.validateToken(token);

    if (!user) {
      return res.status(401).json(errorResponse('UNAUTHORIZED', 'Invalid or expired token'));
    }

    req.userId = user.id;
    req.email = user.email;
    req.user = user;
    next();
  } catch (error) {
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Authentication failed'));
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES: HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Vigil API',
    version: API_VERSION,
    timestamp: new Date().toISOString(),
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES: AUTHENTICATION
// ═══════════════════════════════════════════════════════════════════════════════

app.post(`${BASE_URL}/auth/signup`, async (req: RequestWithUser, res: Response) => {
  try {
    const input = signupSchema.parse(req.body);
    const { user, token } = await authService.signup({
      email: input.email,
      password: input.password,
      fullName: input.fullName,
    });

    res.status(201).json(successResponse({
      user: { id: user.id, email: user.email, fullName: user.fullName },
      token,
    }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid input', error.flatten()));
    }
    if (error instanceof Error) {
      return res.status(400).json(errorResponse('AUTH_ERROR', error.message));
    }
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Signup failed'));
  }
});

app.post(`${BASE_URL}/auth/login`, async (req: RequestWithUser, res: Response) => {
  try {
    const input = loginSchema.parse(req.body);
    const { user, token } = await authService.login({
      email: input.email,
      password: input.password,
    });

    res.json(successResponse({
      user: { id: user.id, email: user.email, fullName: user.fullName },
      token,
    }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid input', error.flatten()));
    }
    if (error instanceof Error) {
      return res.status(401).json(errorResponse('AUTH_ERROR', error.message));
    }
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Login failed'));
  }
});

app.post(`${BASE_URL}/auth/refresh`, authenticate, async (req: RequestWithUser, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.substring(7) || '';
    const newToken = await authService.refreshToken(token);
    res.json(successResponse({ token: newToken }));
  } catch (error) {
    res.status(401).json(errorResponse('AUTH_ERROR', 'Token refresh failed'));
  }
});

app.get(`${BASE_URL}/auth/me`, authenticate, (_req: RequestWithUser, res: Response) => {
  res.json(successResponse({ user: _req.user }));
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES: WORKSPACES
// ═══════════════════════════════════════════════════════════════════════════════

let workspaceService: WorkspaceService;

app.post(`${BASE_URL}/workspaces`, authenticate, async (req: RequestWithUser, res: Response) => {
  try {
    const input = createWorkspaceSchema.parse(req.body);
    const workspace = await workspaceService.create({
      name: input.name,
      slug: input.slug,
      description: input.description,
      ownerId: req.userId!,
    });
    res.status(201).json(successResponse(workspace));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid input', error.flatten()));
    }
    if (error instanceof Error) {
      return res.status(400).json(errorResponse('WORKSPACE_ERROR', error.message));
    }
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to create workspace'));
  }
});

app.get(`${BASE_URL}/workspaces`, authenticate, async (req: RequestWithUser, res: Response) => {
  try {
    const workspaces = await workspaceService.listByUser(req.userId!);
    res.json(successResponse(workspaces));
  } catch (error) {
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to list workspaces'));
  }
});

app.get(`${BASE_URL}/workspaces/:workspaceId`, authenticate, async (req: RequestWithUser, res: Response) => {
  try {
    const workspace = await workspaceService.getById(req.params.workspaceId);
    if (!workspace) {
      return res.status(404).json(errorResponse('NOT_FOUND', 'Workspace not found'));
    }
    res.json(successResponse(workspace));
  } catch (error) {
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to get workspace'));
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES: PROJECTS
// ═══════════════════════════════════════════════════════════════════════════════

let projectService: ProjectService;
let orchestratorRuntimeService: OrchestratorRuntimeService;

app.get(`${BASE_URL}/projects`, authenticate, async (req: RequestWithUser, res: Response) => {
  try {
    const projects = await projectService.list();
    res.json(successResponse(projects));
  } catch (error) {
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to list projects'));
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES: ADAPTIVE ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════════════════

app.post(`${BASE_URL}/orchestrator/plans`, authenticate, async (req: RequestWithUser, res: Response) => {
  try {
    const {
      workspaceId,
      projectId,
      objective,
      constraints,
      availableModalities,
      contextBudgetTokens,
      priority,
      deadlineMinutes,
      policy,
      policyApproval,
    } = req.body;

    if (!workspaceId || !objective) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR', 'workspaceId and objective are required'));
    }

    const result = await orchestratorRuntimeService.createPlan({
      workspaceId,
      projectId,
      createdByUserId: req.userId,
      request: {
        objective,
        constraints,
        availableModalities,
        contextBudgetTokens,
        priority,
        deadlineMinutes,
      },
      policy,
      policyApproval,
    });

    res.status(201).json(successResponse({
      plan: result.plan,
      warnings: result.warnings,
    }));
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json(errorResponse('ORCHESTRATOR_ERROR', error.message));
    }
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to create orchestrator plan'));
  }
});

app.get(`${BASE_URL}/orchestrator/plans`, authenticate, async (req: RequestWithUser, res: Response) => {
  try {
    const workspaceId = req.query.workspaceId as string;
    if (!workspaceId) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR', 'workspaceId is required'));
    }

    const plans = await orchestratorRuntimeService.listPlans(workspaceId);
    res.json(successResponse(plans));
  } catch (error) {
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to list orchestrator plans'));
  }
});

app.get(`${BASE_URL}/orchestrator/plans/:planId`, authenticate, async (req: RequestWithUser, res: Response) => {
  try {
    const plan = await orchestratorRuntimeService.getPlan(req.params.planId);
    if (!plan) {
      return res.status(404).json(errorResponse('NOT_FOUND', 'Orchestrator plan not found'));
    }
    res.json(successResponse(plan));
  } catch (error) {
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to get orchestrator plan'));
  }
});

app.get(`${BASE_URL}/orchestrator/plans/:planId/audit`, authenticate, async (req: RequestWithUser, res: Response) => {
  try {
    const audit = await orchestratorRuntimeService.listPolicyAudits(req.params.planId);
    res.json(successResponse(audit));
  } catch (error) {
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to list policy audits'));
  }
});

app.post(`${BASE_URL}/orchestrator/runs`, authenticate, async (req: RequestWithUser, res: Response) => {
  try {
    const { workspaceId, planId, executionAgentId, autoExecute } = req.body;
    if (!workspaceId || !planId) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR', 'workspaceId and planId are required'));
    }

    const run = await orchestratorRuntimeService.startRun({
      workspaceId,
      planId,
      executionAgentId,
      requestedByUserId: req.userId,
      autoExecute,
    });

    res.status(201).json(successResponse(run));
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json(errorResponse('ORCHESTRATOR_ERROR', error.message));
    }
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to start orchestrator run'));
  }
});

app.get(`${BASE_URL}/orchestrator/runs`, authenticate, async (req: RequestWithUser, res: Response) => {
  try {
    const workspaceId = req.query.workspaceId as string;
    const status = req.query.status as string | undefined;

    if (!workspaceId) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR', 'workspaceId is required'));
    }

    const runs = await orchestratorRuntimeService.listRuns(workspaceId, status);
    res.json(successResponse(runs));
  } catch (error) {
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to list orchestrator runs'));
  }
});

app.get(`${BASE_URL}/orchestrator/runs/:runId`, authenticate, async (req: RequestWithUser, res: Response) => {
  try {
    const run = await orchestratorRuntimeService.getRun(req.params.runId);
    if (!run) {
      return res.status(404).json(errorResponse('NOT_FOUND', 'Orchestrator run not found'));
    }
    res.json(successResponse(run));
  } catch (error) {
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to get orchestrator run'));
  }
});

app.post(`${BASE_URL}/orchestrator/runs/:runId/execute`, authenticate, async (req: RequestWithUser, res: Response) => {
  try {
    const run = await orchestratorRuntimeService.executeRun(req.params.runId);
    res.json(successResponse(run));
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json(errorResponse('ORCHESTRATOR_ERROR', error.message));
    }
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to execute orchestrator run'));
  }
});

app.post(`${BASE_URL}/orchestrator/runs/:runId/pause`, authenticate, async (req: RequestWithUser, res: Response) => {
  try {
    const run = await orchestratorRuntimeService.pauseRun(req.params.runId);
    res.json(successResponse(run));
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json(errorResponse('ORCHESTRATOR_ERROR', error.message));
    }
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to pause orchestrator run'));
  }
});

app.post(`${BASE_URL}/orchestrator/runs/:runId/resume`, authenticate, async (req: RequestWithUser, res: Response) => {
  try {
    const run = await orchestratorRuntimeService.resumeRun(req.params.runId);
    res.json(successResponse(run));
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json(errorResponse('ORCHESTRATOR_ERROR', error.message));
    }
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to resume orchestrator run'));
  }
});

app.get(`${BASE_URL}/orchestrator/runs/:runId/checkpoints`, authenticate, async (req: RequestWithUser, res: Response) => {
  try {
    const checkpoints = await orchestratorRuntimeService.getCheckpoints(req.params.runId);
    res.json(successResponse(checkpoints));
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json(errorResponse('ORCHESTRATOR_ERROR', error.message));
    }
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to list checkpoints'));
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SERVER INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

async function startServer() {
  try {
    console.log('Initializing Vigil API...');

    // Initialize database
    const db = await getDatabase();
    console.log('✓ Database connected');

    // Initialize services
    authService = new AuthService(db);
    workspaceService = new WorkspaceService(db);
    projectService = new ProjectService(db);
    orchestratorRuntimeService = new OrchestratorRuntimeService(db);
    console.log('✓ Services initialized');


    // Error handling (must be last)
    app.use((_req, res) => {
      res.status(404).json(errorResponse('NOT_FOUND', 'Route not found'));
    });

    app.use((error: any, _req: express.Request, res: Response, _next: NextFunction) => {
      console.error('Unhandled error:', error);
      res.status(500).json(errorResponse('INTERNAL_ERROR', 'An unexpected error occurred'));
    });

    // Start server
    app.listen(PORT, () => {
      console.log(`\n✓ Vigil API Server running at http://localhost:${PORT}`);
      console.log(`  Base URL: ${BASE_URL}`);
      console.log(`  Health check: GET http://localhost:${PORT}/health`);
      console.log(`  API Docs: coming soon...\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
