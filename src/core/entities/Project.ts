import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
} from 'typeorm';
import type { ContextEntry } from './ContextEntry';
import type { Decision } from './Decision';
import type { Workspace } from './Workspace';

@Entity()
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  name: string;

  @Column('text', { nullable: true })
  description: string | null;

  @Column('text', { default: 'active' })
  status: string;

  @ManyToOne('Workspace', (workspace: Workspace) => workspace.projects, {
    onDelete: 'CASCADE',
  })
  workspace: Workspace;

  @Column('uuid', { nullable: true })
  workspaceId: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any> | null;

  @OneToMany('ContextEntry', (context: ContextEntry) => context.project, { cascade: true })
  contextEntries: ContextEntry[];

  @OneToMany('Decision', (decision: Decision) => decision.project, { cascade: true })
  decisions: Decision[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
