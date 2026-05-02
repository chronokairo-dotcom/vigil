/**
 * Core tools for Vigil agents.
 * Centralized, safe, and logged file/command operations.
 */

// File tools
export {
  readFile,
  writeFile,
  deleteFile,
  listFiles,
  searchCode,
  type ToolContext,
  type ReadFileInput,
  type WriteFileInput,
  type DeleteFileInput,
  type ListFilesInput,
  type SearchCodeInput,
} from './file-tools';

// Command tools
export {
  runCommand,
  isCommandSafe,
  getCommandRiskLevel,
  type RunCommandInput,
  type RunCommandOptions,
} from './run-command';

// Edit file (search + replace)
export {
  editFile,
  type EditFileInput,
} from './file-tools';

// Glob and grep
export {
  globFiles,
  grepFiles,
  formatGrepMatches,
  type GlobInput,
  type GlobResult,
  type GrepInput,
  type GrepResult,
  type GrepMatch,
} from './search-tools';

// Docker tools
export {
  dockerRun,
  dockerList,
  dockerImages,
  type DockerRunOptions,
  type DockerRunResult,
  type DockerContainer,
  type DockerImage,
} from './docker-tools';

// Re-export types
export type { ToolResult, ToolName, FileAction, CommandRiskLevel } from '../types/safety-net';
