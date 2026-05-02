import type { SnapshotService } from '../services/SnapshotService';
import type { ActionLogService } from '../services/ActionLogService';
import {
  readFile,
  writeFile,
  listFiles,
  runCommand,
  type CommandValidationResult,
  type ToolContext,
  type ReadFileInput,
  type WriteFileInput,
  type ListFilesInput,
  type RunCommandInput,
  type RunCommandOptions,
  type ToolResult,
} from '../tools';

export interface LocalEnvironmentOptions {
  workspaceRoot: string;
  pipelineId?: string;
  phaseIndex?: number;
  phaseName?: string;
  taskId?: string;
  agentRole?: string;
  dryRun?: boolean;
  snapshotService?: SnapshotService;
  actionLogService?: ActionLogService;
}

export class LocalEnvironment {
  private ctx: ToolContext;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  static create(options: LocalEnvironmentOptions): LocalEnvironment {
    const ctx: ToolContext = {
      workspaceRoot: options.workspaceRoot,
      pipelineId: options.pipelineId ?? 'mini-swe-agent',
      phaseIndex: options.phaseIndex ?? 0,
      phaseName: options.phaseName ?? 'execution',
      taskId: options.taskId ?? 'task',
      agentRole: options.agentRole ?? 'mini-swe-agent',
      dryRun: options.dryRun ?? false,
      snapshotService: options.snapshotService,
      actionLogService: options.actionLogService,
    };

    return new LocalEnvironment(ctx);
  }

  getContext(): ToolContext {
    return this.ctx;
  }

  async readFile(input: ReadFileInput): Promise<ToolResult> {
    return readFile(this.ctx, input);
  }

  async writeFile(input: WriteFileInput): Promise<ToolResult> {
    return writeFile(this.ctx, input);
  }

  async listDirectory(input: ListFilesInput): Promise<ToolResult> {
    return listFiles(this.ctx, input);
  }

  async executeCommand(
    input: RunCommandInput,
    options?: RunCommandOptions
  ): Promise<ToolResult & { validation: CommandValidationResult }> {
    return runCommand(this.ctx, input, options);
  }
}
