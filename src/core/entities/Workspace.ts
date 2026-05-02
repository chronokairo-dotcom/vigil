import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  Index,
} from 'typeorm';
import type { Project } from './Project';
import type { WorkspaceMember } from './WorkspaceMember';
import type { User } from './User';

@Entity()
@Index(['slug'], { unique: true })
export class Workspace {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  name: string;

  @Column('text', { unique: true })
  slug: string;

  @Column('text', { nullable: true })
  description: string | null;

  @ManyToOne('User', { onDelete: 'CASCADE' })
  owner: User;

  @Column('uuid')
  ownerId: string;

  @Column({ type: 'text', default: 'active' })
  status: 'active' | 'archived' | 'deleted';

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any> | null;

  @OneToMany(
    'Project',
    (project: Project) => project.workspace,
    { cascade: true, onDelete: 'CASCADE' }
  )
  projects: Project[];

  @OneToMany(
    'WorkspaceMember',
    (member: WorkspaceMember) => member.workspace,
    { cascade: true, onDelete: 'CASCADE' }
  )
  members: WorkspaceMember[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
