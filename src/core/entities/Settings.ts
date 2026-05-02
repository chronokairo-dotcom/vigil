import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity()
@Index(['workspaceId', 'key'])
export class Settings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 255 })
  workspaceId: string;

  @Column('varchar', { length: 255 })
  key: string;

  @Column('text')
  value: string;

  @Column('varchar', { length: 50 })
  type: 'boolean' | 'string' | 'number' | 'json';

  @Column('text', { nullable: true })
  description: string | null;

  @Column({ type: 'boolean', default: false })
  isSystemSetting: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
