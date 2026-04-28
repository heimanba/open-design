import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n';
import type {
  AgentInfo,
  AppConfig,
  DesignSystemSummary,
  Project,
  ProjectTemplate,
  SkillSummary,
} from '../types';
import { DesignsTab } from './DesignsTab';
import { DesignSystemPreviewModal } from './DesignSystemPreviewModal';
import { DesignSystemsTab } from './DesignSystemsTab';
import { ExamplesTab } from './ExamplesTab';
import { Icon } from './Icon';
import { LanguageMenu } from './LanguageMenu';
import { CenteredLoader } from './Loading';
import { NewProjectPanel, type CreateInput, type CreateTab } from './NewProjectPanel';

type TopTab = 'designs' | 'examples' | 'design-systems';

interface Props {
  skills: SkillSummary[];
  designSystems: DesignSystemSummary[];
  projects: Project[];
  templates: ProjectTemplate[];
  defaultDesignSystemId: string | null;
  config: AppConfig;
  agents: AgentInfo[];
  loading?: boolean;
  onCreateProject: (input: CreateInput & { pendingPrompt?: string }) => void;
  onOpenProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onChangeDefaultDesignSystem: (id: string) => void;
  onOpenSettings: () => void;
}

const SIDEBAR_MIN = 320;
const SIDEBAR_MAX = 560;
const SIDEBAR_DEFAULT = 380;
const SIDEBAR_STORAGE_KEY = 'ocd-entry-sidebar-width';

function loadSidebarWidth(): number {
  try {
    const raw = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (!raw) return SIDEBAR_DEFAULT;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return SIDEBAR_DEFAULT;
    return Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, n));
  } catch {
    return SIDEBAR_DEFAULT;
  }
}

