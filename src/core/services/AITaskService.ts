/**
 * AI Task Service
 * 
 * Integra a execução de tarefas de agentes com provedores de IA
 * Orquestra chamadas de IA e atualiza o estado das tarefas
 */

import { DataSource } from 'typeorm';
import { IAIProvider, AICompletionResult, AIReasoningResult } from '../providers/ai-provider';
import { TaskService } from './TaskService';
import { ExecutionLogService } from './ExecutionLogService';
import { AgentService } from './AgentService';
import { Task } from '../entities/Task';
import { Agent } from '../entities/Agent';

export interface AITaskInput {
  code?: string;
  description?: string;
  language?: string;
  context?: Record<string, any>;
  problem?: string;
  analysisType?: 'security' | 'performance' | 'quality' | 'all';
}

export class AITaskService {
  private taskService: TaskService;
  private logService: ExecutionLogService;
  private agentService: AgentService;

  constructor(
    private db: DataSource,
    private aiProvider: IAIProvider
  ) {
    this.taskService = new TaskService(db);
    this.logService = new ExecutionLogService(db);
    this.agentService = new AgentService(db);
  }

  /**
   * Execute a task using the AI provider
   */
  async executeTask(taskId: string): Promise<Task> {
    const task = await this.taskService.getById(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    try {
      // Mark task as running
      await this.taskService.start(taskId);

      // Log execution start
      await this.logService.log({
        workspaceId: task.workspaceId,
        taskId: task.id,
        agentId: task.agentId,
        level: 'info',
        phase: 'planning',
        message: `Starting task execution: ${task.type}`,
        data: { type: task.type, description: task.description },
      });

      let result: AICompletionResult | AIReasoningResult;
      const input = task.input as AITaskInput;

      // Execute based on task type
      switch (task.type) {
        case 'code-generation':
          result = await this.executeCodeGeneration(taskId, input);
          break;
        case 'code-analysis':
          result = await this.executeCodeAnalysis(taskId, input);
          break;
        case 'security-analysis':
          result = await this.executeSecurityAnalysis(taskId, input);
          break;
        case 'code-refactoring':
          result = await this.executeCodeRefactoring(taskId, input);
          break;
        case 'multi-step-problem-solving':
          result = await this.executeMultiStepProblem(taskId, input);
          break;
        case 'vulnerability-scan':
          result = await this.executeVulnerabilityScan(taskId, input);
          break;
        default:
          result = await this.executeSimple(taskId, input);
      }

      // Update task with reasoning from reasoning-capable providers
      if ('reasoning' in result) {
        await this.taskService.setReasoning(taskId, {
          reasoning: result.reasoning,
          thinkingTime: result.thinkingTime,
          confidenceScore: result.confidenceScore,
          steps: [],
          uncertainties: [],
          alternativeApproaches: [],
          tokensUsed: result.usage.completionTokens,
          totalTokens: result.usage.totalTokens,
        });
      }

      // Mark task as completed
      const completedTask = await this.taskService.complete(taskId, {
        result: result.content,
        status: 'completed',
        iterations: 1,
        reasoning: 'reasoning' in result ? result.reasoning : '',
        artifacts: [{ type: 'output', content: result.content }],
      });

      // Update agent stats
      await this.agentService.incrementStats(task.agentId, true);

      // Log successful completion
      await this.logService.log({
        workspaceId: task.workspaceId,
        taskId: task.id,
        agentId: task.agentId,
        level: 'info',
        phase: 'completion',
        message: `Task completed successfully`,
        data: {
          tokensUsed: result.usage.totalTokens,
          model: result.model,
          stopReason: result.stopReason,
        },
      });

      return completedTask;
    } catch (error) {
      // Mark task as failed
      const failedTask = await this.taskService.fail(taskId, {
        code: 'AI_EXECUTION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Update agent stats
      await this.agentService.incrementStats(task.agentId, false);

      // Log error
      await this.logService.log({
        workspaceId: task.workspaceId,
        taskId: task.id,
        agentId: task.agentId,
        level: 'error',
        phase: 'execution',
        message: `Task execution failed`,
        data: { error: error instanceof Error ? error.message : String(error) },
      });

      throw error;
    }
  }

  /**
   * Execute code generation task
   */
  private async executeCodeGeneration(taskId: string, input: AITaskInput): Promise<AICompletionResult> {
    const task = await this.taskService.getById(taskId);
    if (!task) throw new Error('Task not found');

    const language = input.language || 'python';
    const description = input.description || 'Generate useful code';

    await this.logService.log({
      workspaceId: task.workspaceId,
      taskId: taskId,
      agentId: task.agentId,
      level: 'info',
      phase: 'reasoning',
      message: `Generating ${language} code`,
    });

    const result = await this.aiProvider.generateCode(description, language, input.context?.context);

    await this.logService.log({
      workspaceId: task.workspaceId,
      taskId: taskId,
      agentId: task.agentId,
      level: 'info',
      phase: 'execution',
      message: `Code generation completed`,
      data: { tokens: result.usage.totalTokens },
    });

    return result;
  }

  /**
   * Execute code analysis task
   */
  private async executeCodeAnalysis(taskId: string, input: AITaskInput): Promise<AICompletionResult> {
    const task = await this.taskService.getById(taskId);
    if (!task) throw new Error('Task not found');

    if (!input.code) {
      throw new Error('Code is required for code-analysis task');
    }

    const language = input.language || 'python';
    const analysisType = input.analysisType || 'all';

    await this.logService.log({
      workspaceId: task.workspaceId,
      taskId: taskId,
      agentId: task.agentId,
      level: 'info',
      phase: 'reasoning',
      message: `Analyzing ${language} code for ${analysisType} issues`,
    });

    const result = await this.aiProvider.analyzeCode(input.code, language, analysisType);

    await this.logService.log({
      workspaceId: task.workspaceId,
      taskId: taskId,
      agentId: task.agentId,
      level: 'info',
      phase: 'execution',
      message: `Code analysis completed`,
      data: { tokens: result.usage.totalTokens, analysisType },
    });

    return result;
  }

  /**
   * Execute security analysis task
   */
  private async executeSecurityAnalysis(taskId: string, input: AITaskInput): Promise<AICompletionResult> {
    const task = await this.taskService.getById(taskId);
    if (!task) throw new Error('Task not found');

    const code = input.code || '';
    const language = input.language || 'python';

    await this.logService.log({
      workspaceId: task.workspaceId,
      taskId: taskId,
      agentId: task.agentId,
      level: 'info',
      phase: 'reasoning',
      message: 'Analyzing code for security vulnerabilities',
    });

    const result = await this.aiProvider.analyzeCode(code, language, 'security');

    await this.logService.log({
      workspaceId: task.workspaceId,
      taskId: taskId,
      agentId: task.agentId,
      level: 'warn',
      phase: 'validation',
      message: 'Security analysis completed',
      data: { tokens: result.usage.totalTokens },
    });

    return result;
  }

  /**
   * Execute code refactoring task
   */
  private async executeCodeRefactoring(taskId: string, input: AITaskInput): Promise<AICompletionResult> {
    const task = await this.taskService.getById(taskId);
    if (!task) throw new Error('Task not found');

    if (!input.code) {
      throw new Error('Code is required for refactoring');
    }

    const language = input.language || 'python';

    await this.logService.log({
      workspaceId: task.workspaceId,
      taskId: taskId,
      agentId: task.agentId,
      level: 'info',
      phase: 'reasoning',
      message: `Refactoring ${language} code`,
    });

    // Use reasoning for refactoring decisions
    const result = 'reasonAbout' in this.aiProvider
      ? await (this.aiProvider as any).reasonAbout(
          `Refactor this ${language} code for better quality:\n\n${input.code}`,
          input.context
        )
      : await this.aiProvider.analyzeCode(input.code, language, 'quality');

    await this.logService.log({
      workspaceId: task.workspaceId,
      taskId: taskId,
      agentId: task.agentId,
      level: 'info',
      phase: 'execution',
      message: 'Refactoring completed',
      data: { tokens: result.usage.totalTokens },
    });

    return result;
  }

  /**
   * Execute multi-step problem solving
   */
  private async executeMultiStepProblem(taskId: string, input: AITaskInput): Promise<AICompletionResult> {
    const task = await this.taskService.getById(taskId);
    if (!task) throw new Error('Task not found');

    const problem = input.problem || input.description || 'Solve this problem';

    await this.logService.log({
      workspaceId: task.workspaceId,
      taskId: taskId,
      agentId: task.agentId,
      level: 'info',
      phase: 'planning',
      message: 'Decomposing problem into steps',
    });

    // First, decompose the problem
    const decomposed = await this.aiProvider.decomposeProblem(problem, JSON.stringify(input.context));

    await this.logService.log({
      workspaceId: task.workspaceId,
      taskId: taskId,
      agentId: task.agentId,
      level: 'info',
      phase: 'planning',
      message: `Problem decomposed into ${decomposed.steps.length} steps`,
      data: { steps: decomposed.steps.length },
    });

    // Then solve using reasoning
    const result = 'reasonAbout' in this.aiProvider
      ? await (this.aiProvider as any).reasonAbout(problem, { ...input.context, steps: decomposed.steps })
      : await this.aiProvider.complete(problem);

    // Add decomposition to output
    const enhancedContent = `## Steps\n${decomposed.steps.map((s) => `${s.order}. ${s.title}: ${s.description}`).join('\n')}\n\n## Solution\n${result.content}`;

    await this.logService.log({
      workspaceId: task.workspaceId,
      taskId: taskId,
      agentId: task.agentId,
      level: 'info',
      phase: 'completion',
      message: 'Multi-step problem solving completed',
      data: { steps: decomposed.steps.length, tokens: result.usage.totalTokens },
    });

    return { ...result, content: enhancedContent };
  }

  /**
   * Execute vulnerability scan task
   */
  private async executeVulnerabilityScan(taskId: string, input: AITaskInput): Promise<AICompletionResult> {
    const task = await this.taskService.getById(taskId);
    if (!task) throw new Error('Task not found');

    const code = input.code || '';
    const language = input.language || 'python';

    await this.logService.log({
      workspaceId: task.workspaceId,
      taskId: taskId,
      agentId: task.agentId,
      level: 'warn',
      phase: 'reasoning',
      message: 'Scanning for vulnerabilities',
    });

    const result = await this.aiProvider.analyzeCode(code, language, 'security');

    await this.logService.log({
      workspaceId: task.workspaceId,
      taskId: taskId,
      agentId: task.agentId,
      level: 'warn',
      phase: 'validation',
      message: 'Vulnerability scan completed',
      data: { tokens: result.usage.totalTokens },
    });

    return result;
  }

  /**
   * Execute simple completion task
   */
  private async executeSimple(taskId: string, input: AITaskInput): Promise<AICompletionResult> {
    const task = await this.taskService.getById(taskId);
    if (!task) throw new Error('Task not found');

    const prompt = input.description || 'Complete this task';

    await this.logService.log({
      workspaceId: task.workspaceId,
      taskId: taskId,
      agentId: task.agentId,
      level: 'info',
      phase: 'reasoning',
      message: 'Executing simple task',
    });

    const result = await this.aiProvider.complete(prompt);

    await this.logService.log({
      workspaceId: task.workspaceId,
      taskId: taskId,
      agentId: task.agentId,
      level: 'info',
      phase: 'completion',
      message: 'Simple task completed',
      data: { tokens: result.usage.totalTokens },
    });

    return result;
  }

  /**
   * Change the AI provider
   */
  setAIProvider(provider: IAIProvider): void {
    this.aiProvider = provider;
  }

  /**
   * Get current AI provider
   */
  getAIProvider(): IAIProvider {
    return this.aiProvider;
  }
}
