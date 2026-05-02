/**
 * Vigil Core
 *
 * Re-exports all modules for use by interfaces (api, cli, dashboard).
 */

// Database & Storage
export { getDatabase, DataSource } from './database';
export * from './export';

// Services
export * from './services/ActionLogService';
export * from './services/SnapshotService';
export * from './services/RollbackService';
export * from '../utils/safePath';
export * from './chat';
export * from './services';

// Events (now in src/observation)
export * from '../observation';

// Pipeline
export * from './pipeline';

// Agent Config
export * from './agent-config';

// Local execution environment
export * from './environments/LocalEnvironment';
export * from './models/LitellmModel';

// Pipeline System
export * as PipelineV2 from './pipeline';

export {
    type PhaseConfig,
    type PipelineTemplate,
    type PipelineSettings,
    type TaskDescription,
    type PipelineEvent,
    type PipelineEventType,
} from './pipeline/contracts';

// API Types
export type { ApiResponse, PaginatedResponse, ApiErrorResponse, AuthenticatedRequest } from './types/api';

// Tools (file, search, docker)
export * from './tools';

// Skills
export * from './skills';

// MCP client
export * from './mcp-client';

// Agentic task runner
export * from './tasks';

// Multi-provider AI client
export {
    multiProviderChat,
    testMultiProviderConnection,
    discoverLocalModels,
    checkLocalService,
    PROVIDER_PRESETS,
    OPENAI_COMPATIBLE_PROVIDERS,
    type MultiProviderMessage,
    type MultiProviderSettings,
    type ProviderConfig,
} from './providers/multi-provider';

// Validation schemas
export {
    signupSchema,
    loginSchema,
    createWorkspaceSchema,
    updateWorkspaceSchema,
    createProjectSchema,
    updateProjectSchema,
    createContextEntrySchema,
    updateContextEntrySchema,
    createDecisionSchema,
    updateDecisionSchema,
    createApiKeySchema,
    type SignupInput,
    type LoginInput,
    type CreateWorkspaceInput,
    type CreateProjectInput,
} from './validation/schemas';