export function EntryView({
  skills,
  designSystems,
  projects,
  templates,
  defaultDesignSystemId,
  config,
  agents,
  loading = false,
  onCreateProject,
  onOpenProject,
  onDeleteProject,
  onChangeDefaultDesignSystem,
  onOpenSettings,
}: Props) {
  const t = useT();
  const [topTab, setTopTab] = useState<TopTab>('designs');
  const [previewSystemId, setPreviewSystemId] = useState<string | null>(null);
  const [panelPreset, setPanelPreset] = useState<{
    tab: CreateTab;
    skillId: string | null;
    name: string;
    pendingPrompt?: string;
    nonce: number;
  } | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => loadSidebarWidth());
  const [resizing, setResizing] = useState(false);

  const currentAgent = useMemo(
    () => agents.find((a) => a.id === config.agentId) ?? null,
    [agents, config.agentId],
  );

  const envMetaLine = useMemo(() => {
    if (config.mode === 'api') {
      try {
        return `${config.model} · ${new URL(config.baseUrl).host}`;
      } catch {
        return config.model;
      }
    }
    return currentAgent
      ? `${currentAgent.name}${currentAgent.version ? ` · ${currentAgent.version}` : ''}`
      : t('settings.noAgentSelected');
  }, [config.mode, config.model, config.baseUrl, currentAgent, t]);

  function usePromptFromSkill(skill: SkillSummary) {
    setPanelPreset({
      tab: tabForSkill(skill),
      skillId: skill.id,
      name: skill.name,
      pendingPrompt: skill.examplePrompt || skill.description,
      nonce: Date.now(),
    });
  }

  function previewDesignSystem(id: string) {
    setPreviewSystemId(id);
  }

  const previewSystem = useMemo(
    () => (previewSystemId ? designSystems.find((d) => d.id === previewSystemId) ?? null : null),
    [designSystems, previewSystemId],
  );

  function handleCreate(input: CreateInput) {
    onCreateProject({
      ...input,
      pendingPrompt: panelPreset?.pendingPrompt,
    });
  }

  const startWidthRef = useRef(0);
  const startXRef = useRef(0);

  useEffect(() => {
    if (!resizing) return;
    function onMove(e: MouseEvent) {
      const dx = e.clientX - startXRef.current;
      const next = Math.max(
        SIDEBAR_MIN,
        Math.min(SIDEBAR_MAX, startWidthRef.current + dx),
      );
      setSidebarWidth(next);
    }
    function onUp() {
      setResizing(false);
    }
    document.body.classList.add('entry-resizing');
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      document.body.classList.remove('entry-resizing');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizing]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidth));
    } catch {
      /* ignore */
    }
  }, [sidebarWidth]);

  return (
    <div
      className="entry"
      style={{ gridTemplateColumns: `${sidebarWidth}px 1fr` }}
    >
      <aside className="entry-side" style={{ width: sidebarWidth }}>
        <div className="entry-brand">
          <span className="entry-brand-mark" aria-hidden>
            <img src="/logo.svg" alt="" className="brand-mark-img" draggable={false} />
          </span>
          <div className="entry-brand-text">
            <div className="entry-brand-title-row">
              <span className="entry-brand-title">{t('app.brand')}</span>
              <span className="entry-brand-pill">{t('app.brandPill')}</span>
            </div>
            <div className="entry-brand-subtitle">{t('app.brandSubtitle')}</div>
          </div>
        </div>
        <NewProjectPanel
          key={panelPreset?.nonce ?? 'default'}
          skills={skills}
          designSystems={designSystems}
          defaultDesignSystemId={defaultDesignSystemId}
          templates={templates}
          onCreate={handleCreate}
          presetTab={panelPreset?.tab}
          presetSkillId={panelPreset?.skillId ?? null}
          presetName={panelPreset?.name}
          loading={loading}
        />
        <div className="entry-side-foot">
          <button
            type="button"
            className="foot-pill"
            onClick={onOpenSettings}
            title={t('settings.envConfigure')}
          >
            <Icon name="settings" size={12} />
            <span>
              {config.mode === 'daemon'
                ? t('settings.localCli')
                : t('settings.anthropicApi')}
            </span>
            <span style={{ color: 'var(--text-faint)' }}>·</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
              {envMetaLine}
            </span>
          </button>
          <LanguageMenu />
        </div>
        <button
          type="button"
          aria-label={t('entry.resizeAria')}
          className={`entry-side-resizer${resizing ? ' dragging' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            startWidthRef.current = sidebarWidth;
            startXRef.current = e.clientX;
            setResizing(true);
          }}
        />
      </aside>
      <main className="entry-main">
        <div className="entry-header">
          <div className="entry-tabs" role="tablist">
            <TopTabButton current={topTab} value="designs" label={t('entry.tabDesigns')} onClick={setTopTab} />
            <TopTabButton current={topTab} value="examples" label={t('entry.tabExamples')} onClick={setTopTab} />
            <TopTabButton
              current={topTab}
              value="design-systems"
              label={t('entry.tabDesignSystems')}
              onClick={setTopTab}
            />
          </div>
          <div className="entry-header-right">
            {/* Avatar settings live next to tabs to mirror the project view. */}
            <button
              type="button"
              className="avatar-btn"
              onClick={onOpenSettings}
              title={t('entry.openSettingsTitle')}
              aria-label={t('entry.openSettingsAria')}
            >
              <img
                src="/avatar.png"
                alt=""
                aria-hidden
                draggable={false}
                className="avatar-btn-photo"
              />
            </button>
          </div>
        </div>
        <div className="entry-tab-content">
          {loading ? (
            <CenteredLoader label={t('entry.loadingWorkspace')} />
          ) : (
            <>
              {topTab === 'designs' ? (
                <DesignsTab
                  projects={projects}
                  skills={skills}
                  designSystems={designSystems}
                  onOpen={onOpenProject}
                  onDelete={onDeleteProject}
                />
              ) : null}
              {topTab === 'examples' ? (
                <ExamplesTab skills={skills} onUsePrompt={usePromptFromSkill} />
              ) : null}
              {topTab === 'design-systems' ? (
                <DesignSystemsTab
                  systems={designSystems}
                  selectedId={defaultDesignSystemId}
                  onSelect={onChangeDefaultDesignSystem}
                  onPreview={previewDesignSystem}
                />
              ) : null}
            </>
          )}
        </div>
      </main>
      {previewSystem ? (
        <DesignSystemPreviewModal
          system={previewSystem}
          onClose={() => setPreviewSystemId(null)}
        />
      ) : null}
    </div>
  );
}

function TopTabButton({
  current,
  value,
  label,
  onClick,
}: {
  current: TopTab;
  value: TopTab;
  label: string;
  onClick: (v: TopTab) => void;
}) {
  return (
    <button
      role="tab"
      aria-selected={current === value}
      className={`entry-tab ${current === value ? 'active' : ''}`}
      onClick={() => onClick(value)}
    >
      {label}
    </button>
  );
}

function tabForSkill(skill: SkillSummary): CreateTab {
  if (skill.mode === 'deck') return 'deck';
  if (skill.mode === 'prototype') return 'prototype';
  return 'template';
}
