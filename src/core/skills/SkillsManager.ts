/**
 * Skills manager.

 *
 * Scans a ~/.vigil/skills directory for SKILL.md files that agents can use.
 * On first run it installs the four bundled default skills (pdf/docx/xlsx/pptx).
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// ─── Types ─────────────────────────────────────────────────────

export interface SkillMetadata {
    name: string;
    description: string;
}

export interface Skill extends SkillMetadata {
    content: string;
    dirPath: string;
}

// ─── Directory helpers ──────────────────────────────────────────

const SKILLS_DIR_NAME = '.vigil';
const SKILLS_SUBDIR = 'skills';

/**
 * Absolute path to the user-level skills directory: ~/.vigil/skills
 */
export function getSkillsDir(): string {
    return path.join(os.homedir(), SKILLS_DIR_NAME, SKILLS_SUBDIR);
}

/**
 * Ensure the skills directory exists and install defaults if empty.
 */
export function ensureSkillsDir(): string {
    const dir = getSkillsDir();
    fs.mkdirSync(dir, { recursive: true });
    installDefaultsIfNeeded(dir);
    return dir;
}

// ─── Default skill installation ─────────────────────────────────

const BUNDLED_DIR = path.join(__dirname, 'bundled');

const DEFAULT_SKILLS = ['pdf', 'docx', 'xlsx', 'pptx'];

function installDefaultsIfNeeded(skillsDir: string): void {
    const existing = safeReadDir(skillsDir);
    if (existing.length > 0) return; // Already has skills

    for (const name of DEFAULT_SKILLS) {
        const srcFile = path.join(BUNDLED_DIR, `${name}.skill.md`);
        if (!fs.existsSync(srcFile)) continue;
        const destDir = path.join(skillsDir, name);
        fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(srcFile, path.join(destDir, 'SKILL.md'));
    }
}

// ─── Scanning ──────────────────────────────────────────────────

/**
 * Return all available skills from the skills directory.
 * Only directories containing a SKILL.md with valid YAML frontmatter are returned.
 */
export function getAvailableSkills(): Skill[] {
    const dir = ensureSkillsDir();
    const skills: Skill[] = [];

    for (const entry of safeReadDir(dir)) {
        const skillDir = path.join(dir, entry);
        const stat = fs.statSync(skillDir);
        if (!stat.isDirectory()) continue;

        const skillFile = path.join(skillDir, 'SKILL.md');
        if (!fs.existsSync(skillFile)) continue;

        const content = fs.readFileSync(skillFile, 'utf8');
        const meta = parseSkillFrontmatter(content);
        if (!meta) continue;

        skills.push({ ...meta, content, dirPath: skillDir });
    }

    return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Build a string to append to system prompts so the agent knows about skills.
 */
export function buildSkillsPrompt(): string {
    const skills = getAvailableSkills();
    if (skills.length === 0) return '';

    const list = skills.map(s => `- **${s.name}**: ${s.description}`).join('\n');
    return `\n\nAvailable skills:\n${list}`;
}

/**
 * Get a specific skill by name.
 */
export function getSkill(name: string): Skill | undefined {
    return getAvailableSkills().find(s => s.name === name);
}

/**
 * Install a custom skill from a SKILL.md file path.
 */
export function installSkill(skillMdPath: string): void {
    const content = fs.readFileSync(skillMdPath, 'utf8');
    const meta = parseSkillFrontmatter(content);
    if (!meta) throw new Error('SKILL.md has no valid frontmatter (name + description required)');

    const dir = ensureSkillsDir();
    const destDir = path.join(dir, meta.name);
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(skillMdPath, path.join(destDir, 'SKILL.md'));
}

// ─── Frontmatter parser ─────────────────────────────────────────

function parseSkillFrontmatter(content: string): SkillMetadata | null {
    if (!content.startsWith('---')) return null;

    const rest = content.slice(3);
    const endIdx = rest.indexOf('---');
    if (endIdx === -1) return null;

    const yaml = rest.slice(0, endIdx);
    let name: string | undefined;
    let description: string | undefined;

    for (const line of yaml.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('name:')) {
            name = trimmed.slice('name:'.length).trim().replace(/^["']|["']$/g, '');
        } else if (trimmed.startsWith('description:')) {
            description = trimmed.slice('description:'.length).trim().replace(/^["']|["']$/g, '');
        }
    }

    if (!name || !description) return null;
    return { name, description };
}

// ─── Utility ───────────────────────────────────────────────────

function safeReadDir(dir: string): string[] {
    try { return fs.readdirSync(dir); }
    catch { return []; }
}
