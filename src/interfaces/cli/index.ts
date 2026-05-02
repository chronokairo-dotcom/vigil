#!/usr/bin/env node

import { Command } from 'commander';
import { registerProjectCommands } from './commands/project';
import { registerContextCommands } from './commands/context';
import { registerDecisionCommands } from './commands/decision';
import { registerExportCommands } from './commands/export';
import { registerInitCommand } from './commands/init';
import { registerWorkflowCommands } from './commands/workflow';
import { registerTriggerCommands } from './commands/trigger';
import { registerMetricsCommands } from './commands/metrics';
import { registerDiagnosticCommands } from './commands/diagnostic';

const program = new Command();

program
  .name('vigil')
  .description('VIGIL CLI - Persistent, observation-first cognitive agent')
  .version('0.1.0');

// Core commands
registerProjectCommands(program);
registerContextCommands(program);
registerDecisionCommands(program);
registerExportCommands(program);
registerInitCommand(program);

// Advanced orchestration commands (Phase 8)
registerWorkflowCommands(program);
registerTriggerCommands(program);
registerMetricsCommands(program);
registerDiagnosticCommands(program);

program.parse();
