import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DataSource } from 'typeorm';
import { AgentService } from '../AgentService';
import { Agent } from '../../entities/Agent';
import { Task } from '../../entities/Task';

describe('AgentService', () => {
    let db: DataSource;
    let service: AgentService;

    beforeEach(async () => {
        db = new DataSource({
            type: 'sqlite',
            database: ':memory:',
            synchronize: true,
            logging: false,
            entities: [Agent, Task],
        });
        await db.initialize();
        service = new AgentService(db);
    });

    afterEach(async () => {
        if (db?.isInitialized) {
            await db.destroy();
        }
    });

    it('should create a new custom agent with dedicated prompt metadata', async () => {
        const created = await service.create({
            workspaceId: 'ws-1',
            name: 'Custom Decomposer',
            description: 'Agent for custom decomposition',
            capabilities: ['reasoning'],
            metadata: {
                dedicatedPrompt: 'Break this prompt in steps: {{prompt}}',
            },
        });

        expect(created.id).toBeDefined();
        expect(created.name).toBe('Custom Decomposer');
        expect(created.isActive).toBe(true);
        expect((created.metadata as any)?.dedicatedPrompt).toContain('{{prompt}}');
    });

    it('should list all prebuilt agents including prompt strategies and advanced agents', async () => {
        const list = await service.ensurePrebuiltAgents('ws-prebuilt');

        const byName = new Map(list.map((agent) => [agent.name, agent]));

        const inversao = byName.get('Inversao');
        const socratico = byName.get('Seja Socratico');
        const firstPrinciples = byName.get('First Principles');
        const antiConsenso = byName.get('Responda anti-consenso');
        const productManager = byName.get('Product Manager');
        const devops = byName.get('DevOps Engineer');
        const codeReviewer = byName.get('Code Reviewer');
        const organizer = byName.get('Organizer');
        const gitAgent = byName.get('Git Agent');
        const deadCode = byName.get('Dead Code Cleaner');
        const troubleshooter = byName.get('Troubleshooter');
        const advancedSoftware = byName.get('Advanced Software Development Agent');
        const advancedSecurity = byName.get('Advanced Security Agent');
        const advancedMultimodal = byName.get('Advanced Multimodal Agent');

        expect(inversao).toBeDefined();
        expect((inversao?.metadata as any)?.dedicatedPrompt).toContain('PROMPT ORIGINAL');

        expect(socratico).toBeDefined();
        expect((socratico?.metadata as any)?.dedicatedPrompt).toContain('{{prompt}}');
        expect((socratico?.metadata as any)?.strategy).toBe('suffix');

        expect(firstPrinciples).toBeDefined();
        expect((firstPrinciples?.metadata as any)?.dedicatedPrompt).toContain('first principles');
        expect((firstPrinciples?.metadata as any)?.dedicatedPrompt).toContain('{{prompt_do_problema}}');

        expect(antiConsenso).toBeDefined();
        expect((antiConsenso?.metadata as any)?.dedicatedPrompt).toContain('anti-consenso');

        expect(productManager).toBeDefined();
        expect(devops).toBeDefined();
        expect(codeReviewer).toBeDefined();
        expect(organizer).toBeDefined();
        expect(gitAgent).toBeDefined();
        expect(deadCode).toBeDefined();
        expect(troubleshooter).toBeDefined();

        expect(advancedSoftware).toBeDefined();
        expect((advancedSoftware?.metadata as any)?.role).toBe('advanced-software-agent');
        expect(advancedSecurity).toBeDefined();
        expect((advancedSecurity?.metadata as any)?.role).toBe('advanced-security-agent');
        expect(advancedMultimodal).toBeDefined();
        expect((advancedMultimodal?.metadata as any)?.role).toBe('advanced-multimodal-agent');
    });

    it('should list only active agents when onlyActive is true', async () => {
        const all = await service.ensurePrebuiltAgents('ws-active');
        const inversao = all.find((agent) => agent.name === 'Inversao');

        expect(inversao).toBeDefined();
        await service.update(inversao!.id, { isActive: false });

        const onlyActive = await service.listByWorkspace('ws-active', true);
        const withInactive = await service.listByWorkspace('ws-active', false);

        expect(onlyActive.some((agent) => agent.name === 'Inversao')).toBe(false);
        expect(withInactive.some((agent) => agent.name === 'Inversao')).toBe(true);
    });
});
