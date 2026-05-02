import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity()
@Index(['workspaceId', 'enabled', 'nextRun'])
export class SecuritySchedule {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column('uuid')
    workspaceId: string;

    @Column('text')
    scanType: 'code' | 'api' | 'dependency' | 'infrastructure' | 'system';

    @Column('text', { nullable: true })
    targetName: string;

    @Column('text', { nullable: true })
    targetId: string;

    @Column('text', { default: 'weekly' })
    frequency: string;

    @Column('datetime', { nullable: true })
    nextRun: Date | null;

    @Column('datetime', { nullable: true })
    lastRun: Date | null;

    @Column('boolean', { default: true })
    enabled: boolean;

    @Column('simple-json', { nullable: true })
    options: {
        deepScan?: boolean;
        filePatterns?: string[];
        excludePatterns?: string[];
    } | null;

    @CreateDateColumn()
    createdAt: Date;
}

export interface Webhook {
    id: string;
    url: string;
    events: string[];
    enabled: boolean;
    secret: string | null;
}

@Entity()
@Index(['workspaceId', 'enabled'])
export class SecurityWebhook {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column('uuid')
    workspaceId: string;

    @Column('text')
    url: string;

    @Column('simple-array')
    events: string[];

    @Column('boolean', { default: true })
    enabled: boolean;

    @Column('text', { nullable: true })
    secret: string | null;

    @CreateDateColumn()
    createdAt: Date;
}