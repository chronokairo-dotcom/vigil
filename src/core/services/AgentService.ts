import { DataSource, Repository } from 'typeorm';
import { Agent, AgentState, AgentCapability } from '../entities/Agent';
import { getEventBus } from '@/src/observation/EventBus';
import { mergeDefaultInternalSkillPrompts } from '@/src/core/_compat/skillCompat';
import { loadExternalSkillsFromData } from '@/src/core/_compat/skillCompat';

export interface CreateAgentInput {
  workspaceId: string;
  name: string;
  description?: string;
  capabilities: AgentCapability[];
  config?: Record<string, any>;
  isActive?: boolean;
  metadata?: Record<string, any>;
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  capabilities?: AgentCapability[];
  config?: Record<string, any>;
  state?: AgentState;
  isActive?: boolean;
  metadata?: Record<string, any>;
}

const PREBUILT_AGENTS: Array<{
  name: string;
  description: string;
  capabilities: AgentCapability[];
  metadata: Record<string, any>;
}> = [
    {
      name: 'Inversao',
      description: 'Usa inversao antes do prompt para explorar o problema pelo angulo contrario.',
      capabilities: ['reasoning', 'learning'],
      metadata: {
        prebuilt: true,
        strategy: 'prefix',
        dedicatedPrompt: 'Inversao: antes de responder, formule o inverso do problema para revelar pontos cegos.\\n\\nPROMPT ORIGINAL:\\n{{prompt}}',
      },
    },
    {
      name: 'Seja Socratico',
      description: 'Ensina por perguntas socraticas no final da resposta para aumentar aprendizado.',
      capabilities: ['reasoning', 'learning'],
      metadata: {
        prebuilt: true,
        strategy: 'suffix',
        dedicatedPrompt: '{{prompt}}\\n\\nNo fim da resposta, seja socratico: faca perguntas guiadas para eu aprender o raciocinio.',
      },
    },
    {
      name: 'First Principles',
      description: 'Quebra o problema em partes menores usando first principles.',
      capabilities: ['reasoning', 'code-analysis'],
      metadata: {
        prebuilt: true,
        strategy: 'decomposition',
        dedicatedPrompt: 'Use first principles com base em prompt_do_problema para quebrar em partes menores e resolver em etapas.\\n\\nprompt_do_problema:\\n{{prompt_do_problema}}',
      },
    },
    {
      name: 'Responda anti-consenso',
      description: 'Entrega visao anti-consenso, direta e sem suavizacao.',
      capabilities: ['reasoning', 'code-analysis'],
      metadata: {
        prebuilt: true,
        strategy: 'truth-bias',
        dedicatedPrompt: 'Responda anti-consenso: diga a verdade nua e crua, com vies assumido e argumentos objetivos.',
      },
    },
    {
      name: 'Prompt Engineer',
      description: 'Refina prompts com contexto tecnico e objetivos claros para execucao por LLMs.',
      capabilities: ['reasoning', 'learning'],
      metadata: mergeDefaultInternalSkillPrompts({ prebuilt: true, role: 'prompt-engineer' }).metadata,
    },
    {
      name: 'Architect',
      description: 'Define arquitetura, contratos de API e estrutura tecnica do projeto.',
      capabilities: ['reasoning', 'code-analysis'],
      metadata: { prebuilt: true, role: 'architect' },
    },
    {
      name: 'Backend Engineer',
      description: 'Implementa regras de negocio, APIs e integracoes do servidor.',
      capabilities: ['code-generation', 'code-analysis', 'execution'],
      metadata: { prebuilt: true, role: 'backend' },
    },
    {
      name: 'Frontend Engineer',
      description: 'Construi interfaces, fluxos de tela e integrações no cliente.',
      capabilities: ['code-generation', 'reasoning'],
      metadata: { prebuilt: true, role: 'frontend' },
    },
    {
      name: 'QA Engineer',
      description: 'Valida qualidade, testes e regressao funcional.',
      capabilities: ['code-analysis', 'reasoning', 'execution'],
      metadata: { prebuilt: true, role: 'qa' },
    },
    {
      name: 'Product Manager',
      description: 'Transforma objetivos em requisitos, criterios de aceite e backlog priorizado.',
      capabilities: ['reasoning', 'learning'],
      metadata: { prebuilt: true, role: 'product-manager' },
    },
    {
      name: 'DevOps Engineer',
      description: 'Configura CI/CD, infraestrutura, deploy e operacao do projeto.',
      capabilities: ['execution', 'reasoning', 'code-analysis'],
      metadata: { prebuilt: true, role: 'devops' },
    },
    {
      name: 'Code Reviewer',
      description: 'Revisa padroes, seguranca, performance e prontidao para merge.',
      capabilities: ['code-analysis', 'reasoning'],
      metadata: { prebuilt: true, role: 'code-review' },
    },
    {
      name: 'Organizer',
      description: 'Organiza estrutura de projeto, padroes e consistencia de arquivos.',
      capabilities: ['reasoning', 'execution'],
      metadata: { prebuilt: true, role: 'organizer' },
    },
    {
      name: 'Git Agent',
      description: 'Opera fluxo Git: branch, commit, push e suporte a PR.',
      capabilities: ['execution', 'reasoning'],
      metadata: { prebuilt: true, role: 'git' },
    },
    {
      name: 'Dead Code Cleaner',
      description: 'Identifica e remove codigo morto, exports nao usados e arquivos orfaos.',
      capabilities: ['code-analysis', 'execution'],
      metadata: { prebuilt: true, role: 'dead-code' },
    },
    {
      name: 'Troubleshooter',
      description: 'Diagnostica falhas e aplica correcoes orientadas a causa raiz.',
      capabilities: ['reasoning', 'code-analysis', 'execution'],
      metadata: { prebuilt: true, role: 'troubleshooter' },
    },
    {
      name: 'Advanced Software Development Agent',
      description: 'Agente avancado para desenvolvimento autonomo com raciocinio multi-etapas.',
      capabilities: ['code-generation', 'code-analysis', 'reasoning', 'execution', 'learning'],
      metadata: { prebuilt: true, role: 'advanced-software-agent' },
    },
    {
      name: 'Advanced Security Agent',
      description: 'Agente avancado para analise de seguranca, vulnerabilidades e simulacoes.',
      capabilities: ['security-analysis', 'code-analysis', 'reasoning', 'execution'],
      metadata: { prebuilt: true, role: 'advanced-security-agent' },
    },
    {
      name: 'Advanced Multimodal Agent',
      description: 'Agente avancado para analise multimodal de texto, imagem e artefatos.',
      capabilities: ['reasoning', 'learning', 'execution', 'code-analysis'],
      metadata: { prebuilt: true, role: 'advanced-multimodal-agent' },
    },
  ];

