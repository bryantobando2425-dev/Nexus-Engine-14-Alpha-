import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  PlayMode,
  ActiveRun,
  EmotionalClimate,
  NarrativeTurn,
  AppSettings,
  WorldBuilderConfig,
  NPCCard,
  InventoryItem,
  CharacterDescriptors,
  RealisticAttributes,
  Faccion,
  MemoriaNarrador,
  PartesDelCuerpo,
} from '../engine/types';

export interface ProviderSessionStats {
  inputTokens: number;
  outputTokens: number;
  calls: number;
  hybridTurns: number;
}

export interface SessionStats {
  gemini: ProviderSessionStats;
  anthropic: ProviderSessionStats;
  lastTurn: {
    provider: 'gemini' | 'anthropic' | null;
    inputTokens: number;
    outputTokens: number;
    wasHybrid: boolean;
  } | null;
}

const defaultProviderStats = (): ProviderSessionStats => ({
  inputTokens: 0, outputTokens: 0, calls: 0, hybridTurns: 0,
});

const defaultSessionStats = (): SessionStats => ({
  gemini: defaultProviderStats(),
  anthropic: defaultProviderStats(),
  lastTurn: null,
});

interface EngineState {
  playerId: string | null;
  setPlayerId: (id: string) => void;

  sessionStats: SessionStats;
  lifetimeStats: SessionStats;
  recordUsage: (provider: 'gemini' | 'anthropic', usage: { inputTokens: number; outputTokens: number; estimated?: boolean }) => void;
  updateSessionStats: (provider: 'gemini' | 'anthropic', usage: { inputTokens: number; outputTokens: number }, isHybrid?: boolean) => void;
  setLastTurnStats: (stats: SessionStats['lastTurn']) => void;
  resetSessionStats: () => void;
  resetLifetimeStats: (provider?: 'gemini' | 'anthropic') => void;

  currentGame: string | null;
  setCurrentGame: (gameId: string | null) => void;

  playMode: PlayMode;
  setPlayMode: (mode: PlayMode) => void;

  activeRun: ActiveRun | null;
  setActiveRun: (run: ActiveRun | null) => void;
  updateActiveRun: (partial: Partial<ActiveRun>) => void;

  addNarrativeTurn: (turn: NarrativeTurn) => void;
  updateLastNarrativeTurn: (partial: Partial<NarrativeTurn>) => void;
  addInnerVoice: (thought: string) => void;
  setSuggestedActions: (actions: string[]) => void;
  setEmotionalClimate: (climate: EmotionalClimate) => void;
  addNPC: (npc: NPCCard) => void;
  updateNPC: (id: string, partial: Partial<NPCCard>) => void;
  addInventoryItem: (item: InventoryItem) => void;
  removeInventoryItem: (id: string) => void;
  addPersonalHistoryEvent: (event: { date: string; year?: number; month?: number; day?: number; description: string; emotionalWeight: number }) => void;
  updateDescriptors: (partial: Partial<CharacterDescriptors>) => void;
  updateRealisticAttributes: (partial: Partial<RealisticAttributes>) => void;
  updateBodyParts: (partial: Partial<PartesDelCuerpo>) => void;
  addFaccion: (faccion: Faccion) => void;
  updateFaccion: (id: string, partial: Partial<Faccion>) => void;
  updateMemoriaNarrador: (partial: Partial<MemoriaNarrador>) => void;
  addExploredLocation: (loc: { name: string; description: string; visitedAt: string; territory?: string | null; region?: string | null; sensoryDescription?: string | null; type?: string | null; climate?: string | null; fauna?: string | null; geographyDetails?: string | null }) => void;

  pastRuns: Array<{
    runId: string;
    gameId: string;
    summary?: string;
    character?: any;
    eraConfig?: any;
    endCause?: string;
    endedAt?: number;
    turnCount?: number;
    moments?: Array<{ imageUrl: string; date: string; context: string }>;
  }>;
  addPastRun: (run: EngineState['pastRuns'][number]) => void;

  savedWorlds: WorldBuilderConfig[];
  saveWorld: (world: WorldBuilderConfig) => void;
  deleteWorld: (id: string) => void;

  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => void;

  narrativeVoice: 'third_person' | 'first_person' | 'world_speaks';
  setNarrativeVoice: (v: 'third_person' | 'first_person' | 'world_speaks') => void;

