import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import type { User } from './User';
import type { Workspace } from './Workspace';

export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer';

@Entity()
@Index(['workspaceId', 'userId'], { unique: true })
export class WorkspaceMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('Workspace', (workspace: Workspace) => workspace.members, {
    onDelete: 'CASCADE',
  })
  workspace: Workspace;

  @Column('uuid')
  workspaceId: string;

  @ManyToOne('User', (user: User) => user.workspaceMembers, {
    onDelete: 'CASCADE',
  })
  user: User;

  @Column('uuid')
  userId: string;

  @Column('text')
  role: WorkspaceRole;

  @Column({ type: 'simple-json', nullable: true })
  permissions: Record<string, boolean> | null;

  @CreateDateColumn()
  joinedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
