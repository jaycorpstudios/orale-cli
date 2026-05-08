import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, '..', '..');
const SKILLS_SOURCE_DIR = join(PACKAGE_ROOT, 'skills');

interface SkillManifest {
  version: string;
  skills: string[];
}

/**
 * Install orale skills into a target directory.
 *
 * Creates skill folders named exactly as listed in manifest.json
 * (e.g. "orale:plan", "orale:tasks", "orale:review") so that
 * Claude Code discovers them as /orale:plan, /orale:tasks, /orale:review.
 *
 * The skill folder name MUST match the `name` field in SKILL.md (Claude Code
 * validates this). Using the colon-prefixed name gives the /orale: namespace
 * without requiring the plugin/marketplace system.
 *
 * @param targetDir - The `.claude/skills` directory inside the project.
 */
export async function installer(targetDir: string): Promise<void> {
  await mkdir(targetDir, { recursive: true });

  let manifest: SkillManifest;
  try {
    const raw = await readFile(join(SKILLS_SOURCE_DIR, 'manifest.json'), 'utf8');
    manifest = JSON.parse(raw) as SkillManifest;
  } catch {
    throw new Error(
      `Could not read skills manifest at ${join(SKILLS_SOURCE_DIR, 'manifest.json')}`,
    );
  }

  for (const skillName of manifest.skills) {
    // Source: skills/orale:plan/SKILL.md
    // Target: <targetDir>/orale:plan/SKILL.md
    const srcSkillDir = join(SKILLS_SOURCE_DIR, skillName);
    const dstSkillDir = join(targetDir, skillName);

    await mkdir(dstSkillDir, { recursive: true });

    const files = await readdir(srcSkillDir);
    for (const file of files) {
      await copyFile(join(srcSkillDir, file), join(dstSkillDir, file));
    }
  }

  await writeFile(join(targetDir, '.installed-version'), manifest.version);
}

export async function getInstalledVersion(targetDir: string): Promise<string | null> {
  try {
    return (await readFile(join(targetDir, '.installed-version'), 'utf8')).trim();
  } catch {
    return null;
  }
}

export async function getAvailableVersion(): Promise<string> {
  const raw = await readFile(join(SKILLS_SOURCE_DIR, 'manifest.json'), 'utf8');
  const manifest = JSON.parse(raw) as SkillManifest;
  return manifest.version;
}
