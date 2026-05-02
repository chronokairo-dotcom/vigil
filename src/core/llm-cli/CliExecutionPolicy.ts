import { ApprovalFlow } from '@/src/policies/approvalFlow';
import type {
    CliExecutionPolicyOptions,
    CliInferenceRequest,
    CliNormalizedResult,
    LlmCliProvider,
} from './types';

export class CliExecutionPolicy {
    private approvalFlow?: ApprovalFlow;
    private options: Required<Omit<CliExecutionPolicyOptions, 'approvalRequester'>> & {
        approvalRequester?: string;
    };

    constructor(options?: CliExecutionPolicyOptions & { approvalFlow?: ApprovalFlow }) {
        this.options = {
            timeoutMs: options?.timeoutMs ?? 60_000,
            maxRetries: options?.maxRetries ?? 1,
            backoffMs: options?.backoffMs ?? 1_000,
            requireApprovalForSensitive: options?.requireApprovalForSensitive ?? false,
            approvalRequester: options?.approvalRequester,
            persistOperationalPromptOutput: options?.persistOperationalPromptOutput ?? true,
            persistSensitivePromptOutput: options?.persistSensitivePromptOutput ?? false,
            redactSecretsBeforeExecution: options?.redactSecretsBeforeExecution ?? true,
        };
        this.approvalFlow = options?.approvalFlow;
    }

    resolveTimeout(request: CliInferenceRequest): number {
        return request.timeoutMs ?? this.options.timeoutMs;
    }

    resolveMaxRetries(request: CliInferenceRequest): number {
        return request.maxRetries ?? this.options.maxRetries;
    }

    resolveBackoff(request: CliInferenceRequest): number {
        return request.backoffMs ?? this.options.backoffMs;
    }

    shouldRetry(result: CliNormalizedResult, attempt: number, maxRetries: number): boolean {
        if (attempt >= maxRetries) {
            return false;
        }
        return !result.success;
    }

    backoffMs(attempt: number, baseDelayMs: number): number {
        return baseDelayMs * Math.pow(2, Math.max(0, attempt));
    }

    resolvePromptClass(request: CliInferenceRequest): 'operational' | 'sensitive' {
        if (request.promptClass) {
            return request.promptClass;
        }
        return request.sensitive ? 'sensitive' : 'operational';
    }

    shouldPersistPromptOutput(request: CliInferenceRequest): boolean {
        if (typeof request.persistPromptOutput === 'boolean') {
            return request.persistPromptOutput;
        }

        const promptClass = this.resolvePromptClass(request);
        if (promptClass === 'sensitive') {
            return this.options.persistSensitivePromptOutput;
        }

        return this.options.persistOperationalPromptOutput;
    }

    shouldRedactSecretsBeforeExecution(): boolean {
        return this.options.redactSecretsBeforeExecution;
    }

    async approveIfNeeded(request: CliInferenceRequest, provider: LlmCliProvider): Promise<void> {
        if (!request.sensitive || !this.options.requireApprovalForSensitive) {
            return;
        }

        if (!this.approvalFlow) {
            throw new Error('Sensitive CLI execution requires approval flow, but no flow is configured');
        }

        const approvalId = `cli-${provider}-${Date.now()}`;
        const req = this.approvalFlow.request({
            id: approvalId,
            actionType: 'llm-cli-inference',
            description: `Sensitive CLI inference via ${provider}`,
            requestedBy: this.options.approvalRequester || 'system',
        });

        if (req.status !== 'approved') {
            throw new Error(`CLI inference blocked pending approval: ${approvalId}`);
        }
    }
}
