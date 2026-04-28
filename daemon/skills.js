// Skill registry. Scans <projectRoot>/skills/* for SKILL.md files, parses
// front-matter, returns listing. No watching in this MVP — re-scans on every
// GET /api/skills, which is fine for dozens of skills.

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseFrontmatter } from './frontmatter.js';

export async function listSkills(skillsRoot) {
  const out = [];
  let entries = [];
  try {
    entries = await readdir(skillsRoot, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(skillsRoot, entry.name);
    const skillPath = path.join(dir, 'SKILL.md');
    try {
      const stats = await stat(skillPath);
      if (!stats.isFile()) continue;
      const raw = await readFile(skillPath, 'utf8');
      const { data, body } = parseFrontmatter(raw);
      const hasAttachments = await dirHasAttachments(dir);
      const mode = data.ocd?.mode || inferMode(body, data.description);
      out.push({
        id: data.name || entry.name,
        name: data.name || entry.name,
        description: data.description || '',
        triggers: Array.isArray(data.triggers) ? data.triggers : [],
        mode,
        platform: normalizePlatform(data.ocd?.platform, mode, body, data.description),
        scenario: normalizeScenario(data.ocd?.scenario, body, data.description),
        previewType: data.ocd?.preview?.type || 'html',
        designSystemRequired: data.ocd?.design_system?.requires ?? true,
        defaultFor: normalizeDefaultFor(data.ocd?.default_for),
        upstream: typeof data.ocd?.upstream === 'string' ? data.ocd.upstream : null,
        featured: normalizeFeatured(data.ocd?.featured),
        examplePrompt: derivePrompt(data),
        body: hasAttachments ? withSkillRootPreamble(body, dir) : body,
        dir,
      });
    } catch {
      // Skip unreadable entries — this is discovery, not validation.
    }
  }
  return out;
}

// Skills that ship side files (e.g. `assets/template.html`, `references/*.md`)
// need the agent to know where the skill lives on disk — relative paths in the
// SKILL.md body resolve against the agent's CWD, which is the daemon root, not
// the skill folder. We prepend a short preamble so any capable code agent can
// open those files via absolute paths.
function withSkillRootPreamble(body, dir) {
  const preamble = [
    '> **Skill root (absolute):** `' + dir + '`',
    '>',
    '> This skill ships side files alongside `SKILL.md`. When the workflow',
    '> below references relative paths such as `assets/template.html` or',
    '> `references/layouts.md`, resolve them against the skill root above and',
    '> open them via their full absolute path.',
    '',
    '',
  ].join('\n');
  return preamble + body;
}

async function dirHasAttachments(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.some(
      (e) => e.name !== 'SKILL.md' && (e.isDirectory() || /\.(md|html|css|js|json|txt)$/i.test(e.name)),
    );
  } catch {
    return false;
  }
}

function normalizeDefaultFor(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

// Coerce `ocd.featured` into a numeric priority. Lower numbers float to the
// top of the Examples gallery; `true` is treated as priority 1; anything
// missing/unrecognised becomes null so non-featured skills keep their
// natural alphabetical order.
function normalizeFeatured(value) {
  if (value === true) return 1;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// Prefer an explicitly authored `ocd.example_prompt`. Fall back to the
// skill description's first sentence — it's already written in actionable
// language ("Admin / analytics dashboard in a single HTML file…") so it
// serves as a passable starter prompt.
function derivePrompt(data) {
  const explicit = data.ocd?.example_prompt;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  const desc = typeof data.description === 'string' ? data.description.trim() : '';
  if (!desc) return '';
  const collapsed = desc.replace(/\s+/g, ' ').trim();
  const firstSentence = collapsed.match(/^.+?[.!?。！？](?:\s|$)/)?.[0]?.trim();
  return (firstSentence || collapsed).slice(0, 320);
}

function inferMode(body, description) {
  const hay = `${description ?? ''}\n${body ?? ''}`.toLowerCase();
  if (/\bppt|deck|slide|presentation|幻灯|投影/.test(hay)) return 'deck';
  if (/\bdesign[- ]system|\bdesign\.md|\bdesign tokens/.test(hay)) return 'design-system';
  if (/\btemplate\b/.test(hay)) return 'template';
  return 'prototype';
}

// Validate platform tag — only desktop / mobile are meaningful for the
// Examples gallery. Falls back to autodetecting "mobile" from descriptions
// so legacy skills sort under the right pill without authoring changes.
function normalizePlatform(value, mode, body, description) {
  if (value === 'desktop' || value === 'mobile') return value;
  if (mode !== 'prototype') return null;
  const hay = `${description ?? ''}\n${body ?? ''}`.toLowerCase();
  if (/mobile|phone|ios|android|手机|移动端/.test(hay)) return 'mobile';
  return 'desktop';
}

// Normalise a scenario tag to a small fixed vocabulary so the filter pills
// stay tidy. Unknown values pass through verbatim so authors can experiment;
// missing values default to "general".
const KNOWN_SCENARIOS = new Set([
  'general',
  'engineering',
  'product',
  'design',
  'marketing',
  'sales',
  'finance',
  'hr',
  'operations',
  'support',
  'legal',
  'education',
  'personal',
]);
function normalizeScenario(value, body, description) {
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v) return v;
  }
  const hay = `${description ?? ''}\n${body ?? ''}`.toLowerCase();
  if (/finance|invoice|expense|budget|p&l|revenue/.test(hay)) return 'finance';
  if (/\bhr\b|onboarding|payroll|employee|人事/.test(hay)) return 'hr';
  if (/marketing|campaign|brand|landing/.test(hay)) return 'marketing';
  if (/runbook|incident|deploy|engineering|sre|api/.test(hay)) return 'engineering';
  if (/spec|prd|roadmap|product manager|product team/.test(hay)) return 'product';
  if (/design system|moodboard|mockup|ui kit/.test(hay)) return 'design';
  if (/sales|quote|proposal|lead/.test(hay)) return 'sales';
  if (/operations|ops|logistics|inventory/.test(hay)) return 'operations';
  return 'general';
}
// Surface the vocabulary so callers (frontend filter UI) could mirror it
// later if they want to. Not exported today, kept here for documentation.
void KNOWN_SCENARIOS;
