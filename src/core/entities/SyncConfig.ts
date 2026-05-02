import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import type { Project } from './Project';

export type SyncTarget = 'copilot' | 'claude' | 'cursor';
export type SyncTrigger = 'manual' | 'on-change' | 'scheduled';

/**
 * Configuration for automatic sync/export of project context to AI tool config files.
 * Each project can have multiple SyncConfig entries (one per target).
 */
@Entity()
export class SyncConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne('Project', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project!: Project;

  @Column('uuid')
  projectId!: string;

  /** Target AI tool: copilot, claude, cursor */
  @Column({ type: 'text' })
  target!: SyncTarget;

  /** When to trigger sync: manual, on-change, scheduled */
  @Column({ type: 'text', default: 'manual' })
  trigger!: SyncTrigger;

  /** Cron expression for scheduled syncs (e.g., "0 9 * * *" for daily at 9am) */
  @Column({ type: 'text', nullable: true })
  cronSchedule!: string | null;

  /** Absolute path to the workspace/repo where config file should be written */
  @Column('text')
  workspacePath!: string;

  /** Whether this sync config is active */
  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  /** Last successful sync timestamp */
  @Column({ type: 'datetime', nullable: true })
  lastSyncAt!: Date | null;

  /** Last sync status: 'success', 'failed', 'pending' */
  @Column({ type: 'text', default: 'pending' })
  lastSyncStatus!: string;

  /** Error message if last sync failed */
  @Column({ type: 'text', nullable: true })
  lastSyncError!: string | null;

  /** Number of consecutive failures */
  @Column('integer', { default: 0 })
  failureCount!: number;

  /** Custom output path override (null = use default for target) */
  @Column({ type: 'text', nullable: true })
  customOutputPath!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
