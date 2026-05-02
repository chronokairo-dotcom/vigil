import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne } from 'typeorm';
import type { Project } from './Project';

@Entity()
export class ContextEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  key: string;

  @Column('text')
  value: string;

  @Column({ type: 'text', default: 'general' })
  category: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any> | null;

  @Column('integer', { default: 1 })
  priority: number;

  @ManyToOne('Project', (project: Project) => project.contextEntries, { onDelete: 'CASCADE' })
  project: Project;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
