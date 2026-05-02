import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, Index } from 'typeorm';
import type { Project } from './Project';

@Entity()
@Index(['keyHash', 'project'])
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  name: string;

  @Column('varchar', { length: 255 })
  keyHash: string;

  @Column('varchar', { length: 100, nullable: true })
  lastUsed: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @ManyToOne('Project')
  project: Project;

  @CreateDateColumn()
  createdAt: Date;

  @Column('datetime', { nullable: true })
  revokedAt: Date | null;
}
