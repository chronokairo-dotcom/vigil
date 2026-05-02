// packages/core/src/services/SnapshotService.ts
import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import type { SnapshotMetadata, SnapshotFileMetadata, SnapshotFileAction } from '../types/safety-net';

const SNAPSHOTS_BASE = path.join(
  process.env.HOME || process.env.USERPROFILE || '~',
  '.Vigil',
  'snapshots',
);

/**
 * SnapshotService
 *
 * Gerencia snapshots de arquivos antes de modificacoes por agentes.
 * API alinhada com SafetyNetIntegration e RollbackCommandHandler.
 *
 * Estrutura em disco:
 *   ~/.Vigil/snapshots/<workspaceHash>/<pipelineId>/<phaseIndex>/_metadata.json
 *   ~/.Vigil/snapshots/<workspaceHash>/<pipelineId>/<phaseIndex>/<sha256_hash>
 */
export class SnapshotService {
  private readonly _snapshotsRoot: string;
  private readonly _legacySnapshots = new Map<string, { pipelineId: string; phaseIndex: number }>();

  constructor(workspaceRoot: string) {
    // Usa hash curto do workspace para evitar colisoes entre projetos
    const wsHash = crypto
      .createHash('sha256')
      .update(workspaceRoot)
      .digest('hex')
      .substring(0, 12);
    this._snapshotsRoot = path.join(SNAPSHOTS_BASE, wsHash);
  }

  // ─── Internal path helpers ─────────────────────────────────

  private _phaseDir(pipelineId: string, phaseIndex: number): string {
    return path.join(this._snapshotsRoot, pipelineId, String(phaseIndex));
  }

  private _metadataPath(pipelineId: string, phaseIndex: number): string {
    return path.join(this._phaseDir(pipelineId, phaseIndex), '_metadata.json');
  }

  // ─── Public API ────────────────────────────────────────────

  /**
   * Cria snapshot de um arquivo ANTES de ser modificado ou deletado.
   * Deve ser chamado por SafetyNetIntegration ANTES de escrever o arquivo.
   */
  async createSnapshot(description: string): Promise<string>;
  async createSnapshot(
    pipelineId: string,
    phaseIndex: number,
    phaseName: string,
    relativePath: string,
    action: SnapshotFileAction,
  ): Promise<void>;
  async createSnapshot(
    pipelineIdOrDescription: string,
    phaseIndex?: number,
    phaseName?: string,
    relativePath?: string,
    action?: SnapshotFileAction,
  ): Promise<void | string> {
    // Legacy compatibility mode: create an empty snapshot marker and return ID.
    if (
      phaseIndex === undefined ||
      phaseName === undefined ||
      relativePath === undefined ||
      action === undefined
    ) {
      const legacyId = crypto.randomUUID();
      const pipelineId = `legacy-${legacyId}`;
      const legacyPhaseIndex = 0;

      await fs.mkdir(this._phaseDir(pipelineId, legacyPhaseIndex), { recursive: true });
      await this._saveMetadata(pipelineId, legacyPhaseIndex, {
        pipelineId,
        phaseIndex: legacyPhaseIndex,
        phaseName: pipelineIdOrDescription || 'Legacy Snapshot',
        timestamp: new Date().toISOString(),
        files: [],
      });

      this._legacySnapshots.set(legacyId, { pipelineId, phaseIndex: legacyPhaseIndex });
      return legacyId;
    }

    const pipelineId = pipelineIdOrDescription;
    const phaseDir = this._phaseDir(pipelineId, phaseIndex);
    await fs.mkdir(phaseDir, { recursive: true });

    let metadata = await this._loadMetadata(pipelineId, phaseIndex);
    if (!metadata) {
      metadata = {
        pipelineId,
        phaseIndex,
        phaseName,
        timestamp: new Date().toISOString(),
        files: [],
      };
    }

    // Nao duplicar: se ja existe snapshot para este arquivo nesta fase, ignorar
    const alreadySnapshotted = metadata.files.some(f => f.path === relativePath);
    if (alreadySnapshotted) return;

    // Para arquivos modificados/deletados, salvar conteudo original
    let originalHash = '';
    let originalSize = 0;

    if (action === 'modified' || action === 'deleted') {
      // O path aqui e relativo ao workspace; SafetyNetIntegration deve ter
      // o absolutePath disponivel, mas neste service trabalhamos com relativePath.
      // O conteudo e salvo pelo caller (absolutePath resolvido la).
      // Aqui apenas registramos o hash do arquivo se ele existir via caminho absoluto.
      // SafetyNetIntegration passa o conteudo original via saveFileContent().
    }

    const fileMeta: SnapshotFileMetadata = {
      path: relativePath,
      action,
      originalHash,
      originalSize,
    };

    metadata.files.push(fileMeta);
    await this._saveMetadata(pipelineId, phaseIndex, metadata);
  }