export class AgentService {
  private repo: Repository<Agent>;

  constructor(private db: DataSource) {
    this.repo = db.getRepository(Agent);
  }

  async create(input: CreateAgentInput): Promise<Agent> {
    const agent = this.repo.create({
      workspaceId: input.workspaceId,
      name: input.name,
      description: input.description || null,
      capabilities: input.capabilities,
      config: input.config || null,
      state: 'idle',
      isActive: input.isActive ?? true,
      metadata: input.metadata || null,
    });
    return this.repo.save(agent);
  }

  async getById(id: string): Promise<Agent | null> {
    return this.repo.findOne({
      where: { id },
      relations: ['tasks'],
    });
  }

  async getByName(workspaceId: string, name: string): Promise<Agent | null> {
    return this.repo.findOne({
      where: { workspaceId, name },
    });
  }

  async listByWorkspace(workspaceId: string, onlyActive: boolean = true): Promise<Agent[]> {
    return this.repo.find({
      where: onlyActive ? { workspaceId, isActive: true } : { workspaceId },
      relations: ['tasks'],
      order: { createdAt: 'DESC' },
    });
  }

  async ensurePrebuiltAgents(workspaceId: string): Promise<Agent[]> {
    const existing = await this.listByWorkspace(workspaceId, false);
    const existingNames = new Set(existing.map((agent) => agent.name.trim().toLowerCase()));

    for (const prebuilt of PREBUILT_AGENTS) {
      if (existingNames.has(prebuilt.name.trim().toLowerCase())) continue;
      await this.create({
        workspaceId,
        name: prebuilt.name,
        description: prebuilt.description,
        capabilities: prebuilt.capabilities,
        isActive: true,
        metadata: prebuilt.metadata,
      });
      existingNames.add(prebuilt.name.trim().toLowerCase());
    }

    const externalSkills = await loadExternalSkillsFromData();
    const providers = Array.from(new Set(externalSkills.map((skill) => skill.provider))).sort((a, b) => a.localeCompare(b));

    for (const provider of providers) {
      const providerAgentName = `${provider} Skills`;
      const normalizedName = providerAgentName.trim().toLowerCase();
      if (existingNames.has(normalizedName)) continue;

      await this.create({
        workspaceId,
        name: providerAgentName,
        description: `Agente prebuilt para skills importadas automaticamente de data/skills/${provider}.`,
        capabilities: ['reasoning', 'learning'],
        isActive: true,
        metadata: {
          prebuilt: true,
          role: `skills-provider-${provider.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          source: 'data/skills',
          provider,
          externalSkillProvider: true,
        },
      });

      existingNames.add(normalizedName);
    }

    const refreshed = await this.listByWorkspace(workspaceId, false);
    const promptEngineer = refreshed.find((agent) => (
      agent.name.trim().toLowerCase() === 'prompt engineer'
      || agent.metadata?.role === 'prompt-engineer'
    ));

    if (promptEngineer) {
      const merged = mergeDefaultInternalSkillPrompts(promptEngineer.metadata);
      const nextMetadata: Record<string, any> = { ...merged.metadata };

      const promptTemplates = {
        ...((nextMetadata.promptTemplates as Record<string, string> | undefined) ?? {}),
      };

      const customPromptCapabilities = [
        ...((nextMetadata.customPromptCapabilities as Array<Record<string, any>> | undefined) ?? []),
      ];

      const customKeys = new Set(customPromptCapabilities.map((item) => String(item?.key ?? '').trim()).filter(Boolean));

      let externalChanged = false;
      for (const skill of externalSkills) {
        const currentTemplate = (promptTemplates[skill.key] ?? '').trim();
        if (currentTemplate !== skill.prompt) {
          promptTemplates[skill.key] = skill.prompt;
          externalChanged = true;
        }

        if (!customKeys.has(skill.key)) {
          customPromptCapabilities.push({
            key: skill.key,
            title: skill.title,
            description: skill.description,
            prompt: skill.prompt,
            isCustom: true,
            source: 'data/skills',
            provider: skill.provider,
          });
          customKeys.add(skill.key);
          externalChanged = true;
        }
      }

      if (externalChanged) {
        nextMetadata.promptTemplates = promptTemplates;
        nextMetadata.customPromptCapabilities = customPromptCapabilities;
      }

      if (merged.changed || externalChanged) {
        await this.repo.update(promptEngineer.id, { metadata: nextMetadata });
      }
    }

    return this.listByWorkspace(workspaceId, false);
  }

  async update(id: string, input: UpdateAgentInput): Promise<Agent | null> {
    await this.repo.update(id, input);
    return this.getById(id);
  }

  async setState(id: string, state: AgentState): Promise<Agent | null> {
    await this.repo.update(id, {
      state,
      lastActivityAt: new Date(),
    });
    const agent = await this.getById(id);
    if (agent) {
      getEventBus().emit('agent:state', { id, state, agent });
    }
    return agent;
  }

  async incrementStats(id: string, success: boolean): Promise<void> {
    const agent = await this.getById(id);
    if (!agent) return;

    if (success) {
      await this.repo.update(id, { tasksCompleted: agent.tasksCompleted + 1 });
    } else {
      await this.repo.update(id, { tasksFailed: agent.tasksFailed + 1 });
    }

    await this.repo.update(id, { lastActivityAt: new Date() });

    const updated = await this.getById(id);
    if (updated) {
      getEventBus().emit('agent:stats', {
        id,
        tasksCompleted: updated.tasksCompleted,
        tasksFailed: updated.tasksFailed,
        agent: updated
      });
    }
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  async getActiveAgents(workspaceId: string): Promise<Agent[]> {
    return this.repo.find({
      where: {
        workspaceId,
        isActive: true,
        state: 'idle', // or 'running'
      },
    });
  }

  async getStats(workspaceId: string): Promise<{
    totalAgents: number;
    activeAgents: number;
    totalTasksCompleted: number;
    totalTasksFailed: number;
  }> {
    const agents = await this.listByWorkspace(workspaceId, false);
    const activeAgents = agents.filter((a) => a.isActive).length;
    const totalTasksCompleted = agents.reduce((sum, a) => sum + a.tasksCompleted, 0);
    const totalTasksFailed = agents.reduce((sum, a) => sum + a.tasksFailed, 0);

    return {
      totalAgents: agents.length,
      activeAgents,
      totalTasksCompleted,
      totalTasksFailed,
    };
  }
}