  achievements: Array<{ id: string; name: string; description: string; unlockedAt: string; runId: string }>;
  unlockAchievement: (a: EngineState['achievements'][number]) => void;

  globalInstructions: string;
  setGlobalInstructions: (instructions: string) => void;

  savedGames: ActiveRun[];
  saveRunToLibrary: (run: ActiveRun) => void;
  deleteSavedGame: (runId: string) => void;

  sectionTemplates: Array<{
    id: string;
    title: string;
    icon: string;
    scope: string;
    fields: Array<{ key: string; value: string; type: string; aiManaged: boolean }>;
    createdAt: number;
  }>;
  saveSectionTemplate: (section: { title: string; icon?: string; scope?: string; fields?: any[] }) => void;
  deleteSectionTemplate: (id: string) => void;
}

export const useEngineStore = create<EngineState>()(
  persist(
    (set) => ({
      sessionStats: defaultSessionStats(),
      lifetimeStats: defaultSessionStats(),
      recordUsage: (provider, usage) =>
        set((state) => {
          const sPrev = state.sessionStats[provider];
          const lPrev = state.lifetimeStats[provider];
          const lastTurn = {
            provider,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            wasHybrid: false,
          };
          return {
            sessionStats: {
              ...state.sessionStats,
              [provider]: {
                inputTokens: sPrev.inputTokens + usage.inputTokens,
                outputTokens: sPrev.outputTokens + usage.outputTokens,
                calls: sPrev.calls + 1,
                hybridTurns: sPrev.hybridTurns,
              },
              lastTurn,
            },
            lifetimeStats: {
              ...state.lifetimeStats,
              [provider]: {
                inputTokens: lPrev.inputTokens + usage.inputTokens,
                outputTokens: lPrev.outputTokens + usage.outputTokens,
                calls: lPrev.calls + 1,
                hybridTurns: lPrev.hybridTurns,
              },
              lastTurn,
            },
          };
        }),
      updateSessionStats: (provider, usage, isHybrid = false) =>
        set((state) => {
          const prev = state.sessionStats[provider];
          return {
            sessionStats: {
              ...state.sessionStats,
              [provider]: {
                inputTokens: prev.inputTokens + (isHybrid ? 0 : usage.inputTokens),
                outputTokens: prev.outputTokens + (isHybrid ? 0 : usage.outputTokens),
                calls: prev.calls + (isHybrid ? 0 : 1),
                hybridTurns: prev.hybridTurns + (isHybrid ? 1 : 0),
              },
            },
          };
        }),
      setLastTurnStats: (stats) =>
        set((state) => ({ sessionStats: { ...state.sessionStats, lastTurn: stats } })),
      resetSessionStats: () => set({ sessionStats: defaultSessionStats() }),
      resetLifetimeStats: (provider) =>
        set((state) => {
          if (!provider) return { lifetimeStats: defaultSessionStats() };
          return {
            lifetimeStats: {
              ...state.lifetimeStats,
              [provider]: defaultProviderStats(),
            },
          };
        }),

      playerId: null,
      setPlayerId: (id) => set({ playerId: id }),

      currentGame: null,
      setCurrentGame: (gameId) => set({ currentGame: gameId }),

      playMode: 'HUMANO',
      setPlayMode: (mode) => set({ playMode: mode }),

      activeRun: null,
      setActiveRun: (run) => set({ activeRun: run }),
      updateActiveRun: (partial) =>
        set((state) => ({
          activeRun: state.activeRun ? { ...state.activeRun, ...partial } : null,
        })),

      addNarrativeTurn: (turn) =>
        set((state) => ({
          activeRun: state.activeRun
            ? {
                ...state.activeRun,
                narrativeHistory: [...state.activeRun.narrativeHistory, turn],
                turnCount: (state.activeRun.turnCount || 0) + 1,
              }
            : null,
        })),

      updateLastNarrativeTurn: (partial) =>
        set((state) => {
          if (!state.activeRun) return {};
          const history = [...state.activeRun.narrativeHistory];
          if (history.length === 0) return {};
          history[history.length - 1] = { ...history[history.length - 1], ...partial };
          return { activeRun: { ...state.activeRun, narrativeHistory: history } };
        }),

      addInnerVoice: (thought) =>
        set((state) => ({
          activeRun: state.activeRun
            ? {
                ...state.activeRun,
                innerVoiceLog: [...state.activeRun.innerVoiceLog.slice(-9), thought],
              }
            : null,
        })),

      setSuggestedActions: (actions) =>
        set((state) => ({
          activeRun: state.activeRun ? { ...state.activeRun, suggestedActions: actions } : null,
        })),

      setEmotionalClimate: (climate) =>
        set((state) => ({
          activeRun: state.activeRun ? { ...state.activeRun, emotionalClimate: climate } : null,
        })),

      addNPC: (npc) =>
        set((state) => ({
          activeRun: state.activeRun
            ? { ...state.activeRun, npcs: [...(state.activeRun.npcs || []), npc] }
            : null,
        })),

      updateNPC: (id, partial) =>
        set((state) => ({
          activeRun: state.activeRun
            ? {
                ...state.activeRun,
                npcs: (state.activeRun.npcs || []).map((n) =>
                  n.id === id ? { ...n, ...partial } : n
                ),
              }
            : null,
        })),

      addInventoryItem: (item) =>
        set((state) => ({
          activeRun: state.activeRun
            ? { ...state.activeRun, inventory: [...(state.activeRun.inventory || []), item] }
            : null,
        })),

      removeInventoryItem: (id) =>
        set((state) => ({
          activeRun: state.activeRun
            ? {
                ...state.activeRun,
                inventory: (state.activeRun.inventory || []).filter((i) => i.id !== id),
              }
            : null,
        })),

      addPersonalHistoryEvent: (event) =>
        set((state) => ({
          activeRun: state.activeRun
            ? {
                ...state.activeRun,
                personalHistory: [...(state.activeRun.personalHistory || []), event],
              }
            : null,
        })),

      updateDescriptors: (partial) =>
        set((state) => ({
          activeRun: state.activeRun
            ? {
                ...state.activeRun,
                descriptors: { ...state.activeRun.descriptors, ...partial },
              }
            : null,
        })),

      updateRealisticAttributes: (partial) =>
        set((state) => ({
          activeRun: state.activeRun
            ? {
                ...state.activeRun,
                realisticAttributes: { ...state.activeRun.realisticAttributes, ...partial },
              }
            : null,
        })),

      updateBodyParts: (partial) =>
        set((state) => ({
          activeRun: state.activeRun
            ? {
                ...state.activeRun,
                partesDelCuerpo: { ...(state.activeRun.partesDelCuerpo || { cabeza: 'Sano', torso: 'Sano', brazoDerecho: 'Sano', brazoIzquierdo: 'Sano', piernaDerecha: 'Sano', piernaIzquierda: 'Sano' }), ...partial },
              }
            : null,
        })),

      addFaccion: (faccion) =>
        set((state) => ({
          activeRun: state.activeRun
            ? { ...state.activeRun, facciones: [...(state.activeRun.facciones || []), faccion] }
            : null,
        })),

      updateFaccion: (id, partial) =>
        set((state) => ({
          activeRun: state.activeRun
            ? {
                ...state.activeRun,
                facciones: (state.activeRun.facciones || []).map((f) =>
                  f.id === id ? { ...f, ...partial } : f
                ),
              }
            : null,
        })),

      updateMemoriaNarrador: (partial) =>
        set((state) => ({
          activeRun: state.activeRun
            ? {
                ...state.activeRun,
                memoriaNarrador: { ...(state.activeRun.memoriaNarrador || { notasLibres: '', reglasDeLaPartida: '', hechosCanonicos: [], resumen: '' }), ...partial },
              }
            : null,
        })),

      addExploredLocation: (loc) =>
        set((state) => {
          if (!state.activeRun) return {};
          const existing = (state.activeRun.exploredLocations || []);
          if (existing.some((l) => l.name === loc.name)) return {};
          return {
            activeRun: { ...state.activeRun, exploredLocations: [...existing, loc] },
          };
        }),

      pastRuns: [],
      addPastRun: (run) =>
        set((state) => ({ pastRuns: [run, ...state.pastRuns].slice(0, 50) })),

      savedWorlds: [],
      saveWorld: (world) =>
        set((state) => ({
          savedWorlds: [world, ...state.savedWorlds.filter((w) => w.id !== world.id)],
        })),
      deleteWorld: (id) =>
        set((state) => ({ savedWorlds: state.savedWorlds.filter((w) => w.id !== id) })),

      settings: {
        aiProvider: 'gemini',
        explicitMode: false,
        explicitSubToggles: {
          violence: false,
          language: false,
          sexual: false,
          torture: false,
          substances: false,
          psychologicalTrauma: false,
        },
        showNpcDescriptors: false,
        otherPerspectives: false,
        defaultVoice: 'third_person',
        textSize: 'md',
        imageGenEnabled: true,
        subjectiveTime: true,
        narrativeIntensity: 'normal',
        narrativeRhythm: 'normal',
      },
      updateSettings: (partial) =>
        set((state) => ({ settings: { ...state.settings, ...partial } })),

      narrativeVoice: 'third_person',
      setNarrativeVoice: (v) => set({ narrativeVoice: v }),

      achievements: [],
      unlockAchievement: (a) =>
        set((state) => ({
          achievements: state.achievements.find((x) => x.id === a.id)
            ? state.achievements
            : [...state.achievements, a],
        })),

      globalInstructions: '',
      setGlobalInstructions: (instructions) => set({ globalInstructions: instructions }),

      savedGames: [],
      saveRunToLibrary: (run) =>
        set((state) => {
          const withTimestamp = { ...run, savedAt: Date.now() };
          const idx = state.savedGames.findIndex((g) => g.runId === run.runId);
          if (idx >= 0) {
            const copy = [...state.savedGames];
            copy[idx] = withTimestamp;
            return { savedGames: copy };
          }
          return { savedGames: [withTimestamp, ...state.savedGames].slice(0, 20) };
        }),
      deleteSavedGame: (runId) =>
        set((state) => ({ savedGames: state.savedGames.filter((g) => g.runId !== runId) })),

      sectionTemplates: [],
      saveSectionTemplate: (section) =>
        set((state) => {
          const existing = (state.sectionTemplates || []);
          if (existing.some((t) => t.title?.toLowerCase() === section.title?.toLowerCase())) {
            return { sectionTemplates: existing.map((t) => t.title?.toLowerCase() === section.title?.toLowerCase()
              ? { ...t, icon: section.icon || t.icon, scope: section.scope || t.scope, fields: (section.fields || []).map((f: any) => ({ ...f, value: '' })), createdAt: Date.now() }
              : t) };
          }
          return {
            sectionTemplates: [{
              id: 'tpl-' + Date.now(),
              title: section.title || 'Plantilla',
              icon: section.icon || '',
              scope: section.scope || 'global',
              fields: (section.fields || []).map((f: any) => ({ key: f.key, value: '', type: f.type || 'text', aiManaged: f.aiManaged !== false })),
              createdAt: Date.now(),
            }, ...existing].slice(0, 50),
          };
        }),
      deleteSectionTemplate: (id) =>
        set((state) => ({ sectionTemplates: (state.sectionTemplates || []).filter((t) => t.id !== id) })),
    }),
    {
      name: 'nexus-engine-v4',
      merge: (persisted, current) => {
        const saved = persisted as Partial<EngineState> | undefined;
        return {
          ...current,
          ...saved,
          settings: {
            ...current.settings,
            ...(saved?.settings || {}),
            aiProvider: saved?.settings?.aiProvider || current.settings.aiProvider,
          },
          activeRun: saved?.activeRun
            ? { ...saved.activeRun, aiProvider: saved.activeRun.aiProvider || saved.settings?.aiProvider || current.settings.aiProvider }
            : current.activeRun,
          savedGames: (saved?.savedGames || current.savedGames).map((run) => ({
            ...run,
            aiProvider: run.aiProvider || saved?.settings?.aiProvider || current.settings.aiProvider,
          })),
        } as EngineState;
      },
      partialize: (state) => ({
        playerId: state.playerId,
        currentGame: state.currentGame,
        playMode: state.playMode,
        activeRun: state.activeRun,
        pastRuns: state.pastRuns,
        savedWorlds: state.savedWorlds,
        settings: state.settings,
        narrativeVoice: state.narrativeVoice,
        achievements: state.achievements,
        globalInstructions: state.globalInstructions,
        savedGames: state.savedGames,
        lifetimeStats: state.lifetimeStats,
        sectionTemplates: state.sectionTemplates,
      }),
    }
  )
);