  /**
   * Salva o conteudo original de um arquivo no snapshot.
   * Deve ser chamado com o conteudo ANTES da modificacao.
   */
  async saveFileContent(
    pipelineId: string,
    phaseIndex: number,
    phaseName: string,
    relativePath: string,
    action: SnapshotFileAction,
    originalContent: Buffer | null,
  ): Promise<void> {
    const phaseDir = this._phaseDir(pipelineId, phaseIndex);
    await fs.mkdir(phaseDir, { recursive: true });

    let metadata = await this._loadMetadata(pipelineId, phaseIndex);
    if (!metadata) {
      metadata = {
        pipelineId,
        phaseIndex,
        phaseName,
        timestamp: new Date().toISOString(),
        files: [],
      };
    }

    // Nao duplicar
    const alreadySnapshotted = metadata.files.some(f => f.path === relativePath);
    if (alreadySnapshotted) return;

    let originalHash = '';
    let originalSize = 0;

    if (originalContent && (action === 'modified' || action === 'deleted')) {
      originalHash = crypto.createHash('sha256').update(originalContent).digest('hex');
      originalSize = originalContent.byteLength;
      const contentFilePath = path.join(phaseDir, originalHash);
      await fs.writeFile(contentFilePath, originalContent);
    }

    const fileMeta: SnapshotFileMetadata = {
      path: relativePath,
      action,
      originalHash,
      originalSize,
    };

    metadata.files.push(fileMeta);
    await this._saveMetadata(pipelineId, phaseIndex, metadata);
  }

  /**
   * Registra criacao de um NOVO arquivo (sem conteudo anterior).
   * Para rollback: este arquivo sera DELETADO.
   */
  async recordFileCreation(
    pipelineId: string,
    phaseIndex: number,
    phaseName: string,
    relativePath: string,
  ): Promise<void> {
    await this.saveFileContent(pipelineId, phaseIndex, phaseName, relativePath, 'created', null);
  }

  /**
   * Recupera os metadados de snapshot de uma fase.
   */
  async getSnapshot(snapshotId: string): Promise<SnapshotMetadata | null>;
  async getSnapshot(pipelineId: string, phaseIndex: number): Promise<SnapshotMetadata | null>;
  async getSnapshot(pipelineIdOrSnapshotId: string, phaseIndex?: number): Promise<SnapshotMetadata | null> {
    if (phaseIndex === undefined) {
      const resolved = this._legacySnapshots.get(pipelineIdOrSnapshotId);
      if (!resolved) return null;
      return this._loadMetadata(resolved.pipelineId, resolved.phaseIndex);
    }
    return this._loadMetadata(pipelineIdOrSnapshotId, phaseIndex);
  }

  async listSnapshots(pipelineId: string): Promise<SnapshotMetadata[]> {
    const baseDir = path.join(this._snapshotsRoot, pipelineId);
    if (!fsSync.existsSync(baseDir)) return [];

    const phases = await fs.readdir(baseDir, { withFileTypes: true });
    const snapshots: SnapshotMetadata[] = [];

    for (const phaseDir of phases) {
      if (!phaseDir.isDirectory()) continue;
      const phaseIndex = Number(phaseDir.name);
      if (!Number.isFinite(phaseIndex)) continue;
      const metadata = await this._loadMetadata(pipelineId, phaseIndex);
      if (metadata) snapshots.push(metadata);
    }

    return snapshots.sort((a, b) => a.phaseIndex - b.phaseIndex);
  }

  getSnapshotFilesDir(pipelineId: string, phaseIndex: number): string {
    return this._phaseDir(pipelineId, phaseIndex);
  }

  async deleteSnapshot(snapshotId: string): Promise<boolean>;
  async deleteSnapshot(pipelineId: string, phaseIndex: number): Promise<boolean>;
  async deleteSnapshot(pipelineIdOrSnapshotId: string, phaseIndex?: number): Promise<boolean> {
    if (phaseIndex === undefined) {
      const resolved = this._legacySnapshots.get(pipelineIdOrSnapshotId);
      if (!resolved) return false;
      await fs.rm(this._phaseDir(resolved.pipelineId, resolved.phaseIndex), { recursive: true, force: true });
      this._legacySnapshots.delete(pipelineIdOrSnapshotId);
      return true;
    }

    await fs.rm(this._phaseDir(pipelineIdOrSnapshotId, phaseIndex), { recursive: true, force: true });
    return true;
  }

  async restoreSnapshot(snapshotId: string, workspaceRoot?: string): Promise<boolean> {
    const resolved = this._legacySnapshots.get(snapshotId);
    if (!resolved) return false;

    const result = await this.restore(
      resolved.pipelineId,
      resolved.phaseIndex,
      workspaceRoot || process.cwd(),
    );

    return result.errors.length === 0;
  }

  /**
   * Restaura todos os arquivos de uma fase a partir do snapshot.
   * Retorna contadores de arquivos restaurados e deletados.
   */
  async restore(
    pipelineId: string,
    phaseIndex: number,
    workspaceRoot: string,
  ): Promise<{ restored: number; deleted: number; errors: string[] }> {
    const metadata = await this._loadMetadata(pipelineId, phaseIndex);
    if (!metadata) {
      throw new Error(
        `Snapshot nao encontrado para pipeline=${pipelineId}, phase=${phaseIndex}`,
      );
    }

    const phaseDir = this._phaseDir(pipelineId, phaseIndex);
    let restored = 0;
    let deleted = 0;
    const errors: string[] = [];

    for (const fileMeta of metadata.files) {
      const absolutePath = path.resolve(workspaceRoot, fileMeta.path);

      try {
        if (fileMeta.action === 'created') {
          // Arquivo foi CRIADO pelo agente — deletar no rollback
          await fs.rm(absolutePath, { force: true });
          deleted++;
        } else if (fileMeta.action === 'modified' || fileMeta.action === 'deleted') {
          // Arquivo foi modificado/deletado — restaurar
          if (!fileMeta.originalHash) {
            errors.push(`Hash ausente para restaurar: ${fileMeta.path}`);
            continue;
          }
          const contentFilePath = path.join(phaseDir, fileMeta.originalHash);
          await fs.mkdir(path.dirname(absolutePath), { recursive: true });
          await fs.copyFile(contentFilePath, absolutePath);
          restored++;
        }
      } catch (e: any) {
        errors.push(`Erro ao processar ${fileMeta.path}: ${e.message}`);
      }
    }

    return { restored, deleted, errors };
  }

  /**
   * Remove snapshots de pipelines inativos ou expirados.
   *
   * @param activePipelineIds - IDs de pipelines que NAO devem ser removidos
   * @param retentionDays - Dias de retencao para snapshots de pipelines nao ativos
   */
  async cleanup(
    activePipelineIds: Set<string> = new Set(),
    retentionDays = 7,
  ): Promise<{ removedCount: number; freedSizeMb: number }> {
    let removedCount = 0;
    let freedBytes = 0;

    if (!fsSync.existsSync(this._snapshotsRoot)) {
      return { removedCount: 0, freedSizeMb: 0 };
    }

    const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    let pipelineDirs: string[];

    try {
      pipelineDirs = await fs.readdir(this._snapshotsRoot);
    } catch {
      return { removedCount: 0, freedSizeMb: 0 };
    }

    for (const pipelineId of pipelineDirs) {
      if (activePipelineIds.has(pipelineId)) continue;

      const pipelineDir = path.join(this._snapshotsRoot, pipelineId);
      try {
        const stat = await fs.stat(pipelineDir);
        if (stat.mtimeMs < cutoffMs) {
          const size = await this._dirSize(pipelineDir);
          await fs.rm(pipelineDir, { recursive: true, force: true });
          removedCount++;
          freedBytes += size;
        }
      } catch {
        // Ignorar erros em entradas individuais
      }
    }

    return {
      removedCount,
      freedSizeMb: Math.round((freedBytes / (1024 * 1024)) * 100) / 100,
    };
  }

  // ─── Private helpers ──────────────────────────────────────

  private async _loadMetadata(
    pipelineId: string,
    phaseIndex: number,
  ): Promise<SnapshotMetadata | null> {
    const metaPath = this._metadataPath(pipelineId, phaseIndex);
    try {
      const content = await fs.readFile(metaPath, 'utf-8');
      return JSON.parse(content) as SnapshotMetadata;
    } catch {
      return null;
    }
  }

  private async _saveMetadata(
    pipelineId: string,
    phaseIndex: number,
    metadata: SnapshotMetadata,
  ): Promise<void> {
    const metaPath = this._metadataPath(pipelineId, phaseIndex);
    await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2), 'utf-8');
  }

  private async _dirSize(dirPath: string): Promise<number> {
    let total = 0;
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          total += await this._dirSize(full);
        } else {
          const s = await fs.stat(full);
          total += s.size;
        }
      }
    } catch {
      // Ignorar
    }
    return total;
  }
}
