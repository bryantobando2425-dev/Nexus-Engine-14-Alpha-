import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import {
  Send, Map as MapIcon, User, Globe, Users, Settings as SettingsIcon,
  Save, X, ArrowLeft, ChevronDown, ChevronUp, Moon,
  Crown, Sword, Wind, Flame, Skull, Sparkles, Info, FastForward,
  Clock, Shield, Brain, Plus, Trash2, BookOpen, MapPin, Heart,
  AlertTriangle, CheckCircle, Eye, Star, ChevronRight, RefreshCw,
  Undo2, Church, Banknote, Layers, TreePine, Compass, Scroll,
  Hammer, BookMarked, RotateCcw, Wrench, Volume2, Feather, ZoomIn, ZoomOut,
  Pencil, Wand2, Database
} from 'lucide-react';
import { useEngineStore } from '@/store/engine-store';
import { generateNarrativeStream, generateDream, saveStateToServer, loadStateFromServer, generateStateUpdate, suggestFieldValue, updateAIMemory, suggestSection } from '@/lib/api';
import type { NarrativeTurn, NPCCard, RealisticAttributes, Faccion, PartesDelCuerpo } from '@/engine/types';
import { ATTRIBUTE_TUTORIALS, isFamilyRole, MESES_MEDIEVALES, DEFAULT_BODY_PARTS } from '@/engine/types';
import 'leaflet/dist/leaflet.css';

const MINUTES_PER_YEAR = 525960;
const SCHEMA_VERSION = "4.9";

const STATE_SECTION_OPTIONS = ['Personaje', 'NPCs', 'Facciones', 'Mundo', 'Mapa', 'Fecha/Tiempo', 'Inventario', 'Descriptores', 'Atributos', 'Habilidades', 'Psicología', 'Relaciones', 'Consecuencias', 'Secciones personalizadas'] as const;
const CUSTOM_SECTION_SCOPES = [
  { id: 'global', label: 'Todas' },
  { id: 'narrative', label: 'Narración' },
  { id: 'character', label: 'Personaje' },
  { id: 'world', label: 'Mundo' },
  { id: 'map', label: 'Mapa' },
  { id: 'npcs', label: 'NPCs' },
  { id: 'facciones', label: 'Facciones' },
] as const;
const CUSTOM_FIELD_TYPES = ['text', 'number', 'list', 'state', 'progress', 'date', 'tags', 'header', 'table', 'columns'] as const;

function isObjectValue(value: any): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function withoutNulls<T = any>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => withoutNulls(item)).filter((item) => item !== null && item !== undefined) as T;
  if (!isObjectValue(value)) return value;
  const next: Record<string, any> = {};
  Object.entries(value).forEach(([key, entry]) => {
    if (entry === null || entry === undefined) return;
    next[key] = withoutNulls(entry);
  });
  return next as T;
}

function mergeDefined<T extends Record<string, any>>(base: T, patch?: Record<string, any> | null): T {
  if (!isObjectValue(patch)) return base;
  return { ...base, ...withoutNulls(patch) } as T;
}

function stableEntityId(prefix: string, name?: string) {
  const raw = (name || Date.now().toString()).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || Date.now().toString();
  return prefix + '-' + raw;
}

function normalizeFieldValue(field: any) {
  if (!isObjectValue(field)) return String(field ?? '');
  if (Array.isArray(field.value)) return field.value.join(', ');
  return field.value ?? '';
}

function applyCustomSectionPayload(currentSections: any[] = [], payload: any, defaultScope = 'global') {
  if (!payload) return currentSections;
  const incoming = Array.isArray(payload) ? payload : Object.entries(payload).map(([title, value]) => ({ title, fields: isObjectValue(value) ? Object.entries(value).map(([key, fieldValue]) => ({ key, value: fieldValue })) : [{ key: 'Valor', value }] }));
  let sections = [...currentSections];
  incoming.forEach((sectionUpdate: any) => {
    const title = sectionUpdate.title || sectionUpdate.name || sectionUpdate.sectionTitle;
    if (!title) return;
    const id = sectionUpdate.id || sections.find((s) => (s.title || '').toLowerCase() === String(title).toLowerCase())?.id || stableEntityId('cs', title);
    const idx = sections.findIndex((s) => s.id === id || (s.title || '').toLowerCase() === String(title).toLowerCase());
    const previous = idx >= 0 ? sections[idx] : { id, title, scope: sectionUpdate.scope || sectionUpdate.panel || defaultScope, icon: sectionUpdate.icon || '', fields: [] };
    const rawFields = Array.isArray(sectionUpdate.fields)
      ? sectionUpdate.fields
      : isObjectValue(sectionUpdate.values)
        ? Object.entries(sectionUpdate.values).map(([key, value]) => ({ key, value }))
        : [];
    const nextFields = [...(previous.fields || [])];
    rawFields.forEach((field: any) => {
      const key = field.key || field.name || field.label;
      if (!key) return;
      const fieldIdx = nextFields.findIndex((f: any) => (f.key || '').toLowerCase() === String(key).toLowerCase());
      const nextField = {
        ...(fieldIdx >= 0 ? nextFields[fieldIdx] : {}),
        key: String(key),
        value: String(normalizeFieldValue(field)),
        type: field.type || (fieldIdx >= 0 ? nextFields[fieldIdx].type : 'text'),
        icon: field.icon || (fieldIdx >= 0 ? nextFields[fieldIdx].icon : ''),
        aiManaged: field.aiManaged ?? field.ai_managed ?? (fieldIdx >= 0 ? nextFields[fieldIdx].aiManaged : true),
      };
      if (fieldIdx >= 0) nextFields[fieldIdx] = nextField;
      else nextFields.push(nextField);
    });
    const nextSection = { ...previous, ...withoutNulls(sectionUpdate), id: previous.id || id, title: previous.title || title, scope: sectionUpdate.scope || sectionUpdate.panel || previous.scope || defaultScope, fields: nextFields };
    if (idx >= 0) sections[idx] = nextSection;
    else sections.push(nextSection);
  });
  return sections;
}


function migrateRunState(run: any): any {
  const defaults: Record<string, any> = {
    npcs: [],
    facciones: [],
    inventory: [],
    narrativeHistory: [],
    personalHistory: [],
    consequenceQueue: [],
    traumas: [],
    innerVoiceLog: [],
    exploredLocations: [],
    realisticAttributes: {},
    descriptors: {},
    memoriaNarrador: { notasLibres: '', reglasDeLaPartida: '', hechosCanonicos: [], resumen: '' },
    totalMinutesElapsed: 0,
    turnCount: 0,
    aiProvider: 'gemini',
    currency: { name: 'moneda', amount: 0 },
    partesDelCuerpo: { cabeza: 'Sano', torso: 'Sano', brazoDerecho: 'Sano', brazoIzquierdo: 'Sano', piernaDerecha: 'Sano', piernaIzquierda: 'Sano' },
    suggestedActions: [],
    emotionalClimate: 'sereno',
    customSections: [],
  };
  const migrated: any = { ...defaults };
  for (const key of Object.keys(run)) {
    if (run[key] !== null && run[key] !== undefined) migrated[key] = run[key];
  }
  if (!migrated.runId) migrated.runId = 'run-imported-' + Date.now();
  if (!migrated.character) migrated.character = {};
  if (!migrated.worldState) migrated.worldState = {};
  if (!migrated.eraConfig) migrated.eraConfig = { eraLabel: 'Era Desconocida', year: 0 };
  return migrated;
}

type PanelId = 'character' | 'world' | 'map' | 'npcs' | 'facciones' | 'editor' | 'save' | 'memoria' | null;
type InputType = 'action' | 'speak' | 'observe' | 'think' | 'free';

const EMOTIONAL_COLORS: Record<string, string> = {
  sereno: '#3d8eff', ansioso: '#f5a623', de_duelo: '#5a6478',
  euforico: '#00d4a8', entumecido: '#2a3040', desesperado: '#ff4444',
  esperanzador: '#00d4a8', traumatizado: '#8b0000',
};

function generateId(): string {
  return 'turn-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}

function formatBudgetMessage(detail: string, currentProvider: 'gemini' | 'anthropic'): string {
  const other = currentProvider === 'gemini' ? 'Claude (Anthropic)' : 'Gemini';
  const providerLabel = currentProvider === 'gemini' ? 'Gemini' : 'Claude (Anthropic)';
  const base = detail && detail.length > 0
    ? detail
    : `El proveedor ${providerLabel} agotó su límite mensual.`;
  return `⚠ ${base}\n\nPuedes cambiar a ${other} en Ajustes para seguir jugando, o esperar a que se renueve el cupo.`;
}

function getAgeDescription(age: number): string {
  if (age < 1) return 'Recién nacido';
  if (age < 3) return `Bebé · ${age} año${age !== 1 ? 's' : ''}`;
  if (age < 6) return `Niño pequeño · ${age} años`;
  if (age < 12) return `Niño · ${age} años`;
  if (age < 16) return `Adolescente · ${age} años`;
  if (age < 18) return `Joven · ${age} años`;
  if (age < 30) return `Adulto joven · ${age} años`;
  if (age < 45) return `Adulto · ${age} años`;
  if (age < 60) return `Maduro · ${age} años`;
  if (age < 75) return `Anciano · ${age} años`;
  return `Longevo · ${age} años`;
}

function SilhouettePortrait({ gender }: { gender?: string }) {
  const g = (gender || '').toLowerCase();
  const isFemale = g.includes('mujer') || g.includes('femen') || g.includes('niña');
  return (
    <svg viewBox="0 0 100 120" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="sg" cx="50%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#252d3d" />
          <stop offset="100%" stopColor="#0f1218" />
        </radialGradient>
      </defs>
      <rect width="100" height="120" fill="url(#sg)" />
      <ellipse cx="50" cy="31" rx="17" ry="19" fill="#1e2530" />
      <ellipse cx="50" cy="31" rx="13" ry="15" fill="#252d3d" />
      {isFemale ? (
        <path d="M22 120 Q24 72 50 66 Q76 72 78 120Z" fill="#1e2530" />
      ) : (
        <path d="M18 120 Q21 68 50 63 Q79 68 82 120Z" fill="#1e2530" />
      )}
    </svg>
  );
}

type UndoSnapshot = {
  history: NarrativeTurn[];
  turnCount: number;
  worldState: any;
  inventory: any[];
  npcs: any[];
  currency: any;
  personalHistory: any[];
  character: any;
};

export default function Game() {
  const { runId } = useParams<{ runId: string }>();
  const [, setLocation] = useLocation();
  const {
    activeRun, addNarrativeTurn, updateLastNarrativeTurn,
    addInnerVoice, setSuggestedActions, setEmotionalClimate,
    updateActiveRun, updateRealisticAttributes, updateDescriptors,
    updateNPC, updateFaccion,
    updateMemoriaNarrador, addExploredLocation,
    settings, narrativeVoice, globalInstructions,
    playerId, setActiveRun, saveRunToLibrary,
    recordUsage, sessionStats,
  } = useEngineStore();

  const [inputText, setInputText] = useState('');
  const [inputType, setInputType] = useState<InputType>('free');
  const [isGenerating, setIsGenerating] = useState(false);
  const [innerVoiceInput, setInnerVoiceInput] = useState('');
  const [showInnerVoice, setShowInnerVoice] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelId>(null);
  const [showConfirmExit, setShowConfirmExit] = useState(false);
  const [statusBarCollapsed, setStatusBarCollapsed] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showDreamSkip, setShowDreamSkip] = useState(false);
  const skipDreamRef = useRef(false);
  const [showTimeAdvance, setShowTimeAdvance] = useState(false);
  const [lastUserAction, setLastUserAction] = useState<string>('');
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<string>('');
  const [showStateUpdatePanel, setShowStateUpdatePanel] = useState(false);
  const [stateUpdateMode, setStateUpdateMode] = useState<'general' | 'sections'>('general');
  const [stateUpdateSections, setStateUpdateSections] = useState<string[]>([]);
  const [isUpdatingState, setIsUpdatingState] = useState(false);
  const [stateUpdateResult, setStateUpdateResult] = useState<string>('');
  const [stateUpdateInstructions, setStateUpdateInstructions] = useState('');
  const [editingField, setEditingField] = useState<{ path: string; label: string; value: string; fieldType?: string } | null>(null);
  const [suggestInput, setSuggestInput] = useState('');
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const lastSyncRef = useRef<number>(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const run = activeRun;
  const history = run?.narrativeHistory || [];
  const emotionalClimate = run?.emotionalClimate || 'sereno';
  const emotionColor = EMOTIONAL_COLORS[emotionalClimate] || '#3d8eff';
  const aiProvider = (run?.aiProvider || settings.aiProvider || 'gemini') as 'gemini' | 'anthropic';

  const pushUndo = useCallback(() => {
    if (!run) return;
    setUndoStack(prev => [...prev.slice(-9), {
      history: [...(run.narrativeHistory || [])],
      turnCount: run.turnCount || 0,
      worldState: { ...run.worldState },
      inventory: [...(run.inventory || [])],
      npcs: [...(run.npcs || [])],
      currency: { ...(run.currency || {}) },
      personalHistory: [...(run.personalHistory || [])],
      character: { ...run.character },
      facciones: [...(run.facciones || [])],
      traumas: [...(run.traumas || [])],
      consequenceQueue: [...(run.consequenceQueue || [])],
      realisticAttributes: { ...run.realisticAttributes },
    }]);
  }, [run]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history.length, isStreaming]);

  useEffect(() => {
    if (run && history.length === 0) {
      handleFirstNarration();
    }
  }, [run?.runId]);

  const syncToServer = useCallback(async () => {
    if (!playerId || !activeRun) return;
    const now = Date.now();
    if (now - lastSyncRef.current < 5000) return;
    lastSyncRef.current = now;
    setIsSyncing(true);
    try {
      await saveStateToServer(playerId, { activeRun, savedAt: now });
    } finally {
      setIsSyncing(false);
    }
  }, [playerId, activeRun]);

  useEffect(() => {
    if (!playerId || !activeRun || activeRun.narrativeHistory.length === 0) return;
    const t = setTimeout(() => { syncToServer(); }, 2000);
    return () => clearTimeout(t);
  }, [activeRun?.turnCount]);

  // Auto-save to local library after each narrative turn
  useEffect(() => {
    if (!activeRun || (activeRun.turnCount ?? 0) === 0) return;
    const t = setTimeout(() => { saveRunToLibrary(activeRun); }, 1500);
    return () => clearTimeout(t);
  }, [activeRun?.turnCount]);

  useEffect(() => {
    if (!playerId) return;
    loadStateFromServer(playerId).then((serverState) => {
      if (!serverState?.activeRun) return;
      const serverSavedAt = serverState._savedAt || 0;
      const localSavedAt = activeRun ? (activeRun.turnCount || 0) : -1;
      const serverTurnCount = serverState.activeRun?.turnCount || 0;
      if (serverTurnCount > localSavedAt && serverSavedAt > 0) {
        setActiveRun(serverState.activeRun);
      }
    });
  }, [playerId]);

  const handleFirstNarration = async () => {
    if (!run) return;
    setIsGenerating(true);
    setIsStreaming(true);

    const placeholder: NarrativeTurn = { id: generateId(), role: 'narrator', text: '', timestamp: Date.now() };
    addNarrativeTurn(placeholder);

    try {
      // Merge beliefs into top-level character fields so the AI prompt reads them correctly
      const birthCharacter = {
        ...run.character,
        religion: run.character?.religion || run.character?.beliefs?.religion,
        motherTongue: run.character?.motherTongue || run.character?.beliefs?.language,
      };
      const result = await generateNarrativeStream({
        playerAction: '__BIRTH__',
        aiProvider,
        voice: narrativeVoice,
        tone: {
          baseRealism: (run.eraConfig?.realismoLevel || 5) / 10,
          explicitMode: settings.explicitMode,
          explicitSubToggles: settings.explicitSubToggles,
          subjectiveTime: settings.subjectiveTime,
          otherPerspectives: settings.otherPerspectives,
          showNpcDescriptors: settings.showNpcDescriptors,
        },
        character: birthCharacter,
        worldState: run.worldState,
        recentHistory: [],
        activeEchoes: [],
        existingNPCs: run.npcs || [],
        facciones: run.facciones || [],
        inventory: run.inventory || [],
        currency: run.currency || {},
        realisticAttributes: run.realisticAttributes,
        descriptors: run.descriptors,
        memoriaNarrador: run.memoriaNarrador,
        consequenceQueue: run.consequenceQueue || [],
        innerVoiceContext: '',
        currentLocation: run.worldState?.currentLocation || { name: 'Mundo', description: '' },
        inGameDateTime: run.worldState?.ingameDate || `Año ${run.eraConfig?.year || 0}`,
        era: run.eraConfig,
        gameConfig: {
          name: 'UNA VIDA',
          narrativePersonality: 'Narra una vida humana en toda su complejidad. El primer turno es el nacimiento. Usa la personalidad, valores, motivación, relaciones de trasfondo e historia de origen del personaje como base permanente e inamovible de todo lo que narre.',
        },
        currentTurn: 0,
        customSections: run.customSections || [],
        globalInstructions,
      }, (_chunk, fullSoFar) => {
        updateLastNarrativeTurn({ text: fullSoFar });
      });

      updateLastNarrativeTurn({
        text: result.narrative,
        mood: result.mood || undefined,
        eventType: result.eventType,
        legacyWeight: result.legacyWeight,
      });
      if (result.suggestedActions?.length) setSuggestedActions(result.suggestedActions);
      if (result.mood) setEmotionalClimate(result.mood as any);
      if ((result as any).tokenUsage) {
        recordUsage(aiProvider, (result as any).tokenUsage);
        updateLastNarrativeTurn({ tokenUsage: { ...(result as any).tokenUsage, provider: aiProvider } });
      }
      // Use latest run from store to avoid stale closure
      const latestRun = useEngineStore.getState().activeRun;
      applyNarrativeResult(result, latestRun || run);
    } catch (err: any) {
      const errMsg = String(err?.message || '');
      if (errMsg.startsWith('BUDGET_EXCEEDED:')) {
        const detail = errMsg.slice('BUDGET_EXCEEDED:'.length).trim();
        updateLastNarrativeTurn({ text: formatBudgetMessage(detail, aiProvider) });
      } else {
        updateLastNarrativeTurn({ text: `El mundo se materializa. Año ${run.eraConfig?.year || '—'}.` });
      }
    } finally {
      setIsGenerating(false);
      setIsStreaming(false);
    }
  };

  const applyNarrativeResult = useCallback((result: Awaited<ReturnType<typeof generateNarrativeStream>>, currentRun: typeof run) => {
    if (!currentRun) return;
    // Defensive helpers: snapshot from AI may be partial/malformed (string placeholders, missing arrays).
    // Only accept fields with the right shape; otherwise keep current state.
    const isObj = (x: any) => x && typeof x === 'object' && !Array.isArray(x);
    const isArr = (x: any) => Array.isArray(x);
    const rawSnap: any = (result as any).fullStateSnapshot || (result as any).stateSnapshot || (result as any).fullState || null;
    const snapshot: any = isObj(rawSnap) ? rawSnap : null;
    const snapChar = isObj(snapshot?.character) ? snapshot.character : null;
    const snapWorld = isObj(snapshot?.worldState) ? snapshot.worldState : null;
    const snapAttrs = isObj(snapshot?.realisticAttributes) ? snapshot.realisticAttributes : null;
    const snapDesc = isObj(snapshot?.descriptors) ? snapshot.descriptors : null;
    const snapCurrency = isObj(snapshot?.currency) ? snapshot.currency : null;
    const snapInventory = isArr(snapshot?.inventory) ? snapshot.inventory : null;
    const snapNpcs = isArr(snapshot?.npcs) ? snapshot.npcs : null;
    const snapFac = isArr(snapshot?.facciones) ? snapshot.facciones : null;
    const snapHistory = isArr(snapshot?.personalHistory) ? snapshot.personalHistory : null;
    const snapConsequences = isArr(snapshot?.consequenceQueue) ? snapshot.consequenceQueue : null;
    const snapTraumas = isArr(snapshot?.traumas) ? snapshot.traumas : null;
    const snapCustomSecs = isArr(snapshot?.customSections) ? snapshot.customSections : null;

    const timeAdvanced = result.timeAdvanced ?? 30;
    const newTotal = snapshot?.totalMinutesElapsed ?? ((currentRun.totalMinutesElapsed || 0) + timeAdvanced);
    const yearsElapsed = Math.floor(newTotal / MINUTES_PER_YEAR);
    const startYear = currentRun.eraConfig?.year || 0;
    const it = isObj(result.ingameTime) ? result.ingameTime as any : (isObj(snapshot?.ingameTime) ? snapshot.ingameTime : {});
    const calculatedYear = startYear + yearsElapsed;
    const newIngameYear = it.year ?? snapWorld?.ingameYear ?? currentRun.worldState?.ingameYear ?? calculatedYear;
    const birthYear = snapChar?.birthYear ?? currentRun.character?.birthYear ?? startYear;
    const newAge = (typeof snapChar?.age === 'number' ? snapChar.age : null) ?? Math.max(0, newIngameYear - birthYear);
    const wsuRaw = isObj(result.worldStateUpdates) ? result.worldStateUpdates as any : {};
    const wsu = mergeDefined(snapWorld ? { ...snapWorld } : {}, wsuRaw);
    const newDay = it.day ?? wsu.ingameDay ?? currentRun.worldState?.ingameDay;
    const newMonth = it.month ?? wsu.ingameMonth ?? currentRun.worldState?.ingameMonth;
    const ingameDateStr = it.ingameDate || wsu.ingameDate || (newDay && newMonth ? String(newDay) + ' de ' + MESES_MEDIEVALES[(Math.max(1, Math.min(12, newMonth)) - 1)] + ', ' + String(newIngameYear) : 'Año ' + String(newIngameYear));

    // Merge arrays by name/id — prevents data loss when AI returns partial arrays.
    // Also ensures every item gets a stable ID so card selection always works.
    const mergeByKey = <T extends Record<string, any>>(current: T[], incoming: T[] | null, key: string = 'name'): T[] => {
      if (!incoming) return current;
      const idPrefix = key === 'id' ? 'cs' : key === 'name' ? 'entity' : key;
      const result: T[] = [...current];
      for (const inc of incoming) {
        if (!inc || (!inc[key] && !inc.id && !inc.name)) continue;
        const idx = result.findIndex((c) =>
          (inc.id && c.id === inc.id) ||
          (inc[key] && c[key] && String(c[key]).toLowerCase() === String(inc[key]).toLowerCase())
        );
        // Ensure incoming item has a stable id
        const ensuredInc: T = inc.id ? inc : { id: stableEntityId(idPrefix, String(inc[key] || inc.name || Date.now())), ...inc } as T;
        if (idx >= 0) result[idx] = { ...result[idx], ...withoutNulls(ensuredInc) };
        else result.push(ensuredInc);
      }
      // Also patch any pre-existing items missing an id (e.g. from old saves)
      return result.map(item => item.id ? item : { ...item, id: stableEntityId(idPrefix, String(item[key] || item.name || Date.now())) });
    };

    let nextRun: any = {
      ...currentRun,
      totalMinutesElapsed: newTotal,
      worldState: {
        ...(currentRun.worldState || {}),
        ...(snapWorld || {}),
        ...withoutNulls(wsu),
        ingameYear: newIngameYear,
        ingameAge: newAge,
        ingameDate: ingameDateStr,
        ...(newDay ? { ingameDay: newDay } : {}),
        ...(newMonth ? { ingameMonth: newMonth } : {}),
        ...(it.timeOfDay ? { timeOfDay: it.timeOfDay } : {}),
        ...(it.dayOfWeek ? { dayOfWeek: it.dayOfWeek } : {}),
      },
      character: {
        ...(currentRun.character || {}),
        ...(snapChar ? withoutNulls(snapChar) : {}),
        age: newAge,
      },
      inventory: snapInventory ? mergeByKey(currentRun.inventory || [], snapInventory) : [...(currentRun.inventory || [])],
      currency: snapCurrency ? { ...(currentRun.currency || {}), ...snapCurrency } : currentRun.currency,
      npcs: snapNpcs ? mergeByKey(currentRun.npcs || [], snapNpcs) : [...(currentRun.npcs || [])],
      facciones: snapFac ? mergeByKey(currentRun.facciones || [], snapFac) : [...(currentRun.facciones || [])],
      personalHistory: snapHistory || [...(currentRun.personalHistory || [])],
      consequenceQueue: snapConsequences || [...(currentRun.consequenceQueue || [])],
      traumas: snapTraumas || [...(currentRun.traumas || [])],
      realisticAttributes: { ...(currentRun.realisticAttributes || {}), ...(snapAttrs || {}) },
      descriptors: { ...(currentRun.descriptors || {}), ...(snapDesc || {}) },
      customSections: snapCustomSecs ? mergeByKey(currentRun.customSections || [], snapCustomSecs, 'id') : [...(currentRun.customSections || [])],
    };

    let newStats = { ...(nextRun.character?.stats || { health: 100, energy: 100, hunger: 50, morale: 70, mentalHealth: 80 }) };
    if (result.characterStatChanges) {
      const c = result.characterStatChanges;
      if (c.health != null) newStats.health = Math.max(0, Math.min(100, (newStats.health || 100) + c.health));
      if (c.energy != null) newStats.energy = Math.max(0, Math.min(100, (newStats.energy || 100) + c.energy));
      if (c.hunger != null) newStats.hunger = Math.max(0, Math.min(100, (newStats.hunger || 50) + c.hunger));
      if (c.morale != null) newStats.morale = Math.max(0, Math.min(100, (newStats.morale || 70) + c.morale));
      if (c.mentalHealth != null) newStats.mentalHealth = Math.max(0, Math.min(100, (newStats.mentalHealth || 80) + c.mentalHealth));
    }
    nextRun.character = { ...nextRun.character, stats: newStats };

    const pu = result.psychologyUpdates || {};
    if (pu.fearAdded) nextRun.character.fears = [...(nextRun.character.fears || []), pu.fearAdded];
    if (pu.desireAdded) nextRun.character.desires = [...(nextRun.character.desires || []), pu.desireAdded];
    if (pu.fearResolved) nextRun.character.fears = (nextRun.character.fears || []).filter((f: string) => !f.toLowerCase().includes((pu.fearResolved || '').toLowerCase()));
    if (pu.traumaAdded) nextRun.traumas = [...(nextRun.traumas || []), { description: pu.traumaAdded, acquiredAt: ingameDateStr, resolved: false }];

    const cfu: any = result.characterFieldUpdates || {};
    const characterPatch = withoutNulls({ ...cfu });
    if (cfu.currentDescription) characterPatch.appearance = { ...(nextRun.character?.appearance || {}), freeDescription: cfu.currentDescription };
    delete characterPatch.currentDescription;
    nextRun.character = { ...nextRun.character, ...characterPatch };

    if (result.inventoryChanges?.add) {
      result.inventoryChanges.add.forEach((item: any) => {
        nextRun.inventory.push({ id: item.id || 'item-' + Date.now() + Math.random(), name: item.name, description: item.description || '', condition: item.condition || 'nuevo', isSpecial: item.isSpecial, category: item.category, quantity: item.quantity, weight: item.weight, isWorn: item.isWorn, wornSlot: item.wornSlot });
      });
    }
    if (result.inventoryChanges?.remove) {
      const removeList: string[] = Array.isArray(result.inventoryChanges.remove) ? result.inventoryChanges.remove : [];
      removeList.forEach((nameOrId: string) => {
        nextRun.inventory = nextRun.inventory.filter((i: any) => i.name !== nameOrId && i.id !== nameOrId);
      });
    }
    if ((result.inventoryChanges as any)?.conditionUpdate) {
      ((result.inventoryChanges as any).conditionUpdate as any[]).forEach((cu: any) => {
        const idx = nextRun.inventory.findIndex((i: any) => i.name === cu.name || i.id === cu.id);
        if (idx >= 0) nextRun.inventory[idx] = { ...nextRun.inventory[idx], ...withoutNulls(cu), condition: cu.newCondition || cu.condition || nextRun.inventory[idx].condition };
      });
    }
    if (result.currencyChange) nextRun.currency = { ...(nextRun.currency || {}), amount: (nextRun.currency?.amount || 0) + result.currencyChange };

    if (result.newNPCs?.length) {
      result.newNPCs.forEach((npcData: any) => {
        const exists = nextRun.npcs.some((n: any) => n.name?.toLowerCase() === npcData.name?.toLowerCase());
        if (!exists && npcData.name) {
          nextRun.npcs.push({ id: npcData.id || stableEntityId('npc', npcData.name), status: 'vivo', ...withoutNulls(npcData), relationship: { ...(npcData.relationship || {}), keyMoments: npcData.relationship?.keyMoments || [], interactionHistory: npcData.relationship?.interactionHistory || [] } } as NPCCard);
          const familyRole = (npcData.relationship?.familyRole || npcData.relationship?.type || '').toLowerCase();
          if ((familyRole.includes('madre') || familyRole === 'mother') && !nextRun.character.motherName) nextRun.character.motherName = npcData.name;
          if ((familyRole.includes('padre') || familyRole === 'father') && !nextRun.character.fatherName) nextRun.character.fatherName = npcData.name;
        }
      });
    }

    if ((result as any).newFacciones?.length) {
      (result as any).newFacciones.forEach((facData: any) => {
        const exists = nextRun.facciones.some((f: any) => f.name?.toLowerCase() === facData.name?.toLowerCase());
        if (!exists && facData.name) nextRun.facciones.push({ id: facData.id || stableEntityId('fac', facData.name), type: 'otra', relationToPlayer: 'desconocido', influenceLevel: 'local', knownMembers: [], playerReputation: 50, discoveredAt: ingameDateStr, ...withoutNulls(facData) } as Faccion);
      });
    }

    if (result.personalHistoryEvent) nextRun.personalHistory.push({ date: ingameDateStr, year: newIngameYear, month: newMonth, day: newDay, description: result.personalHistoryEvent, emotionalWeight: result.legacyWeight });

    const consequenceResolutions = result.consequenceResolutions || [];
    nextRun.consequenceQueue = (nextRun.consequenceQueue || []).map((c: any) => {
      const resolution = consequenceResolutions.find((r: any) => {
        if (!r.description) return false;
        const rDesc = r.description.toLowerCase();
        const cDesc = (c.description || '').toLowerCase();
        return cDesc.includes(rDesc.slice(0, 20)) || rDesc.includes(cDesc.slice(0, 20));
      });
      if (resolution) return { ...c, status: resolution.status, statusReason: resolution.reason, resolved: resolution.status === 'Resuelta' || resolution.status === 'Cancelada', description: resolution.newDescription || c.description, scheduledTurn: resolution.newTurnsFromNow ?? c.scheduledTurn };
      return { ...c, scheduledTurn: (c.scheduledTurn ?? 0) - 1 };
    }).filter((c: any) => !c.resolved || (c.resolved && (nextRun.consequenceQueue || []).length < 20));
    if (result.scheduledConsequence?.description) nextRun.consequenceQueue.push({ description: result.scheduledConsequence.description, scheduledTurn: result.scheduledConsequence.turnsFromNow || 7, sourceAction: 'narrative', status: 'Activa' });

    if (result.skillUpdates?.length) {
      const currentSkills = [...(nextRun.realisticAttributes?.eraSkills || [])];
      result.skillUpdates.forEach((su: any) => {
        if (!su.name || !su.grade) return;
        const idx = currentSkills.findIndex((skill: any) => skill.name.toLowerCase() === su.name.toLowerCase());
        if (idx >= 0) currentSkills[idx] = { ...currentSkills[idx], grade: su.grade, description: su.description || currentSkills[idx].description, category: su.category || currentSkills[idx].category };
        else currentSkills.push({ name: su.name, grade: su.grade, category: su.category || 'Supervivencia', description: su.description });
      });
      nextRun.realisticAttributes = { ...nextRun.realisticAttributes, eraSkills: currentSkills };
    }
    if (result.attributeUpdates) nextRun.realisticAttributes = mergeDefined(nextRun.realisticAttributes || {}, result.attributeUpdates as any);
    if (result.descriptorUpdates) nextRun.descriptors = mergeDefined(nextRun.descriptors || {}, result.descriptorUpdates as any);

    if (result.npcUpdates?.length) {
      result.npcUpdates.forEach((upd: any) => {
        if (!upd.name) return;
        const idx = nextRun.npcs.findIndex((n: any) => n.name?.toLowerCase() === upd.name?.toLowerCase());
        if (idx < 0) return;
        const npc = nextRun.npcs[idx];
        const partial: any = withoutNulls({ ...upd, status: upd.statusUpdate, lastKnownLocation: upd.locationUpdate, knownMotivations: upd.motivationsUpdate, knownFears: upd.fearsUpdate, knownConditions: upd.knownConditionsUpdate });
        delete partial.name; delete partial.statusUpdate; delete partial.locationUpdate; delete partial.motivationsUpdate; delete partial.fearsUpdate; delete partial.knownConditionsUpdate;
        if (upd.secretAdd) partial.secrets = [...(npc.secrets || []), upd.secretAdd];
        if (upd.relationUpdate) {
          const ru = upd.relationUpdate;
          const currentRel = npc.relationship || { type: '', emotionalCharge: '', keyMoments: [] };
          partial.relationship = { ...currentRel, ...withoutNulls(ru), keyMoments: ru.keyMomentAdd ? [...(currentRel.keyMoments || []), ru.keyMomentAdd] : (currentRel.keyMoments || []), interactionHistory: ru.interactionAdd ? [...(currentRel.interactionHistory || []), ru.interactionAdd] : (currentRel.interactionHistory || []) };
          delete partial.relationship.keyMomentAdd; delete partial.relationship.interactionAdd;
        }
        nextRun.npcs[idx] = { ...npc, ...partial };
      });
    }

    if (result.factionUpdates?.length) {
      result.factionUpdates.forEach((upd: any) => {
        if (!upd.name) return;
        const idx = nextRun.facciones.findIndex((f: any) => f.name?.toLowerCase() === upd.name?.toLowerCase());
        if (idx < 0) return;
        const fac = nextRun.facciones[idx];
        const partial: any = withoutNulls({ ...upd, currentSituation: upd.currentSituationUpdate, relationToPlayer: upd.relationToPlayerUpdate });
        delete partial.name; delete partial.currentSituationUpdate; delete partial.relationToPlayerUpdate;
        if (upd.memberAdded) partial.knownMembers = [...(fac.knownMembers || []), upd.memberAdded];
        if (upd.reputationChange != null) partial.playerReputation = Math.max(0, Math.min(100, (fac.playerReputation || 50) + upd.reputationChange));
        nextRun.facciones[idx] = { ...fac, ...partial };
      });
    }

    // Handle AI-created new sections
    const sectionsToCreate: any[] = (result as any).customSectionsToCreate || [];
    if (sectionsToCreate.length > 0) {
      const existingTitles = new Set((nextRun.customSections || []).map((s: any) => (s.title || '').toLowerCase()));
      const brandNewSections = sectionsToCreate
        .filter((s: any) => s.title && !existingTitles.has(String(s.title).toLowerCase()))
        .map((s: any) => ({
          id: 'cs-ai-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
          title: String(s.title),
          icon: s.icon || '✨',
          scope: s.scope || 'global',
          fields: (s.fields || []).map((f: any) => ({ key: String(f.key || ''), value: String(f.value || ''), type: f.type || 'text', aiManaged: true })),
          aiCreated: true,
        }));
      if (brandNewSections.length > 0) {
        nextRun.customSections = [...(nextRun.customSections || []), ...brandNewSections];
      }
    }

    nextRun.customSections = applyCustomSectionPayload(nextRun.customSections || [], (result as any).customSectionUpdates || (result as any).customSectionsUpdate || (result as any).customSections);

    updateActiveRun({
      totalMinutesElapsed: nextRun.totalMinutesElapsed,
      character: nextRun.character,
      worldState: nextRun.worldState,
      inventory: nextRun.inventory,
      currency: nextRun.currency,
      npcs: nextRun.npcs,
      facciones: nextRun.facciones,
      personalHistory: nextRun.personalHistory,
      consequenceQueue: nextRun.consequenceQueue,
      traumas: nextRun.traumas,
      realisticAttributes: nextRun.realisticAttributes,
      descriptors: nextRun.descriptors,
      customSections: nextRun.customSections,
    });

    if (nextRun.worldState?.currentLocation?.name) {
      addExploredLocation({
        name: nextRun.worldState.currentLocation.name,
        territory: nextRun.worldState.currentLocation.territory || null,
        region: nextRun.worldState.currentLocation.region || null,
        description: nextRun.worldState.currentLocation.description || '',
        sensoryDescription: nextRun.worldState.currentLocation.sensoryDescription || null,
        type: nextRun.worldState.currentLocation.type || null,
        climate: nextRun.worldState.currentLocation.climate || null,
        fauna: nextRun.worldState.currentLocation.fauna || null,
        geographyDetails: nextRun.worldState.currentLocation.geographyDetails || null,
        visitedAt: ingameDateStr,
      } as any);
    }
  }, [updateActiveRun, addExploredLocation]);

  const executeNarrativeCall = async (actionText: string, currentRun: typeof run) => {
    if (!currentRun) return;
    const result = await generateNarrativeStream({
      playerAction: actionText,
      aiProvider: (currentRun.aiProvider || aiProvider),
      voice: narrativeVoice,
      tone: {
        baseRealism: (currentRun.eraConfig?.realismoLevel || 5) / 10,
        explicitMode: settings.explicitMode,
        explicitSubToggles: settings.explicitSubToggles,
        currentMood: emotionalClimate,
        subjectiveTime: settings.subjectiveTime,
        otherPerspectives: settings.otherPerspectives,
        showNpcDescriptors: settings.showNpcDescriptors,
      },
      character: {
        ...currentRun.character,
        traumas: currentRun.traumas || [],
      },
      worldState: currentRun.worldState,
      recentHistory: (currentRun.narrativeHistory || []).slice(-7).map((h) => ({ narrativeSnapshot: h.text, timestampIngame: h.ingameDate })),
      activeEchoes: [],
      currentLocation: currentRun.worldState?.currentLocation || {},
      inGameDateTime: currentRun.worldState?.ingameDate || `Año ${currentRun.eraConfig?.year || 0}`,
      era: currentRun.eraConfig,
      gameConfig: { name: 'UNA VIDA' },
      innerVoiceContext: currentRun.innerVoiceLog?.slice(-3).join(' | '),
      consequenceQueue: currentRun.consequenceQueue || [],
      existingNPCs: currentRun.npcs,
      currentTurn: currentRun.turnCount || 0,
      realisticAttributes: currentRun.realisticAttributes,
      descriptors: currentRun.descriptors,
      memoriaNarrador: currentRun.memoriaNarrador,
      globalInstructions,
      inventory: currentRun.inventory || [],
      facciones: currentRun.facciones || [],
      currency: currentRun.currency || {},
      customSections: currentRun.customSections || [],
    }, (_chunk, fullSoFar) => {
      updateLastNarrativeTurn({ text: fullSoFar });
    });
    return result;
  };

  const handleSendAction = async (overrideText?: string) => {
    const text = (overrideText || inputText).trim();
    if (!text || isGenerating || !run) return;
    if (!overrideText) setInputText('');

    // For think mode, log to inner voice but still proceed with AI to generate internal monologue
    if (inputType === 'think' && !overrideText) {
      addInnerVoice(text);
    }

    pushUndo();

    let actionText = text;
    if (inputType === 'speak') actionText = `[DIÁLOGO] "${text}"`;
    else if (inputType === 'observe') actionText = `[OBSERVO] ${text}`;
    else if (inputType === 'action') actionText = `[ACCIÓN] ${text}`;
    else if (inputType === 'think') actionText = `[PIENSO] ${text}`;
    setLastUserAction(actionText);

    setIsGenerating(true);
    setIsStreaming(true);

    const userTurn: NarrativeTurn = { id: generateId(), role: 'user', text, inputType, timestamp: Date.now() };
    addNarrativeTurn(userTurn);
    addNarrativeTurn({ id: generateId(), role: 'narrator', text: '', timestamp: Date.now() });

    try {
      const result = await executeNarrativeCall(actionText, run);
      if (!result) throw new Error('no result');
      setConsecutiveErrors(0);
      updateLastNarrativeTurn({ text: result.narrative, mood: result.mood || undefined, eventType: result.eventType, legacyWeight: result.legacyWeight });
      if (result.mood) setEmotionalClimate(result.mood as any);
      if (result.suggestedActions?.length) setSuggestedActions(result.suggestedActions);
      if ((result as any).tokenUsage) {
        const usedProvider = (run.aiProvider || aiProvider) as 'gemini' | 'anthropic';
        recordUsage(usedProvider, (result as any).tokenUsage);
        updateLastNarrativeTurn({ tokenUsage: { ...(result as any).tokenUsage, provider: usedProvider } });
      }
      // Use latest run from store to avoid stale closure after long async operation
      const latestRun = useEngineStore.getState().activeRun;
      applyNarrativeResult(result, latestRun || run);
      if (result.eventType === 'rest') {
        setIsStreaming(false);
        await triggerDream(run, result.narrative);
      }
      const shouldUpdateMemory = (result.legacyWeight ?? 0) >= 0.6
        || result.eventType === 'time_jump'
        || ((run.turnCount || 0) > 0 && (run.turnCount || 0) % 10 === 0);
      if (shouldUpdateMemory) {
        const recentTexts = (run.narrativeHistory || []).slice(-5).map((h) => h.text).filter(Boolean);
        updateAIMemory({
          currentResumen: run.memoriaNarrador?.resumen || '',
          recentEvents: recentTexts,
          character: run.character,
          worldState: run.worldState,
          era: run.eraConfig,
          memoriaNarrador: run.memoriaNarrador,
          aiProvider,
        }).then((res) => {
          updateMemoriaNarrador({ resumen: res.resumen } as any);
          if (res.tokenUsage) recordUsage(aiProvider, res.tokenUsage);
        }).catch(() => {});
      }
      setTimeout(() => syncToServer(), 1500);
    } catch (err: any) {
      const errMsg = String(err?.message || '');
      if (errMsg.startsWith('BUDGET_EXCEEDED:')) {
        const detail = errMsg.slice('BUDGET_EXCEEDED:'.length).trim();
        const usedProvider = (run.aiProvider || aiProvider) as 'gemini' | 'anthropic';
        updateLastNarrativeTurn({ text: formatBudgetMessage(detail, usedProvider) });
        setIsGenerating(false);
        setIsStreaming(false);
        return;
      }
      const newCount = consecutiveErrors + 1;
      setConsecutiveErrors(newCount);
      if (newCount >= 2) {
        updateLastNarrativeTurn({ text: '⚠ El narrador no pudo responder. Usa las opciones de recuperación.' });
        setPendingAction(actionText);
        setShowRecoveryModal(true);
      } else {
        updateLastNarrativeTurn({ text: 'El universo no respondió. Inténtalo de nuevo.' });
      }
    } finally {
      setIsGenerating(false);
      setIsStreaming(false);
    }
  };

  const handleUndo = () => {
    if (!run || undoStack.length === 0) return;
    const snap = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    updateActiveRun({
      narrativeHistory: snap.history,
      turnCount: snap.turnCount,
      worldState: snap.worldState,
      inventory: snap.inventory,
      npcs: snap.npcs,
      currency: snap.currency,
      personalHistory: snap.personalHistory,
      character: snap.character,
      facciones: snap.facciones,
      traumas: snap.traumas,
      consequenceQueue: snap.consequenceQueue,
    });
    if (snap.realisticAttributes) updateRealisticAttributes(snap.realisticAttributes);
  };

  const handleRecoveryRetry = () => {
    setShowRecoveryModal(false);
    setConsecutiveErrors(0);
    if (pendingAction) {
      setIsGenerating(true);
      setIsStreaming(true);
      addNarrativeTurn({ id: generateId(), role: 'narrator', text: '', timestamp: Date.now() });
      executeNarrativeCall(pendingAction, run!).then((result) => {
        if (!result) throw new Error('no result');
        setConsecutiveErrors(0);
        updateLastNarrativeTurn({ text: result.narrative, mood: result.mood || undefined, eventType: result.eventType, legacyWeight: result.legacyWeight });
        if (result.mood) setEmotionalClimate(result.mood as any);
        if (result.suggestedActions?.length) setSuggestedActions(result.suggestedActions);
        if ((result as any).tokenUsage) {
          const usedProvider = (run?.aiProvider || aiProvider) as 'gemini' | 'anthropic';
          recordUsage(usedProvider, (result as any).tokenUsage);
          updateLastNarrativeTurn({ tokenUsage: { ...(result as any).tokenUsage, provider: usedProvider } });
        }
        const latestRun = useEngineStore.getState().activeRun;
        applyNarrativeResult(result, latestRun || run!);
      }).catch((err: any) => {
        const errMsg = String(err?.message || '');
        if (errMsg.startsWith('BUDGET_EXCEEDED:')) {
          const detail = errMsg.slice('BUDGET_EXCEEDED:'.length).trim();
          const usedProvider = (run?.aiProvider || aiProvider) as 'gemini' | 'anthropic';
          updateLastNarrativeTurn({ text: formatBudgetMessage(detail, usedProvider) });
        } else {
          updateLastNarrativeTurn({ text: 'El narrador sigue sin responder. Intenta deshacer el turno.' });
        }
      }).finally(() => {
        setIsGenerating(false);
        setIsStreaming(false);
      });
    }
  };

  const handleRecoveryUndo = () => {
    setShowRecoveryModal(false);
    setConsecutiveErrors(0);
    handleUndo();
  };

  const handleForceStateUpdate = async (sections: string[] = []) => {
    if (!run) return;
    setIsUpdatingState(true);
    setStateUpdateResult('');

    const applyResult = (result: any) => {
      applyNarrativeResult({ ...result, timeAdvanced: result.timeAdvanced ?? 0 } as any, run);
      const changes: string[] = [];
      if (result.fullStateSnapshot || result.stateSnapshot || result.fullState) changes.push('estado completo');
      if (result.characterFieldUpdates || result.characterStatChanges) changes.push('personaje');
      if (result.ingameTime || result.worldStateUpdates) changes.push('mundo y fecha');
      if (result.attributeUpdates) changes.push('atributos');
      if (result.descriptorUpdates) changes.push('descriptores');
      if (result.skillUpdates?.length) changes.push('habilidades');
      if (result.npcUpdates?.length || result.newNPCs?.length) changes.push('NPCs');
      if (result.factionUpdates?.length || result.newFacciones?.length) changes.push('facciones');
      if (result.inventoryChanges) changes.push('inventario');
      if (result.customSectionUpdates || result.customSectionsUpdate || result.customSections) changes.push('secciones personalizadas');
      if (result.summary && !changes.includes(result.summary)) changes.push(result.summary);
      return changes;
    };

    let lastError: any = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        setStateUpdateResult(attempt > 1 ? `Reintentando (${attempt}/3)...` : '');
        const result = await generateStateUpdate({
          character: run.character,
          worldState: run.worldState,
          recentHistory: (run.narrativeHistory || []).slice(-7).map((h) => ({ narrativeSnapshot: h.text, timestampIngame: h.ingameDate })),
          existingNPCs: run.npcs,
          facciones: run.facciones,
          realisticAttributes: run.realisticAttributes,
          descriptors: run.descriptors,
          inventory: run.inventory,
          currency: run.currency,
          era: run.eraConfig,
          memoriaNarrador: run.memoriaNarrador,
          sections,
          manualInstructions: stateUpdateInstructions.trim(),
          customSections: run.customSections || [],
          aiProvider,
        });
        const changes = applyResult(result);
        if ((result as any).tokenUsage) recordUsage(aiProvider, (result as any).tokenUsage);
        setStateUpdateResult(changes.length > 0 ? `✓ Actualizado: ${changes.join(', ')}` : '✓ Sin cambios detectados — todo estaba coherente.');
        updateAIMemory({
          currentResumen: run.memoriaNarrador?.resumen || '',
          recentEvents: (run.narrativeHistory || []).slice(-5).map((h) => h.text).filter(Boolean),
          character: run.character,
          worldState: run.worldState,
          era: run.eraConfig,
          memoriaNarrador: run.memoriaNarrador,
          aiProvider,
        }).then((res) => {
          updateMemoriaNarrador({ resumen: res.resumen } as any);
          if (res.tokenUsage) recordUsage(aiProvider, res.tokenUsage);
        }).catch(() => {});
        setTimeout(() => syncToServer(), 2000);
        setIsUpdatingState(false);
        return;
      } catch (err) {
        lastError = err;
        if (attempt < 3) await new Promise((r) => setTimeout(r, 1500));
      }
    }
    console.error('handleForceStateUpdate failed after 3 attempts:', lastError);
    setStateUpdateResult('× Error al actualizar tras 3 intentos. Comprueba la conexión.');
    setIsUpdatingState(false);
  };

  const handleApplySuggestion = async () => {
    if (!editingField || !suggestInput.trim() || !run) return;
    setIsSuggesting(true);
    try {
      const result = await suggestFieldValue({
        fieldPath: editingField.path,
        currentValue: editingField.value,
        suggestion: suggestInput,
        context: {
          characterName: run.character?.name,
          age: run.character?.age,
          eraLabel: run.eraConfig?.eraLabel || run.eraConfig?.eraName,
          location: run.worldState?.currentLocation?.name,
        },
        aiProvider,
      });
      if ((result as any).tokenUsage) recordUsage(aiProvider, (result as any).tokenUsage);
      if (result.newValue !== undefined) {
        const pathParts = editingField.path.split('.');
        if (pathParts[0] === 'character') {
          const key = pathParts[1];
          updateActiveRun({ character: { ...run.character, [key]: result.newValue } });
        } else if (pathParts[0] === 'worldState') {
          const key = pathParts[1];
          updateActiveRun({ worldState: { ...run.worldState, [key]: result.newValue } });
        } else if (pathParts[0] === 'memoriaNarrador') {
          const key = pathParts[1];
          updateMemoriaNarrador({ [key]: result.newValue } as any);
        } else if (pathParts[0] === 'npc' && pathParts[1]) {
          const npcId = pathParts[1];
          const field = pathParts[2];
          if (field) updateNPC(npcId, { [field]: result.newValue });
        } else if (pathParts[0] === 'faccion' && pathParts[1]) {
          const facId = pathParts[1];
          const field = pathParts[2];
          if (field) updateFaccion(facId, { [field]: result.newValue });
        } else if (pathParts[0] === 'descriptor') {
          const key = pathParts[1];
          updateDescriptors({ [key]: result.newValue });
        } else if (pathParts[0] === 'attribute') {
          const key = pathParts[1];
          updateRealisticAttributes({ [key]: result.newValue });
        } else if (pathParts[0] === 'customSection' && pathParts[1] && pathParts[2]) {
          const sectionId = pathParts[1];
          const fieldKey = pathParts[2];
          const sections = (run.customSections || []).map((s: any) =>
            s.id === sectionId
              ? { ...s, fields: s.fields.map((f: any) => f.key === fieldKey ? { ...f, value: String(result.newValue) } : f) }
              : s
          );
          updateActiveRun({ customSections: sections } as any);
        }
        setEditingField(null);
        setSuggestInput('');
      }
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (msg.startsWith('BUDGET_EXCEEDED:')) {
        setSuggestError('Límite de créditos alcanzado. Cambia de proveedor en Configuración.');
      } else {
        setSuggestError('La IA no pudo generar una sugerencia. Inténtalo de nuevo.');
      }
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleRegenerate = async () => {
    if (!run || !lastUserAction || isGenerating) return;
    if (history.length < 1) return;

    const lastTurn = history[history.length - 1];
    if (lastTurn.role !== 'narrator') return;

    setIsGenerating(true);
    setIsStreaming(true);

    const newHistory = history.slice(0, -1);
    updateActiveRun({ narrativeHistory: newHistory, turnCount: Math.max(0, (run.turnCount || 0) - 1) });

    addNarrativeTurn({ id: generateId(), role: 'narrator', text: '', timestamp: Date.now() });

    try {
      const result = await executeNarrativeCall(lastUserAction, { ...run, narrativeHistory: newHistory });
      if (!result) throw new Error('no result');
      updateLastNarrativeTurn({ text: result.narrative, mood: result.mood || undefined, eventType: result.eventType, legacyWeight: result.legacyWeight });
      if (result.mood) setEmotionalClimate(result.mood as any);
      if (result.suggestedActions?.length) setSuggestedActions(result.suggestedActions);
      if ((result as any).tokenUsage) {
        const usedProvider = (run.aiProvider || aiProvider) as 'gemini' | 'anthropic';
        recordUsage(usedProvider, (result as any).tokenUsage);
        updateLastNarrativeTurn({ tokenUsage: { ...(result as any).tokenUsage, provider: usedProvider } });
      }
    } catch (err: any) {
      const errMsg = String(err?.message || '');
      if (errMsg.startsWith('BUDGET_EXCEEDED:')) {
        const detail = errMsg.slice('BUDGET_EXCEEDED:'.length).trim();
        const usedProvider = (run.aiProvider || aiProvider) as 'gemini' | 'anthropic';
        updateLastNarrativeTurn({ text: formatBudgetMessage(detail, usedProvider) });
      } else {
        updateLastNarrativeTurn({ text: 'La regeneración falló. Intenta de nuevo.' });
      }
    } finally {
      setIsGenerating(false);
      setIsStreaming(false);
    }
  };

  const triggerDream = async (currentRun: typeof run, _recentNarrative: string) => {
    if (!currentRun) return;
    skipDreamRef.current = false;
    setShowDreamSkip(true);
    try {
      const dreamResult = await generateDream({
        character: currentRun.character,
        emotionalClimate: currentRun.emotionalClimate,
        innerVoiceLog: currentRun.innerVoiceLog || [],
        recentEvents: history.slice(-5).map((h) => h.text).filter(Boolean),
        era: currentRun.eraConfig,
        aiProvider: currentRun.aiProvider || aiProvider,
      });
      if ((dreamResult as any).tokenUsage) recordUsage((currentRun.aiProvider || aiProvider) as 'gemini' | 'anthropic', (dreamResult as any).tokenUsage);
      if (!skipDreamRef.current) {
        addNarrativeTurn({ id: generateId(), role: 'dream', text: dreamResult.dream, timestamp: Date.now() });
      }
    } catch {
    } finally {
      setShowDreamSkip(false);
      skipDreamRef.current = false;
    }
  };

  const handleTimeAdvance = async (years: number) => {
    if (isGenerating || !run) return;
    setShowTimeAdvance(false);
    pushUndo();
    setIsGenerating(true);
    setIsStreaming(true);
    const action = `__TIME_JUMP_${years}_YEARS__`;
    setLastUserAction(action);

    const userTurn: NarrativeTurn = { id: generateId(), role: 'user', text: `Avanzar ${years} año${years !== 1 ? 's' : ''}`, timestamp: Date.now() };
    addNarrativeTurn(userTurn);
    addNarrativeTurn({ id: generateId(), role: 'narrator', text: '', timestamp: Date.now() });

    try {
      const result = await generateNarrativeStream({
        playerAction: action,
        voice: narrativeVoice,
        tone: { baseRealism: (run.eraConfig?.realismoLevel || 5) / 10, explicitMode: settings.explicitMode, explicitSubToggles: settings.explicitSubToggles, currentMood: emotionalClimate, subjectiveTime: settings.subjectiveTime, otherPerspectives: settings.otherPerspectives },
        character: run.character, worldState: run.worldState,
        aiProvider,
        recentHistory: history.slice(-7).map((h) => ({ narrativeSnapshot: h.text, timestampIngame: h.ingameDate })),
        activeEchoes: [], currentLocation: run.worldState?.currentLocation || {},
        inGameDateTime: run.worldState?.ingameDate || `Año ${run.eraConfig?.year || 0}`,
        era: run.eraConfig, gameConfig: { name: 'UNA VIDA' },
        innerVoiceContext: run.innerVoiceLog?.slice(-3).join(' | '),
        consequenceQueue: [], existingNPCs: run.npcs, currentTurn: run.turnCount || 0,
        realisticAttributes: run.realisticAttributes, descriptors: run.descriptors,
        memoriaNarrador: run.memoriaNarrador, isTimeJump: true, timeJumpYears: years, customSections: run.customSections || [], globalInstructions,
      }, () => {});
      updateLastNarrativeTurn({ text: result.narrative, mood: result.mood || undefined, eventType: 'time_jump', legacyWeight: result.legacyWeight });
      if (result.mood) setEmotionalClimate(result.mood as any);
      if (result.suggestedActions?.length) setSuggestedActions(result.suggestedActions);
      if ((result as any).tokenUsage) {
        recordUsage(aiProvider, (result as any).tokenUsage);
        updateLastNarrativeTurn({ tokenUsage: { ...(result as any).tokenUsage, provider: aiProvider } });
      }
      applyNarrativeResult(result, run);
    } catch (err: any) {
      const errMsg = String(err?.message || '');
      if (errMsg.startsWith('BUDGET_EXCEEDED:')) {
        const detail = errMsg.slice('BUDGET_EXCEEDED:'.length).trim();
        updateLastNarrativeTurn({ text: formatBudgetMessage(detail, aiProvider) });
      } else {
        updateLastNarrativeTurn({ text: 'El tiempo resistió el salto.' });
      }
    } finally {
      setIsGenerating(false);
      setIsStreaming(false);
    }
  };

  const charAge = run?.character?.age ?? 0;
  const isInfant = charAge < 2;
  const isToddler = charAge >= 2 && charAge < 5;
  const isYoungChild = charAge >= 5 && charAge < 7;
  const isOlderChild = charAge >= 7 && charAge < 13;
  const showInputButtons = charAge >= 7;

  const textSizeClass = settings.textSize === 'sm' ? 'text-sm' : settings.textSize === 'lg' ? 'text-xl' : 'text-base md:text-lg';
  const character = run?.character;
  const stats = character?.stats || { health: 100, energy: 100, hunger: 50, morale: 70, mentalHealth: 80 };

  const world = run?.worldState || {};
  const loc = world.currentLocation || {};
  const ingameYear = world.ingameYear || run?.eraConfig?.year || 0;
  const ingameDay = world.ingameDay;
  const ingameMonth = world.ingameMonth;
  const dateString = world.ingameDate || (ingameDay && ingameMonth
    ? `${ingameDay} de ${MESES_MEDIEVALES[(ingameMonth - 1) % 12]} · ${ingameYear}`
    : `Año ${ingameYear}`);
  const timeOfDayLabel = world.timeOfDay || '';
  const destination = world.destination || '';

  const lastNarratorIdx = (() => {
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'narrator' && history[i].text) return i;
    }
    return -1;
  })();

  if (!run) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#0a0c0f] text-[#5a6478]">
        <div className="font-mono text-sm mb-4">Sin partida activa</div>
        <button onClick={() => setLocation('/')} className="font-mono text-xs text-[#3d8eff] hover:underline">Volver al inicio</button>
      </div>
    );
  }

  if (run.playMode === 'DIOS') {
    return (
      <GodModeGame
        run={run} isGenerating={isGenerating} history={history} textSizeClass={textSizeClass}
        onSendAction={handleSendAction} onExit={() => setShowConfirmExit(true)}
        onConfirmExit={() => setLocation('/')} onCancelExit={() => setShowConfirmExit(false)}
        showConfirmExit={showConfirmExit} isStreaming={isStreaming}
      />
    );
  }

  return (
    <div className="h-screen w-full flex flex-col bg-[#0a0c0f] overflow-hidden relative">
      <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: `inset 0 0 0 1px ${emotionColor}10` }} />

      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 flex flex-col relative max-w-3xl mx-auto w-full">

          {/* TOP BAR */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1e2530]/50 bg-[#0a0c0f]/90 backdrop-blur-sm">
            <button onClick={() => setShowConfirmExit(true)} className="text-[#5a6478] hover:text-[#eef2f8] transition-colors flex-shrink-0">
              <ArrowLeft size={16} />
            </button>
            <div className="flex-1 flex flex-col items-center min-w-0 px-2">
              <div className="flex items-center gap-1.5 flex-wrap justify-center">
                <span className="font-mono text-[10px] text-[#3d8eff]">{dateString}</span>
                {timeOfDayLabel && <span className="font-mono text-[9px] text-[#5a6478]">· {timeOfDayLabel}</span>}
                {loc.name && (
                  <>
                    <span className="font-mono text-[9px] text-[#5a6478]">·</span>
                    <span className="flex items-center gap-1 font-mono text-[9px] text-[#00d4a8]">
                      <MapPin size={8} /> {loc.name}
                    </span>
                  </>
                )}
                {destination && (
                  <>
                    <span className="font-mono text-[9px] text-[#5a6478]">·</span>
                    <span className="font-mono text-[9px] text-[#f5a623]">destino: {destination}</span>
                  </>
                )}
              </div>
              <div className="font-mono text-[9px] text-[#5a6478]/50">{run.eraConfig?.eraLabel || ''}</div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {isSyncing && <div className="w-1.5 h-1.5 rounded-full bg-[#00d4a8] animate-pulse" title="Sincronizando..." />}
              <button onClick={() => { setShowStateUpdatePanel(true); setStateUpdateResult(''); }} disabled={isGenerating}
                title="Actualizar Estado" className="p-1.5 rounded-lg border border-[#3d8eff]/30 text-[#3d8eff] hover:bg-[#3d8eff10] transition-all disabled:opacity-30">
                <Database size={11} />
              </button>
              <button onClick={() => setShowTimeAdvance(true)} disabled={isGenerating} title="Avanzar el tiempo"
                className="p-1.5 rounded-lg border border-[#f5a623]/30 text-[#f5a623] hover:bg-[#f5a62310] transition-all disabled:opacity-30">
                <FastForward size={11} />
              </button>
              <div className="text-right">
                <div className="font-serif text-sm text-[#eef2f8]">{character?.name || '—'}</div>
                <div className="font-mono text-[9px] text-[#5a6478]">{getAgeDescription(charAge)}</div>
              </div>
            </div>
          </div>

          {/* NARRATIVE SCROLL */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto pb-52"
            style={{ borderLeft: `2px solid ${emotionColor}15`, borderRight: `2px solid ${emotionColor}15` }}>
            <div className="px-4 md:px-8 py-8 space-y-8 max-w-2xl mx-auto">
              <AnimatePresence initial={false}>
                {history.map((turn, i) => {
                  const isLastTurn = i === history.length - 1;
                  const isLoadingTurn = isLastTurn && isStreaming && !turn.text;
                  const isLastCompleteNarrator = i === lastNarratorIdx;

                  return (
                    <motion.div key={turn.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                      {turn.role === 'user' && turn.text && !turn.text.startsWith('__') ? (
                        <div className="flex justify-end">
                          <div className="max-w-xs px-4 py-2.5 bg-[#0f1218] border border-[#1e2530] rounded-xl font-mono text-sm text-[#5a6478]">
                            <span className="text-[#3d8eff]/50 mr-1">›</span>{turn.text}
                          </div>
                        </div>
                      ) : turn.role === 'narrator' ? (
                        <div className="space-y-3">
                          {isLoadingTurn ? (
                            <NarratorClock ingameDate={dateString} timeOfDay={timeOfDayLabel} />
                          ) : turn.text ? (
                            <motion.div
                              className="space-y-4"
                              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }}
                            >
                              <div className={`font-serif ${textSizeClass} text-[#c8d0dc] narrative-prose space-y-3`}
                                style={{ textShadow: '0 0 20px rgba(0,0,0,0.5)' }}>
                                {turn.text.split(/\n\n+/).map((para, pi) => (
                                  <RichText key={pi} variant="prose">{para}</RichText>
                                ))}
                              </div>
                            </motion.div>
                          ) : null}
                          {turn.imageUrl && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 1 }}
                              className="w-full rounded-xl overflow-hidden border border-[#1e2530]">
                              <img src={turn.imageUrl} alt="Momento" className="w-full h-auto object-cover" />
                            </motion.div>
                          )}
                          {turn.tokenUsage && turn.text && (
                            <div className="flex items-center gap-2 pt-1 opacity-60 hover:opacity-100 transition-opacity">
                              <span
                                className="font-mono text-[9px] px-1.5 py-0.5 rounded border"
                                style={{
                                  color: turn.tokenUsage.provider === 'gemini' ? '#3d8eff' : '#00d4a8',
                                  borderColor: (turn.tokenUsage.provider === 'gemini' ? '#3d8eff' : '#00d4a8') + '40',
                                  background: (turn.tokenUsage.provider === 'gemini' ? '#3d8eff' : '#00d4a8') + '10',
                                }}
                                title={`Entrada: ${turn.tokenUsage.inputTokens} · Salida: ${turn.tokenUsage.outputTokens}`}
                              >
                                {turn.tokenUsage.provider === 'gemini' ? 'GEMINI' : 'CLAUDE'} · {(turn.tokenUsage.inputTokens + turn.tokenUsage.outputTokens).toLocaleString()} tk
                              </span>
                              <span className="font-mono text-[8px] text-[#5a6478]">
                                ↓{turn.tokenUsage.inputTokens.toLocaleString()} ↑{turn.tokenUsage.outputTokens.toLocaleString()}
                              </span>
                            </div>
                          )}
                          {isLastCompleteNarrator && !isGenerating && turn.text && (
                            <div className="flex items-center gap-2 pt-1">
                              <button onClick={handleRegenerate} disabled={isGenerating || !lastUserAction}
                                title="Regenerar narración"
                                className="flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[9px] border border-[#1e2530] text-[#5a6478] hover:text-[#3d8eff] hover:border-[#3d8eff]/30 transition-all disabled:opacity-30">
                                <RefreshCw size={9} /> Regenerar
                              </button>
                              <button onClick={handleUndo} disabled={isGenerating || undoStack.length === 0}
                                title="Deshacer último turno"
                                className="flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[9px] border border-[#1e2530] text-[#5a6478] hover:text-[#f5a623] hover:border-[#f5a623]/30 transition-all disabled:opacity-30">
                                <Undo2 size={9} /> Deshacer
                              </button>
                            </div>
                          )}
                        </div>
                      ) : turn.role === 'dream' ? (
                        <div className="border border-[#5a6478]/20 rounded-xl p-6 bg-[#0f1218]/50">
                          <div className="flex items-center gap-2 font-mono text-[10px] text-[#5a6478] tracking-widest mb-3">
                            <Moon size={10} className="text-[#8b5cf6]" /> SUEÑO
                          </div>
                          <p className={`font-serif ${textSizeClass} leading-relaxed text-[#5a6478] italic`}>{turn.text}</p>
                        </div>
                      ) : null}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              <CustomSectionsPanel run={run} panelScope="narration" compact />
            </div>
          </div>

          {/* INPUT AREA */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#0a0c0f] via-[#0a0c0f]/95 to-transparent pt-16 pb-4 px-4">

            {showDreamSkip && (
              <div className="flex items-center justify-center mb-3 max-w-2xl mx-auto">
                <div className="flex items-center gap-3 px-4 py-2.5 bg-[#0f1218]/95 border border-[#5a6478]/20 rounded-full backdrop-blur-sm">
                  <Moon size={12} className="text-[#8b5cf6] animate-pulse" />
                  <span className="font-mono text-[10px] text-[#5a6478]">Sueño activo...</span>
                  <span className="w-px h-3 bg-[#1e2530]" />
                  <button onClick={() => { skipDreamRef.current = true; setShowDreamSkip(false); }}
                    className="font-mono text-[10px] text-[#5a6478] hover:text-[#eef2f8] transition-colors tracking-widest">
                    SALTAR
                  </button>
                </div>
              </div>
            )}

            {run.suggestedActions && run.suggestedActions.length > 0 && !isGenerating && (
              <div className="flex gap-2 mb-3 overflow-x-auto pb-1 max-w-2xl mx-auto no-scrollbar">
                {run.suggestedActions.slice(0, isInfant || isToddler ? 6 : 4).map((action, i) => (
                  <button key={i}
                    onClick={() => { if (charAge < 7) { handleSendAction(action); } else { setInputText(action); inputRef.current?.focus(); } }}
                    className="flex-shrink-0 px-3 py-1.5 rounded-lg font-mono text-xs border border-[#1e2530] text-[#5a6478] hover:text-[#eef2f8] hover:border-[#3d8eff]/30 bg-[#0f1218]/80 backdrop-blur-sm transition-all whitespace-nowrap">
                    {action}
                  </button>
                ))}
              </div>
            )}

            {isInfant && (
              <div className="max-w-2xl mx-auto">
                <div className="text-center mb-3">
                  <span className="font-mono text-[10px] text-[#5a6478]/60 tracking-widest">NARRACIÓN AUTOMÁTICA · {charAge === 0 ? 'RECIÉN NACIDO' : `${charAge} AÑO`}</span>
                </div>
                <button onClick={() => handleSendAction('__AUTO_INFANT__')} disabled={isGenerating}
                  className="w-full h-14 rounded-xl font-mono text-sm border transition-all active:scale-95 disabled:opacity-50"
                  style={{ borderColor: emotionColor + '30', color: emotionColor, background: emotionColor + '08' }}>
                  {isGenerating ? 'El mundo avanza...' : 'Continuar narración'}
                </button>
              </div>
            )}

            {isToddler && (
              <div className="max-w-2xl mx-auto">
                <div className="text-center mb-2">
                  <span className="font-mono text-[10px] text-[#5a6478]/60 tracking-widest">{charAge} AÑOS · ELIGE UNA ACCIÓN</span>
                </div>
                <button onClick={() => handleSendAction('__AUTO_INFANT__')} disabled={isGenerating}
                  className="w-full h-11 rounded-xl font-mono text-xs border transition-all active:scale-95 disabled:opacity-50 mb-2"
                  style={{ borderColor: '#1e2530', color: '#5a6478' }}>
                  {isGenerating ? '...' : 'El tiempo pasa...'}
                </button>
              </div>
            )}

            {isYoungChild && (
              <div className="max-w-2xl mx-auto">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[10px] text-[#5a6478]/60 tracking-widest">{charAge} AÑOS</span>
                  <button onClick={() => setShowTimeAdvance(true)} disabled={isGenerating}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg font-mono text-[9px] border border-[#f5a623]/30 text-[#f5a623] hover:bg-[#f5a623]/10 transition-all disabled:opacity-30">
                    <FastForward size={9} /> Etapa
                  </button>
                </div>
              </div>
            )}

            {!isInfant && !isToddler && (
              <>
                <AnimatePresence>
                  {showInnerVoice && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-3 max-w-2xl mx-auto">
                      <div className="flex gap-2 p-3 bg-[#0f1218] border border-[#5a6478]/30 rounded-xl">
                        <input className="flex-1 bg-transparent font-serif text-sm text-[#5a6478] focus:outline-none placeholder:text-[#2a3040]"
                          value={innerVoiceInput} onChange={(e) => setInnerVoiceInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { if (!innerVoiceInput.trim()) return; addInnerVoice(innerVoiceInput.trim()); setInnerVoiceInput(''); setShowInnerVoice(false); } }}
                          placeholder="Voz interior..." autoFocus />
                        <button onClick={() => { if (!innerVoiceInput.trim()) return; addInnerVoice(innerVoiceInput.trim()); setInnerVoiceInput(''); setShowInnerVoice(false); }} className="font-mono text-xs text-[#5a6478] hover:text-[#eef2f8]">↵</button>
                        <button onClick={() => setShowInnerVoice(false)} className="text-[#5a6478] hover:text-[#eef2f8]"><X size={12} /></button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {showInputButtons && (
                  <div className="flex gap-2 mb-3 max-w-2xl mx-auto overflow-x-auto pb-1 scrollbar-none" style={{ WebkitOverflowScrolling: 'touch' }}>
                    {([
                      { id: 'free', label: 'Libre' },
                      { id: 'speak', label: 'Hablar' },
                      { id: 'action', label: 'Acción' },
                      { id: 'observe', label: 'Observar' },
                      { id: 'think', label: 'Pensar' },
                    ] as { id: InputType; label: string }[]).map((t) => (
                      <button key={t.id} onClick={() => setInputType(t.id)}
                        className="px-3 py-1.5 rounded-lg font-mono text-[10px] border transition-all flex-shrink-0"
                        style={{ borderColor: inputType === t.id ? emotionColor + '50' : '#1e2530', color: inputType === t.id ? emotionColor : '#5a6478', background: inputType === t.id ? emotionColor + '10' : 'transparent' }}>
                        {t.label}
                      </button>
                    ))}
                    {isOlderChild && (
                      <button onClick={() => setShowTimeAdvance(true)} disabled={isGenerating}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg font-mono text-[10px] border border-[#f5a623]/30 text-[#f5a623] hover:bg-[#f5a623]/10 transition-all disabled:opacity-30 ml-auto flex-shrink-0">
                        <FastForward size={9} /> Avanzar etapa
                      </button>
                    )}
                  </div>
                )}

                {!showInputButtons && !isYoungChild && isOlderChild && (
                  <div className="flex items-center justify-end mb-2 max-w-2xl mx-auto gap-2">
                    <button onClick={() => setShowTimeAdvance(true)} disabled={isGenerating}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg font-mono text-[10px] border border-[#f5a623]/30 text-[#f5a623] hover:bg-[#f5a623]/10 transition-all disabled:opacity-30">
                      <FastForward size={9} /> Avanzar etapa
                    </button>
                  </div>
                )}

                <div className="max-w-2xl mx-auto relative">
                  <input ref={inputRef} value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendAction(); } }}
                    placeholder={
                      isYoungChild ? '¿Qué haces?' :
                      inputType === 'speak' ? '"¿Qué dices?"' :
                      inputType === 'observe' ? '¿Qué examinas?' :
                      inputType === 'think' ? '¿En qué piensas?' :
                      inputType === 'action' ? '¿Qué haces exactamente?' : '¿Qué haces?'
                    }
                    disabled={isGenerating}
                    className="w-full h-14 pl-5 pr-14 bg-[#0f1218]/90 backdrop-blur border border-[#1e2530] rounded-xl font-serif text-base text-[#eef2f8] placeholder:text-[#2a3040] focus:outline-none transition-all disabled:opacity-50"
                    style={{ borderColor: isGenerating ? emotionColor + '30' : '#1e2530' }}
                  />
                  <button onClick={() => handleSendAction()} disabled={isGenerating || !inputText.trim()}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90 disabled:opacity-30"
                    style={{ background: emotionColor + '20', color: emotionColor }}>
                    <Send size={15} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* SIDE ICON BAR */}
        <div className="w-14 flex flex-col border-l border-[#1e2530]/50 bg-[#0a0c0f] py-4">
          {([
            { id: 'character', icon: User, label: 'PERSONAJE' },
            { id: 'world', icon: Globe, label: 'MUNDO' },
            { id: 'map', icon: MapIcon, label: 'MAPA' },
            { id: 'npcs', icon: Users, label: 'NPCs' },
            { id: 'facciones', icon: Shield, label: 'FACCIONES' },
            { id: 'editor', icon: SettingsIcon, label: 'EDITOR' },
            { id: 'save', icon: Save, label: 'GUARDADO' },
            { id: 'memoria', icon: Brain, label: 'MEMORIA IA' },
          ] as { id: PanelId; icon: any; label: string }[]).map((p) => (
            <button key={p.id as string} onClick={() => setActivePanel(activePanel === p.id ? null : p.id)} title={p.label}
              className="flex flex-col items-center gap-0.5 justify-center py-2.5 transition-all relative"
              style={{ color: activePanel === p.id ? emotionColor : '#5a6478' }}>
              <p.icon size={15} />
              {activePanel === p.id && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 rounded-r-full" style={{ background: emotionColor }} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* STATUS BAR */}
      {!statusBarCollapsed && (
        <motion.div initial={{ y: 40 }} animate={{ y: 0 }} className="border-t border-[#1e2530]/50 bg-[#0a0c0f]/90 backdrop-blur-sm px-4 py-2">
          <div className="flex items-center gap-6 max-w-3xl mx-auto">
            <div className="flex gap-4 flex-1">
              <MiniBar label="SALUD" value={stats.health} color="#00d4a8" />
              <MiniBar label="ENERGÍA" value={stats.energy} color="#3d8eff" />
              <MiniBar label="HAMBRE" value={stats.hunger} color="#f5a623" />
              <MiniBar label="MORAL" value={stats.morale} color="#eef2f8" />
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono text-[#5a6478]">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: emotionColor }} />
              {emotionalClimate.replace('_', ' ').toUpperCase()}
            </div>
            <button onClick={() => setStatusBarCollapsed(true)} className="text-[#5a6478] hover:text-[#eef2f8]"><ChevronDown size={12} /></button>
          </div>
        </motion.div>
      )}
      {statusBarCollapsed && (
        <button onClick={() => setStatusBarCollapsed(false)} className="border-t border-[#1e2530]/50 w-full py-1 flex justify-center text-[#5a6478] hover:text-[#eef2f8] transition-colors">
          <ChevronUp size={12} />
        </button>
      )}

      {/* SLIDING PANEL */}
      <AnimatePresence>
        {activePanel && (
          <motion.div key={activePanel}
            initial={{ opacity: 0, x: '100%' }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'tween', duration: 0.28 }}
            className="fixed inset-y-0 left-0 right-0 md:left-auto md:right-14 md:w-96 z-40 bg-[#0a0c0f]/98 backdrop-blur-xl border-l border-[#1e2530] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2530]">
              <span className="font-mono text-xs text-[#5a6478] tracking-widest uppercase">
                {({ character: 'PERSONAJE', world: 'MUNDO', map: 'MAPA', npcs: 'PERSONAS', facciones: 'FACCIONES', editor: 'EDITOR', save: 'GUARDADO', memoria: 'MEMORIA IA' } as Record<string, string>)[activePanel] || activePanel}
              </span>
              <button onClick={() => setActivePanel(null)} className="text-[#5a6478] hover:text-[#eef2f8] transition-colors"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <EditContext.Provider value={{
                openSuggest: (path, label, value, fieldType?) => { setEditingField({ path, label, value, fieldType }); setSuggestInput(''); setSuggestError(null); },
                applyDirect: (path, value) => {
                  if (!run) return;
                  const parts = path.split('.');
                  if (parts[0] === 'character') updateActiveRun({ character: { ...run.character, [parts[1]]: value } });
                  else if (parts[0] === 'worldState') updateActiveRun({ worldState: { ...run.worldState, [parts[1]]: value } });
                  else if (parts[0] === 'memoriaNarrador') updateMemoriaNarrador({ [parts[1]]: value } as any);
                  else if (parts[0] === 'appearance') updateActiveRun({ character: { ...run.character, appearance: { ...(run.character?.appearance || {}), [parts[1]]: value } } });
                  else if (parts[0] === 'npc' && parts[1] && parts[2]) updateNPC(parts[1], { [parts[2]]: value });
                  else if (parts[0] === 'faccion' && parts[1] && parts[2]) updateFaccion(parts[1], { [parts[2]]: value });
                  else if (parts[0] === 'descriptor') updateDescriptors({ [parts[1]]: value } as any);
                  else if (parts[0] === 'attribute') updateRealisticAttributes({ [parts[1]]: value } as any);
                  else if (parts[0] === 'inventory' && parts[1] && parts[2]) {
                    const newInv = (run.inventory || []).map((i: any) => i.id === parts[1] ? { ...i, [parts[2]]: value } : i);
                    updateActiveRun({ inventory: newInv });
                  } else if (parts[0] === 'customSection' && parts[1] && parts[2]) {
                    const newSections = (run.customSections || []).map((s: any) =>
                      s.id === parts[1]
                        ? { ...s, fields: s.fields.map((f: any) => f.key === parts[2] ? { ...f, value } : f) }
                        : s
                    );
                    updateActiveRun({ customSections: newSections } as any);
                  }
                },
              }}>
                {activePanel === 'character' && <CharacterPanel run={run} />}
                {activePanel === 'world' && <WorldPanel run={run} />}
                {activePanel === 'map' && <MapPanel run={run} />}
                {activePanel === 'npcs' && <NPCsPanel run={run} />}
                {activePanel === 'facciones' && <FactionsPanel run={run} />}
                {activePanel === 'editor' && <EditorPanel run={run} onRegenerate={handleRegenerate} isGenerating={isGenerating} canRegenerate={!!lastUserAction} />}
                {activePanel === 'save' && <SavePanel run={run} onClose={() => setActivePanel(null)} />}
                {activePanel === 'memoria' && <MemoriaPanel run={run} />}
              </EditContext.Provider>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TIME ADVANCE MODAL */}
      <AnimatePresence>
        {showTimeAdvance && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setShowTimeAdvance(false)}>
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="bg-[#0f1218] border border-[#1e2530] rounded-2xl p-8 max-w-sm w-full mx-4"
              onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-2 mb-2">
                <Clock size={16} className="text-[#f5a623]" />
                <h3 className="font-display font-bold text-xl">Avanzar en el tiempo</h3>
              </div>
              <p className="font-serif italic text-[#5a6478] mb-5 text-sm">El narrador comprimirá el tiempo en una narrativa cinematográfica.</p>
              <div className="space-y-2 mb-5">
                {([
                  { label: '1 año', years: 1, desc: 'Un año de vida ordinaria' },
                  { label: '3 años', years: 3, desc: 'Un ciclo de vida significativo' },
                  { label: '5 años', years: 5, desc: 'Media década de cambios' },
                  { label: '10 años', years: 10, desc: 'Una década completa' },
                  { label: '15 años', years: 15, desc: 'Una generación menor' },
                  charAge < 18 ? { label: `Hasta adulto (${18 - charAge}a)`, years: Math.max(1, 18 - charAge), desc: 'Mayoría de edad' } : null,
                ] as any[]).filter(Boolean).slice(0, 6).map((opt: any) => (
                  <button key={opt.years} onClick={() => handleTimeAdvance(opt.years)}
                    className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-[#1e2530] hover:border-[#f5a623]/30 hover:bg-[#f5a623]/5 transition-all group">
                    <div className="text-left">
                      <div className="font-mono text-sm text-[#eef2f8] group-hover:text-[#f5a623] transition-colors">{opt.label}</div>
                      <div className="font-serif text-xs text-[#5a6478] italic">{opt.desc}</div>
                    </div>
                    <FastForward size={14} className="text-[#5a6478] group-hover:text-[#f5a623] transition-colors" />
                  </button>
                ))}
              </div>
              <button onClick={() => setShowTimeAdvance(false)} className="w-full py-2 rounded-xl font-mono text-sm border border-[#1e2530] text-[#5a6478] hover:text-[#eef2f8] transition-all">
                Cancelar
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* NARRATIVE RECOVERY MODAL (P1) */}
      <AnimatePresence>
        {showRecoveryModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="bg-[#0f1218] border border-[#ff4444]/30 rounded-2xl p-6 max-w-sm w-full mx-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={16} className="text-[#ff4444]" />
                <h3 className="font-display font-bold text-lg text-[#ff4444]">Narrador sin respuesta</h3>
              </div>
              <p className="font-serif italic text-[#5a6478] text-sm mb-5">El narrador no ha podido generar respuesta dos veces consecutivas. Elige cómo continuar:</p>
              <div className="space-y-2">
                <button onClick={handleRecoveryRetry}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-[#3d8eff]/30 hover:bg-[#3d8eff]/10 text-left transition-all group">
                  <RefreshCw size={14} className="text-[#3d8eff] flex-shrink-0" />
                  <div>
                    <div className="font-mono text-sm text-[#eef2f8]">Reintentar</div>
                    <div className="font-serif text-xs text-[#5a6478] italic">Volver a enviar la misma acción</div>
                  </div>
                </button>
                <button onClick={handleRecoveryUndo}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-[#f5a623]/30 hover:bg-[#f5a623]/10 text-left transition-all group">
                  <Undo2 size={14} className="text-[#f5a623] flex-shrink-0" />
                  <div>
                    <div className="font-mono text-sm text-[#eef2f8]">Deshacer turno</div>
                    <div className="font-serif text-xs text-[#5a6478] italic">Volver al estado anterior</div>
                  </div>
                </button>
                <button onClick={() => { setShowRecoveryModal(false); setConsecutiveErrors(0); setShowStateUpdatePanel(true); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-[#00d4a8]/30 hover:bg-[#00d4a8]/10 text-left transition-all group">
                  <Database size={14} className="text-[#00d4a8] flex-shrink-0" />
                  <div>
                    <div className="font-mono text-sm text-[#eef2f8]">Forzar actualización de estado</div>
                    <div className="font-serif text-xs text-[#5a6478] italic">Actualiza las fichas sin narrar</div>
                  </div>
                </button>
              </div>
              <button onClick={() => { setShowRecoveryModal(false); setConsecutiveErrors(0); }}
                className="w-full mt-3 py-2 rounded-xl font-mono text-xs border border-[#1e2530] text-[#5a6478] hover:text-[#eef2f8] transition-all">
                Cerrar
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ACTUALIZAR ESTADO PANEL (P4) */}
      <AnimatePresence>
        {showStateUpdatePanel && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={() => !isUpdatingState && setShowStateUpdatePanel(false)}>
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="bg-[#0f1218] border border-[#3d8eff]/30 rounded-2xl p-6 max-w-sm w-full mx-4 max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Database size={16} className="text-[#3d8eff]" />
                  <h3 className="font-display font-bold text-lg">Actualizar Estado</h3>
                </div>
                {!isUpdatingState && <button onClick={() => setShowStateUpdatePanel(false)} className="text-[#5a6478] hover:text-[#eef2f8]"><X size={16} /></button>}
              </div>
              <p className="font-serif italic text-[#5a6478] text-xs mb-4">La IA analizará el contexto completo y actualizará coherentemente todos los campos. No genera narración.</p>

              {/* Mode tabs */}
              <div className="flex gap-2 mb-4">
                {(['general', 'sections'] as const).map((m) => (
                  <button key={m} onClick={() => setStateUpdateMode(m)}
                    className={`flex-1 py-1.5 rounded-lg font-mono text-[10px] border transition-all ${stateUpdateMode === m ? 'border-[#3d8eff]/50 bg-[#3d8eff]/10 text-[#3d8eff]' : 'border-[#1e2530] text-[#5a6478] hover:text-[#eef2f8]'}`}>
                    {m === 'general' ? 'General' : 'Por secciones'}
                  </button>
                ))}
              </div>

              {stateUpdateMode === 'general' && (
                <div className="mb-4 p-3 rounded-xl bg-[#3d8eff08] border border-[#3d8eff]/15">
                  <div className="font-mono text-[10px] text-[#3d8eff] mb-1">ACTUALIZACIÓN GENERAL</div>
                  <p className="font-serif text-xs text-[#5a6478]">Actualiza todo: personaje, NPCs, facciones, mundo, inventario, relaciones, habilidades, descriptores, atributos y psicología. Reescritura completa coherente con la narrativa.</p>
                </div>
              )}

              {stateUpdateMode === 'sections' && (
                <div className="mb-4 space-y-1">
                  <div className="font-mono text-[10px] text-[#5a6478] mb-2">SELECCIONAR SECCIONES:</div>
                  {STATE_SECTION_OPTIONS.map((s) => (
                    <label key={s} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#1e2530]/50 cursor-pointer">
                      <input type="checkbox" checked={stateUpdateSections.includes(s)}
                        onChange={(e) => setStateUpdateSections(prev => e.target.checked ? [...prev, s] : prev.filter(x => x !== s))}
                        className="accent-[#3d8eff] w-3 h-3" />
                      <span className="font-mono text-xs text-[#c8d0dc]">{s}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* Manual instructions field */}
              <div className="mb-4">
                <div className="font-mono text-[10px] text-[#f5a623] tracking-widest mb-1.5">INSTRUCCIONES MANUALES (opcional)</div>
                <textarea
                  value={stateUpdateInstructions}
                  onChange={(e) => setStateUpdateInstructions(e.target.value)}
                  disabled={isUpdatingState}
                  placeholder="Escribe qué quieres corregir o cambiar (ej: 'La edad de Alaric está mal, debería tener 34 años', 'El inventario debe incluir una espada'). La IA aplicará exactamente lo que indiques."
                  className="w-full h-24 bg-[#0a0c0f] border border-[#f5a623]/20 rounded-xl px-3 py-2 font-serif text-xs text-[#eef2f8] placeholder-[#5a6478]/60 focus:outline-none focus:border-[#f5a623]/50 resize-none disabled:opacity-40"
                />
              </div>

              {isUpdatingState && (
                <div className="mb-4 flex items-center gap-2 p-3 rounded-xl bg-[#3d8eff08] border border-[#3d8eff]/20">
                  <div className="w-3 h-3 border-2 border-[#3d8eff] border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  <span className="font-mono text-xs text-[#3d8eff]">Analizando y actualizando...</span>
                </div>
              )}

              {stateUpdateResult && !isUpdatingState && (
                <div className={`mb-4 p-3 rounded-xl border text-xs font-mono ${stateUpdateResult.startsWith('✓') ? 'bg-[#00d4a808] border-[#00d4a8]/30 text-[#00d4a8]' : 'bg-[#ff444408] border-[#ff4444]/30 text-[#ff4444]'}`}>
                  {stateUpdateResult}
                </div>
              )}

              <button
                onClick={() => handleForceStateUpdate(stateUpdateMode === 'sections' ? stateUpdateSections : [])}
                disabled={isUpdatingState || (stateUpdateMode === 'sections' && stateUpdateSections.length === 0 && !stateUpdateInstructions.trim())}
                className="w-full py-2.5 rounded-xl font-mono text-sm bg-[#3d8eff] text-white hover:bg-[#3d8eff]/80 transition-all disabled:opacity-30 mb-2">
                {isUpdatingState ? 'Actualizando...' : stateUpdateMode === 'general' ? 'Actualizar Todo' : stateUpdateSections.length > 0 ? `Actualizar (${stateUpdateSections.length})` : 'Ejecutar instrucciones'}
              </button>
              {!isUpdatingState && <button onClick={() => setShowStateUpdatePanel(false)}
                className="w-full py-2 rounded-xl font-mono text-xs border border-[#1e2530] text-[#5a6478] hover:text-[#eef2f8] transition-all">
                Cerrar
              </button>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SUGGEST / EDIT FIELD MODAL (P5) */}
      <AnimatePresence>
        {editingField && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={() => !isSuggesting && (setEditingField(null), setSuggestError(null))}>
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="bg-[#0f1218] border border-[#f5a623]/30 rounded-2xl p-6 max-w-sm w-full mx-4"
              onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Wand2 size={14} className="text-[#f5a623]" />
                  <span className="font-mono text-xs text-[#f5a623] uppercase tracking-wider">{editingField.label}</span>
                </div>
                <button onClick={() => { setEditingField(null); setSuggestError(null); }} className="text-[#5a6478] hover:text-[#eef2f8]"><X size={14} /></button>
              </div>
              <div className="mb-3 p-2 rounded-lg bg-[#1e2530] border border-[#1e2530]">
                <div className="font-mono text-[9px] text-[#5a6478] mb-1">VALOR ACTUAL</div>
                <p className="font-serif text-xs text-[#c8d0dc]">{editingField.value || '—'}</p>
              </div>
              {suggestError && (
                <div className="mb-3 p-2 rounded-lg bg-[#ff4444]/10 border border-[#ff4444]/30 flex items-start gap-2">
                  <AlertTriangle size={12} className="text-[#ff4444] mt-0.5 flex-shrink-0" />
                  <p className="font-mono text-[9px] text-[#ff4444]">{suggestError}</p>
                </div>
              )}
              <textarea value={suggestInput} onChange={(e) => { setSuggestInput(e.target.value); setSuggestError(null); }}
                placeholder="Describe qué quieres cambiar o añadir..."
                className="w-full h-20 bg-[#0a0c0f] border border-[#1e2530] rounded-xl px-3 py-2 font-serif text-sm text-[#eef2f8] placeholder-[#5a6478] focus:outline-none focus:border-[#f5a623]/50 resize-none mb-3" />
              <button onClick={handleApplySuggestion} disabled={!suggestInput.trim() || isSuggesting}
                className="w-full py-2.5 rounded-xl font-mono text-sm bg-[#f5a623] text-[#0a0c0f] hover:bg-[#f5a623]/80 transition-all disabled:opacity-30">
                {isSuggesting ? 'Consultando a la IA...' : 'Sugerir cambio'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* EXIT MODAL */}
      <AnimatePresence>
        {showConfirmExit && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="bg-[#0f1218] border border-[#1e2530] rounded-2xl p-8 max-w-sm w-full mx-4"
              onClick={(e) => e.stopPropagation()}>
              <h3 className="font-display font-bold text-xl mb-2">Pausar y salir</h3>
              <p className="font-serif italic text-[#5a6478] mb-6 text-sm">Tu progreso se guardará localmente.</p>
              <div className="flex gap-3">
                <button onClick={() => setLocation('/')} className="flex-1 py-3 rounded-xl font-mono text-sm border border-[#1e2530] text-[#5a6478] hover:text-[#eef2f8] transition-all">Salir</button>
                <button onClick={() => setShowConfirmExit(false)} className="flex-1 py-3 rounded-xl font-mono text-sm border border-[#3d8eff]/30 text-[#3d8eff] hover:bg-[#3d8eff]/10 transition-all">Continuar</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── NARRATOR CLOCK ANIMATION ─────────────────────────────────────────────────

function NarratorClock({ ingameDate, timeOfDay }: { ingameDate: string; timeOfDay: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => (t + 1) % 12), 200);
    return () => clearInterval(id);
  }, []);
  const angle = (tick / 12) * 360;
  return (
    <div className="flex items-center gap-4 py-4">
      <div className="relative w-12 h-12 flex-shrink-0">
        <svg viewBox="0 0 48 48" className="w-full h-full">
          <circle cx="24" cy="24" r="22" fill="none" stroke="#1e2530" strokeWidth="1.5" />
          {[0,1,2,3,4,5,6,7,8,9,10,11].map(i => {
            const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
            return <line key={i} x1={24 + 16 * Math.cos(a)} y1={24 + 16 * Math.sin(a)}
              x2={24 + 19 * Math.cos(a)} y2={24 + 19 * Math.sin(a)}
              stroke="#2a3040" strokeWidth="1" />;
          })}
          <line x1="24" y1="24"
            x2={24 + 13 * Math.cos((angle - 90) * Math.PI / 180)}
            y2={24 + 13 * Math.sin((angle - 90) * Math.PI / 180)}
            stroke="#3d8eff" strokeWidth="1.5" strokeLinecap="round"
            style={{ transition: 'x2 0.18s, y2 0.18s' }} />
          <line x1="24" y1="24"
            x2={24 + 9 * Math.cos((angle * 0.0833 - 90) * Math.PI / 180)}
            y2={24 + 9 * Math.sin((angle * 0.0833 - 90) * Math.PI / 180)}
            stroke="#5a6478" strokeWidth="2" strokeLinecap="round" />
          <circle cx="24" cy="24" r="2" fill="#3d8eff" />
        </svg>
      </div>
      <div>
        <div className="font-mono text-[10px] text-[#3d8eff] tracking-widest">EL TIEMPO AVANZA</div>
        <div className="font-mono text-xs text-[#5a6478] mt-0.5">{ingameDate}{timeOfDay ? ` · ${timeOfDay}` : ''}</div>
        <div className="flex gap-1 mt-1.5">
          {[0, 1, 2].map(i => (
            <motion.div key={i} className="w-1 h-1 bg-[#3d8eff]/60 rounded-full"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.25 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── FIELD RENDERER (type-specific display) ──────────────────────────────────

const STATE_COLORS: Record<string, string> = {
  activo: '#00d4a8', activa: '#00d4a8', active: '#00d4a8',
  inactivo: '#5a6478', inactiva: '#5a6478', inactive: '#5a6478',
  completado: '#3d8eff', completada: '#3d8eff', completo: '#3d8eff',
  pendiente: '#f5a623', pending: '#f5a623',
  cancelado: '#ff4444', cancelada: '#ff4444',
  muerto: '#ff4444', muerta: '#ff4444', dead: '#ff4444',
  vivo: '#00d4a8', viva: '#00d4a8', alive: '#00d4a8',
  critico: '#ff4444', crítico: '#ff4444', critical: '#ff4444',
  bueno: '#00d4a8', buena: '#00d4a8', good: '#00d4a8',
  malo: '#ff4444', mala: '#ff4444', bad: '#ff4444',
  estable: '#f5a623', stable: '#f5a623',
  en_progreso: '#3d8eff', 'en progreso': '#3d8eff', progreso: '#3d8eff',
  descubierto: '#00d4a8', oculto: '#5a6478', bloqueado: '#ff4444',
  disponible: '#00d4a8', agotado: '#ff4444',
};

// ─── RICH TEXT RENDERER ───────────────────────────────────────────────────────
// Sistema unificado de texto enriquecido. Se usa en narración, secciones personalizadas,
// memoria IA y cualquier otro sistema de visualización de texto del juego.
function RichText({ children: text, variant = 'compact' }: {
  children: string;
  variant?: 'compact' | 'prose';
}) {
  if (!text) return null;
  const pClass = variant === 'prose'
    ? 'mb-0 leading-relaxed'
    : 'mb-0.5 last:mb-0 leading-relaxed';
  return (
    <ReactMarkdown
      remarkPlugins={[remarkBreaks]}
      components={{
        h1: ({ children }) => <h1 className="font-syne text-sm font-bold text-[#eef2f8] mt-2 mb-1 pb-0.5 border-b border-[#1e2530]">{children}</h1>,
        h2: ({ children }) => <h2 className="font-syne text-xs font-bold text-[#eef2f8] mt-1.5 mb-0.5">{children}</h2>,
        h3: ({ children }) => <h3 className="font-mono text-[9px] font-bold text-[#3d8eff] uppercase tracking-wider mt-1 mb-0.5">{children}</h3>,
        p: ({ children }) => <p className={pClass}>{children}</p>,
        strong: ({ children }) => <strong className="text-[#eef2f8] font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic text-[#c8d0dc]/80">{children}</em>,
        ul: ({ children }) => <ul className="my-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="my-0.5 list-none">{children}</ol>,
        li: ({ children }) => (
          <li className="flex items-start gap-1.5 leading-relaxed">
            <span className="text-[#3d8eff] flex-shrink-0 mt-0.5 text-[10px]">•</span>
            <span className="flex-1 min-w-0">{children}</span>
          </li>
        ),
        code: ({ children }) => <code className="font-mono text-[#f5a623] text-[0.85em] bg-[#141820] border border-[#1e2530] px-1 py-0.5 rounded">{children}</code>,
        blockquote: ({ children }) => <blockquote className="border-l-2 border-[#3d8eff]/40 pl-2 my-1 italic text-[#c8d0dc]/70">{children}</blockquote>,
        hr: () => <hr className="border-[#1e2530] my-1.5" />,
        br: () => <br />,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function FieldRenderer({ field }: { field: any }) {
  const val = String(field.value ?? '');
  const type = field.type || 'text';
  const label = <div className="font-mono text-[9px] text-[#5a6478] mb-0.5">{field.key.toUpperCase()}</div>;
  const meta = <div className="font-mono text-[8px] text-[#5a6478]/40 mt-0.5">{type}{field.aiManaged === false ? ' · manual' : ' · IA'}</div>;

  if (type === 'progress') {
    const num = Math.max(0, Math.min(100, parseFloat(val) || 0));
    const color = num > 66 ? '#00d4a8' : num > 33 ? '#f5a623' : '#ff4444';
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-[9px] text-[#5a6478]">{field.key.toUpperCase()}</span>
          <span className="font-mono text-[9px] font-bold" style={{ color }}>{num}%</span>
        </div>
        <div className="h-2 rounded-full bg-[#141820] overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${num}%`, background: color }} />
        </div>
        {meta}
      </div>
    );
  }

  if (type === 'state') {
    const color = STATE_COLORS[val.toLowerCase().trim()] || '#5a6478';
    return (
      <div>
        {label}
        <span className="inline-block font-mono text-[9px] px-2 py-0.5 rounded-full border" style={{ background: color + '20', color, borderColor: color + '40' }}>
          {val || '—'}
        </span>
        {meta}
      </div>
    );
  }

  if (type === 'tags') {
    const tags = val.split(/[,;]+/).map((t: string) => t.trim()).filter(Boolean);
    return (
      <div>
        {label}
        <div className="flex flex-wrap gap-1 mt-1">
          {tags.length > 0 ? tags.map((tag: string, i: number) => (
            <span key={i} className="font-mono text-[8px] px-1.5 py-0.5 rounded border border-[#3d8eff]/30 bg-[#3d8eff]/10 text-[#3d8eff]">{tag}</span>
          )) : <span className="font-serif text-xs italic text-[#5a6478]">Sin etiquetas</span>}
        </div>
        {meta}
      </div>
    );
  }

  if (type === 'list') {
    const items = val.split(/\n|•|·|–|-(?= )/).map((t: string) => t.replace(/^[-•·–]\s*/, '').trim()).filter(Boolean);
    return (
      <div>
        {label}
        {items.length > 0 ? (
          <ul className="space-y-0.5 mt-1">
            {items.map((item: string, i: number) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-[#3d8eff] text-[10px] mt-0.5 flex-shrink-0">•</span>
                <span className="font-serif text-xs text-[#c8d0dc] flex-1 min-w-0">
                  <RichText>{item}</RichText>
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="font-serif text-xs italic text-[#5a6478] mt-1">—</p>}
        {meta}
      </div>
    );
  }

  if (type === 'number') {
    return (
      <div className="flex items-center justify-between">
        <div>{label}{meta}</div>
        <span className="font-mono text-base font-bold text-[#f5a623]">{val || '0'}</span>
      </div>
    );
  }

  if (type === 'date') {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1">{label}{meta}</div>
        <span className="font-mono text-[9px] text-[#3d8eff] bg-[#3d8eff]/10 border border-[#3d8eff]/20 px-1.5 py-0.5 rounded">{val || '—'}</span>
      </div>
    );
  }

  if (type === 'header') {
    return (
      <div className="flex items-center gap-2 py-1">
        <div className="h-px flex-1 bg-gradient-to-r from-[#f5a623]/40 to-transparent" />
        <span className="font-mono text-[9px] text-[#f5a623]/80 tracking-widest uppercase">{field.key}</span>
        <div className="h-px flex-1 bg-gradient-to-l from-[#f5a623]/40 to-transparent" />
      </div>
    );
  }

  if (type === 'table') {
    const rawLines = val.split('\n').map((l: string) => l.trim()).filter(Boolean);
    const isMdTable = rawLines.some((l: string) => l.startsWith('|'));
    if (isMdTable) {
      const dataRows = rawLines.filter((l: string) => !l.match(/^\|[\s\-|:]+\|?$/));
      const hasHeader = rawLines.some((l: string) => l.match(/^\|[\s\-|:]+\|?$/));
      const rows = dataRows.map((l: string) => {
        const cells = l.split('|').map((c: string) => c.trim());
        if (cells[0] === '') cells.shift();
        if (cells[cells.length - 1] === '') cells.pop();
        return cells;
      });
      return (
        <div>
          {label}
          <div className="mt-1 rounded-lg overflow-hidden border border-[#1e2530] overflow-x-auto">
            <table className="w-full text-[10px] border-collapse">
              <tbody>
                {rows.map((row: string[], ri: number) => (
                  <tr key={ri} className={ri === 0 && hasHeader ? 'bg-[#1e2530]' : ri % 2 === 0 ? 'bg-[#141820]' : 'bg-[#0f1218]'}>
                    {row.map((cell: string, ci: number) => (
                      ri === 0 && hasHeader
                        ? <th key={ci} className="font-mono text-[9px] text-[#5a6478] px-2 py-1.5 border-b border-r last:border-r-0 border-[#1e2530] text-left">{cell}</th>
                        : <td key={ci} className="font-serif text-[#c8d0dc] px-2 py-1.5 border-r last:border-r-0 border-[#1e2530]">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {meta}
        </div>
      );
    }
    const kvRows = rawLines.map((line: string) => {
      const sep = line.indexOf(':');
      if (sep < 0) return null;
      return [line.slice(0, sep).trim(), line.slice(sep + 1).trim()];
    }).filter(Boolean) as [string, string][];
    return (
      <div>
        {label}
        {kvRows.length > 0 ? (
          <div className="mt-1 rounded-lg overflow-hidden border border-[#1e2530]">
            {kvRows.map(([k, v], i) => (
              <div key={i} className={`flex text-[10px] ${i % 2 === 0 ? 'bg-[#141820]' : 'bg-[#0f1218]'}`}>
                <div className="font-mono text-[#5a6478] px-2 py-1.5 w-2/5 border-r border-[#1e2530] flex-shrink-0 break-all">{k}</div>
                <div className="font-serif text-[#c8d0dc] px-2 py-1.5 flex-1">{v}</div>
              </div>
            ))}
          </div>
        ) : <p className="font-serif text-xs italic text-[#5a6478] mt-1">—</p>}
        {meta}
      </div>
    );
  }

  if (type === 'columns') {
    // Support | separated columns (2-4), with optional Title::content syntax
    const parts = val.split(/\s*\|\s*/).map((p: string) => p.trim()).filter(Boolean);
    const colCount = Math.min(Math.max(parts.length, 1), 4);
    if (parts.length === 0) return <div>{label}<p className="font-serif text-xs italic text-[#5a6478] mt-1">—</p>{meta}</div>;
    return (
      <div>
        {label}
        <div className="mt-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
          {parts.map((part: string, i: number) => {
            const sep = part.indexOf('::');
            const colTitle = sep >= 0 ? part.slice(0, sep).trim() : null;
            const colContent = sep >= 0 ? part.slice(sep + 2).trim() : part;
            return (
              <div key={i} className="bg-[#141820] rounded-lg px-2 py-1.5 border border-[#1e2530] min-w-0">
                {colTitle && <div className="font-mono text-[8px] text-[#5a6478] mb-1 uppercase tracking-wider truncate">{colTitle}</div>}
                <p className="font-serif text-xs text-[#c8d0dc] leading-relaxed break-words">{colContent || '—'}</p>
              </div>
            );
          })}
        </div>
        {meta}
      </div>
    );
  }

  // text: sistema unificado RichText
  return (
    <div>
      {label}
      <div className="font-serif text-xs text-[#c8d0dc]">
        {val ? <RichText>{val}</RichText> : <span className="italic text-[#5a6478]">—</span>}
      </div>
      {meta}
    </div>
  );
}

// ─── EDIT CONTEXT ────────────────────────────────────────────────────────────

interface EditContextValue {
  openSuggest: (path: string, label: string, value: string, fieldType?: string) => void;
  applyDirect: (path: string, value: string) => void;
}
const EditContext = React.createContext<EditContextValue | null>(null);

function EditableField({ path, label, value, fieldType, children }: { path: string; label: string; value: string; fieldType?: string; children: React.ReactNode }) {
  const ctx = React.useContext(EditContext);
  const [hovered, setHovered] = React.useState(false);
  const [isInlineEditing, setIsInlineEditing] = React.useState(false);
  const [inlineValue, setInlineValue] = React.useState(value);
  const type = fieldType || 'text';

  if (!ctx) return <>{children}</>;

  if (isInlineEditing) {
    const inputEl = (() => {
      if (type === 'progress') {
        const num = Math.max(0, Math.min(100, parseFloat(inlineValue) || 0));
        return (
          <div className="space-y-1">
            <input type="range" min="0" max="100" value={num}
              onChange={(e) => setInlineValue(e.target.value)}
              className="w-full accent-[#f5a623]" />
            <div className="flex items-center gap-2">
              <input type="number" min="0" max="100" value={inlineValue}
                onChange={(e) => setInlineValue(e.target.value)}
                className="w-20 bg-[#0a0c0f] border border-[#f5a623]/40 rounded px-2 py-1 font-mono text-xs text-[#f5a623] focus:outline-none" />
              <span className="font-mono text-xs text-[#5a6478]">/ 100</span>
            </div>
          </div>
        );
      }
      if (type === 'number') {
        return (
          <input type="number" value={inlineValue} onChange={(e) => setInlineValue(e.target.value)} autoFocus
            className="w-full bg-[#0a0c0f] border border-[#f5a623]/40 rounded-lg px-2 py-1.5 font-mono text-sm text-[#f5a623] focus:outline-none focus:border-[#f5a623]" />
        );
      }
      if (type === 'state') {
        const commonStates = ['activo', 'inactivo', 'completado', 'pendiente', 'cancelado', 'vivo', 'muerto', 'estable', 'critico', 'en progreso', 'descubierto', 'oculto', 'bloqueado', 'disponible', 'agotado'];
        return (
          <div className="space-y-1">
            <input type="text" value={inlineValue} onChange={(e) => setInlineValue(e.target.value)} autoFocus
              placeholder="Estado personalizado..."
              className="w-full bg-[#0a0c0f] border border-[#f5a623]/40 rounded-lg px-2 py-1.5 font-mono text-xs text-[#eef2f8] focus:outline-none focus:border-[#f5a623]" />
            <div className="flex flex-wrap gap-1">
              {commonStates.map(s => (
                <button key={s} onClick={() => setInlineValue(s)}
                  className="font-mono text-[8px] px-1.5 py-0.5 rounded border border-[#5a6478]/30 hover:border-[#f5a623]/40 hover:text-[#f5a623] text-[#5a6478] transition-all"
                  style={inlineValue === s ? { borderColor: (STATE_COLORS[s] || '#5a6478') + '60', color: STATE_COLORS[s] || '#5a6478', background: (STATE_COLORS[s] || '#5a6478') + '15' } : {}}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        );
      }
      if (type === 'tags') {
        return (
          <input type="text" value={inlineValue} onChange={(e) => setInlineValue(e.target.value)} autoFocus
            placeholder="tag1, tag2, tag3..."
            className="w-full bg-[#0a0c0f] border border-[#f5a623]/40 rounded-lg px-2 py-1.5 font-mono text-xs text-[#eef2f8] focus:outline-none focus:border-[#f5a623]" />
        );
      }
      if (type === 'date') {
        return (
          <input type="text" value={inlineValue} onChange={(e) => setInlineValue(e.target.value)} autoFocus
            placeholder="Ej: 3 de abril, Año 1247..."
            className="w-full bg-[#0a0c0f] border border-[#f5a623]/40 rounded-lg px-2 py-1.5 font-mono text-xs text-[#eef2f8] focus:outline-none focus:border-[#f5a623]" />
        );
      }
      // list, text, default
      return (
        <textarea value={inlineValue} onChange={(e) => setInlineValue(e.target.value)} autoFocus
          placeholder={type === 'list' ? '• Item 1\n• Item 2\n• Item 3' : 'Escribe el nuevo valor...'}
          className="w-full bg-[#0a0c0f] border border-[#f5a623]/40 rounded-lg px-2 py-1.5 font-serif text-xs text-[#eef2f8] focus:outline-none focus:border-[#f5a623] resize-none min-h-[60px]" />
      );
    })();

    return (
      <div className="space-y-1.5">
        {inputEl}
        <div className="flex gap-1">
          <button onClick={() => { ctx.applyDirect(path, inlineValue); setIsInlineEditing(false); }}
            className="flex-1 py-1 rounded font-mono text-[9px] bg-[#f5a623] text-[#0a0c0f] hover:opacity-80 transition-all">Guardar</button>
          <button onClick={() => { ctx.openSuggest(path, label, value, type); setIsInlineEditing(false); }}
            className="flex-1 py-1 rounded font-mono text-[9px] border border-[#f5a623]/30 text-[#f5a623] hover:bg-[#f5a623]/10 transition-all">Sugerir IA</button>
          <button onClick={() => setIsInlineEditing(false)}
            className="px-2 py-1 rounded font-mono text-[9px] border border-[#1e2530] text-[#5a6478] hover:text-[#eef2f8] transition-all">✕</button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative group">
      {children}
      <button onClick={() => { setInlineValue(value); setIsInlineEditing(true); }}
        className="absolute top-0 right-0 p-1.5 rounded bg-[#1e2530]/90 border border-[#f5a623]/20 text-[#f5a623]/25 hover:text-[#f5a623] active:text-[#f5a623] group-hover:text-[#f5a623]/70 transition-colors z-10 touch-manipulation"
        title={`Editar: ${label}`}>
        <Pencil size={10} />
      </button>
    </div>
  );
}

// ─── SHARED HELPERS ──────────────────────────────────────────────────────────

function MiniBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="font-mono text-[9px] text-[#5a6478] flex-shrink-0">{label}</span>
      <div className="flex-1 h-1 bg-[#141820] rounded-full overflow-hidden min-w-[40px]">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
      </div>
    </div>
  );
}

function PanelSection({ title, children, color }: { title: string; children: React.ReactNode; color?: string }) {
  return (
    <div className="mb-5">
      <div className="font-mono text-[10px] tracking-widest mb-3 border-b border-[#1e2530] pb-1" style={{ color: color || '#5a6478' }}>{title}</div>
      {children}
    </div>
  );
}

function AttributeRow({ label, value, tutorialKey }: { label: string; value?: string; tutorialKey: keyof typeof ATTRIBUTE_TUTORIALS }) {
  const [open, setOpen] = useState(false);
  const info = ATTRIBUTE_TUTORIALS[tutorialKey];
  const POSITIVE = ['Impecable', 'Saciado', 'Alerta', 'Imperturbable', 'Excepcional', 'Genio', 'Imponente', 'Noble/Elite', 'Maestro'];
  const NEUTRAL = ['Magullado', 'Débil', 'Nublado', 'Tenso', 'Atlético', 'Sagaz', 'Carismático', 'Influyente', 'Funcional', 'Promedio', 'Común', 'Plebeyo', 'Competente'];
  const NEGATIVE = ['Lesionado', 'Famélico', 'Somnoliento', 'Ansioso'];
  const CRITICAL = ['Lisiado', 'Agonizante', 'Desfallecido', 'Agotado', 'En Pánico', 'Colapsado', 'Paria', 'Delirante', 'Torpe', 'Limitado', 'Invisible', 'Nulo'];
  const gradeColor = !value || value === '???' ? '#5a6478' : POSITIVE.includes(value) ? '#00d4a8' : NEUTRAL.includes(value) ? '#3d8eff' : NEGATIVE.includes(value) ? '#f5a623' : CRITICAL.includes(value) ? '#ff4444' : '#c8d0dc';
  return (
    <div className="p-2 rounded-lg bg-[#141820] border border-[#1e2530]">
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-[10px] text-[#5a6478]">{label}</span>
        <button onClick={() => setOpen(!open)} className="text-[#5a6478] hover:text-[#3d8eff] transition-colors"><Info size={10} /></button>
      </div>
      <div className="font-serif text-sm font-medium" style={{ color: gradeColor }}>{value || '???'}</div>
      {open && (
        <div className="mt-2 p-2 rounded bg-[#0f1218] border border-[#3d8eff]/20">
          <p className="font-serif text-[10px] italic text-[#5a6478] leading-relaxed">{info?.tutorial}</p>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, dim }: { label: string; value?: any; dim?: boolean }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="font-mono text-[10px] text-[#5a6478] flex-shrink-0">{label.toUpperCase()}</span>
      <span className={`font-serif text-xs text-right ${dim ? 'text-[#5a6478]/70 italic' : 'text-[#c8d0dc]'}`}>{String(value)}</span>
    </div>
  );
}

function TabBar({ tabs, active, onChange }: { tabs: string[]; active: number; onChange: (i: number) => void }) {
  return (
    <div className="flex gap-1 flex-wrap mb-4 pb-2 border-b border-[#1e2530]">
      {tabs.map((t, i) => (
        <button key={t} onClick={() => onChange(i)} className="px-2 py-1 rounded font-mono text-[9px] transition-all"
          style={{ background: active === i ? '#3d8eff20' : '#14182050', color: active === i ? '#3d8eff' : '#5a6478', border: `1px solid ${active === i ? '#3d8eff30' : '#1e2530'}` }}>
          {t}
        </button>
      ))}
    </div>
  );
}

function Toggle({ value, onChange, label, desc }: { value: boolean; onChange: () => void; label: string; desc?: string }) {
  return (
    <button onClick={onChange} className="w-full flex justify-between items-center px-3 py-2 rounded-lg border border-[#1e2530] bg-[#0f1218] text-left">
      <div>
        <span className="font-mono text-xs text-[#5a6478]">{label}</span>
        {desc && <p className="font-serif text-[10px] italic text-[#5a6478]/60">{desc}</p>}
      </div>
      <div className="w-8 h-4 rounded-full flex items-center transition-all ml-3 flex-shrink-0"
        style={{ background: value ? '#3d8eff40' : '#1e2530', border: `1px solid ${value ? '#3d8eff' : '#1e2530'}` }}>
        <div className="w-2.5 h-2.5 rounded-full mx-0.5 transition-all"
          style={{ background: value ? '#3d8eff' : '#5a6478', transform: value ? 'translateX(16px)' : 'translateX(0)' }} />
      </div>
    </button>
  );
}

// ─── CHARACTER PANEL ─────────────────────────────────────────────────────────

function CharacterPanel({ run }: { run: any }) {
  const char = run?.character || {};
  const desc = char.appearance || {};
  const attrs: any = run?.realisticAttributes || {};
  const descriptors: any = run?.descriptors || {};
  const inventory: any[] = run?.inventory || [];
  const historyEvents: any[] = run?.personalHistory || [];
  const npcs: any[] = run?.npcs || [];
  const partesDelCuerpo: PartesDelCuerpo = run?.partesDelCuerpo || DEFAULT_BODY_PARTS;
  const age = char.age ?? 0;

  const TABS = ['Identidad', 'Atributos', 'Descriptores', 'Inventario', 'Habilidades', 'Relaciones', 'Historia', 'Salud', 'Psicología', 'Legado', 'Notas+'];
  const [tab, setTab] = useState(0);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);

  const wornItems = inventory.filter((i: any) => i.isWorn);
  const carriedItems = inventory.filter((i: any) => !i.isWorn);
  const totalWeight = inventory.reduce((acc: number, i: any) => acc + (i.weight || 0), 0);

  const allFamilyNPCs = npcs.filter((n: any) => {
    const rel = n.relationship || {};
    const type = (rel.familyRole || rel.type || '').toLowerCase();
    return isFamilyRole(type) || ['madre','padre','hermano','hermana','hijo','hija','abuelo','abuela','tío','tía','primo','prima','esposa','esposo','cónyuge','familiar'].some(r => type.includes(r));
  });
  const otherNPCs = npcs.filter((n: any) => !allFamilyNPCs.includes(n));

  const BODY_LABELS: Record<string, string> = { cabeza: 'Cabeza', torso: 'Torso', brazoDerecho: 'Brazo D.', brazoIzquierdo: 'Brazo I.', piernaDerecha: 'Pierna D.', piernaIzquierda: 'Pierna I.' };
  const BODY_COLOR: Record<string, string> = { Sano: '#00d4a8', Magullado: '#f5a623', Herido: '#ff9800', Fracturado: '#ff4444', Inutilizado: '#8b0000' };

  const conditionColor = (c: string) => c === 'nuevo' ? '#00d4a8' : c === 'usado' ? '#f5a623' : c === 'deteriorado' ? '#ff9800' : '#ff4444';

  const emoClimate = run?.emotionalClimate || 'sereno';
  const emoColor = EMOTIONAL_COLORS[emoClimate] || '#3d8eff';

  const fears = char.fears || char.personality?.fears || char.personality?.negative?.filter((t: string) => t.toLowerCase().startsWith('miedo')) || [];
  const desires = char.desires || char.personality?.desires || [];

  return (
    <div>
      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {tab === 0 && (
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="w-20 h-24 rounded-xl overflow-hidden border border-[#1e2530] flex-shrink-0 bg-[#141820]">
              {char.portraitUrl ? <img src={char.portraitUrl} alt={char.name} className="w-full h-full object-cover" /> : <SilhouettePortrait gender={char.gender} />}
            </div>
            <div className="flex-1 space-y-1">
              <div className="font-serif text-lg text-[#eef2f8]">{char.name || '—'}</div>
              <div className="font-mono text-[10px] text-[#5a6478]">{getAgeDescription(age)}</div>
              <div className="font-mono text-[10px] text-[#3d8eff]/70">{char.socialClass || '—'}</div>
            </div>
          </div>
          <InfoRow label="Género" value={char.gender} />
          <InfoRow label="Ocupación" value={char.occupation || char.role} />
          {char.birthYear && <InfoRow label="Año de nacimiento" value={`${char.birthDay ? `${char.birthDay} de ${MESES_MEDIEVALES[(char.birthMonth - 1) % 12]}, ` : ''}${char.birthYear}`} />}
          <InfoRow label="Lugar de nacimiento" value={char.birthPlace || char.origin} />
          <InfoRow label="Madre" value={char.motherName} />
          <InfoRow label="Padre" value={char.fatherName} />
          <InfoRow label="Religión" value={char.religion} />
          <InfoRow label="Lengua materna" value={char.language || char.motherTongue} />
          <InfoRow label="Clase social de origen" value={char.originClass || char.socialClass} />
          <InfoRow label="Tez" value={desc.skin} />
          <InfoRow label="Cabello" value={desc.hair} />
          <InfoRow label="Ojos" value={desc.eyes} />
          <InfoRow label="Complexión" value={desc.build} />
          {(desc.features || []).length > 0 && (
            <div>
              <div className="font-mono text-[10px] text-[#5a6478] mb-1">RASGOS DISTINTIVOS</div>
              <div className="flex flex-wrap gap-1">{(desc.features || []).map((f: string) => <span key={f} className="px-2 py-0.5 rounded-full bg-[#141820] border border-[#1e2530] font-mono text-[9px] text-[#c8d0dc]">{f}</span>)}</div>
            </div>
          )}
          {desc.freeDescription && (
            <EditableField path="appearance.freeDescription" label="Descripción actual" value={desc.freeDescription}>
              <div><div className="font-mono text-[10px] text-[#5a6478] mb-1">DESCRIPCIÓN ACTUAL</div><p className="font-serif text-xs text-[#c8d0dc] leading-relaxed italic">{desc.freeDescription}</p></div>
            </EditableField>
          )}
        </div>
      )}

      {tab === 1 && (
        <div className="space-y-4">
          <PanelSection title="DIMENSIONES VITALES">
            <div className="space-y-2">
              <AttributeRow tutorialKey="integridadFisica" label="Integridad Física" value={attrs.integridadFisica} />
              <AttributeRow tutorialKey="reservaMetabolica" label="Reserva Metabólica" value={attrs.reservaMetabolica} />
              <AttributeRow tutorialKey="cargaCognitiva" label="Carga Cognitiva" value={attrs.cargaCognitiva} />
              <AttributeRow tutorialKey="umbralDeEstres" label="Umbral de Estrés" value={attrs.umbralDeEstres} />
            </div>
          </PanelSection>
          <PanelSection title="PERFIL DE COMPETENCIA">
            <div className="space-y-2">
              <AttributeRow tutorialKey="aptitudMotriz" label="Aptitud Motriz" value={attrs.aptitudMotriz} />
              <AttributeRow tutorialKey="intelectoAplicado" label="Intelecto Aplicado" value={attrs.intelectoAplicado} />
              <AttributeRow tutorialKey="presenciaSocial" label="Presencia Social" value={attrs.presenciaSocial} />
              <AttributeRow tutorialKey="estatusDeCasta" label="Estatus de Casta/Clase" value={attrs.estatusDeCasta} />
            </div>
          </PanelSection>
        </div>
      )}

      {tab === 2 && (
        <div className="space-y-3">
          <PanelSection title="ESTADO GENERAL">
            <div className="space-y-2">
              <InfoRow label="Estado Físico" value={descriptors.estadoFisico || (age < 3 ? 'Infante sano' : undefined)} />
              <InfoRow label="Condición Mental" value={descriptors.condicionMental || (age < 3 ? 'Inocente' : undefined)} />
              <InfoRow label="Combate" value={descriptors.combate || (age < 12 ? 'Sin entrenamiento' : undefined)} />
              <InfoRow label="Habilidades Sociales" value={descriptors.habilidadesSociales} />
              <InfoRow label="Conocimiento" value={descriptors.conocimiento} />
            </div>
          </PanelSection>
          <PanelSection title="REPUTACIÓN">
            <div className="space-y-2">
              <div className="p-2 rounded-lg bg-[#141820] border border-[#1e2530]">
                <div className="font-mono text-[9px] text-[#5a6478] mb-1">CONDICIÓN SOCIAL</div>
                <div className="font-serif text-sm text-[#c8d0dc]">{descriptors.condicionSocial || char.socialClass || '—'}</div>
              </div>
              <div className="p-2 rounded-lg bg-[#141820] border border-[#1e2530]">
                <div className="font-mono text-[9px] text-[#5a6478] mb-1">REPUTACIÓN LOCAL</div>
                <div className="font-serif text-sm text-[#c8d0dc]">{descriptors.reputacionLocal || (age < 5 ? 'Sin establecer' : '—')}</div>
              </div>
              <div className="p-2 rounded-lg bg-[#141820] border border-[#f5a623]/20">
                <div className="font-mono text-[9px] text-[#f5a623]/70 mb-1">RENOMBRE GLOBAL</div>
                <div className="font-serif text-sm text-[#c8d0dc]">{descriptors.renombreGlobal || 'Desconocido'}</div>
              </div>
            </div>
          </PanelSection>
        </div>
      )}

      {tab === 3 && (
        <div className="space-y-3">
          {selectedItem ? (
            <div>
              <button onClick={() => setSelectedItem(null)} className="flex items-center gap-1 font-mono text-[10px] text-[#5a6478] hover:text-[#3d8eff] mb-3 transition-colors">
                <ArrowLeft size={10} /> Volver al inventario
              </button>
              <div className="p-4 rounded-xl bg-[#0f1218] border border-[#1e2530] space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-serif text-base text-[#eef2f8]">{selectedItem.name}</div>
                    {selectedItem.category && <div className="font-mono text-[9px] text-[#5a6478] mt-0.5">{selectedItem.category?.toUpperCase()}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedItem.isSpecial && <Star size={12} className="text-[#f5a623]" />}
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded-full" style={{ color: conditionColor(selectedItem.condition), background: conditionColor(selectedItem.condition) + '15' }}>{selectedItem.condition}</span>
                  </div>
                </div>
                {selectedItem.description && <p className="font-serif text-sm text-[#c8d0dc] leading-relaxed italic">{selectedItem.description}</p>}
                <div className="space-y-1.5 pt-2 border-t border-[#1e2530]">
                  {selectedItem.eraOrigin && <InfoRow label="Origen" value={selectedItem.eraOrigin} />}
                  {selectedItem.weight && <InfoRow label="Peso" value={`${selectedItem.weight} ${selectedItem.weightUnit || 'unidades'}`} />}
                  {selectedItem.quantity && selectedItem.quantity > 1 && <InfoRow label="Cantidad" value={`x${selectedItem.quantity}`} />}
                  {selectedItem.isWorn && <InfoRow label="Equipado en" value={selectedItem.wornSlot || 'cuerpo'} />}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="p-3 rounded-xl bg-[#0f1218] border border-[#1e2530] flex items-center justify-between">
                <div>
                  <div className="font-mono text-[10px] text-[#5a6478]">CARGA TOTAL</div>
                  <div className="font-mono text-sm text-[#eef2f8]">{totalWeight.toFixed(1)} unidades</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[10px] text-[#f5a623]">MONEDAS</div>
                  <div className="font-mono text-sm text-[#f5a623]">{run?.currency?.amount ?? 0} {run?.currency?.name || 'monedas'}</div>
                  {run?.currency?.context && <div className="font-mono text-[9px] text-[#5a6478]/70 italic">{run.currency.context}</div>}
                </div>
              </div>
              {wornItems.length > 0 && (
                <PanelSection title="VESTIMENTA EQUIPADA">
                  <div className="space-y-2">
                    {wornItems.map((item: any) => (
                      <button key={item.id} onClick={() => setSelectedItem(item)}
                        className="w-full p-2 rounded-lg border border-[#3d8eff]/20 bg-[#3d8eff]/5 hover:bg-[#3d8eff]/10 transition-all text-left">
                        <div className="flex justify-between items-start">
                          <span className="font-mono text-xs text-[#c8d0dc]">{item.name}</span>
                          <div className="flex items-center gap-1">
                            {item.wornSlot && <span className="font-mono text-[8px] text-[#3d8eff]/70 px-1 py-0.5 rounded bg-[#3d8eff]/10">{item.wornSlot}</span>}
                            <span className="font-mono text-[9px]" style={{ color: conditionColor(item.condition) }}>{item.condition}</span>
                            <ChevronRight size={10} className="text-[#5a6478]" />
                          </div>
                        </div>
                        {item.description && <p className="font-serif text-[10px] text-[#5a6478] mt-0.5 italic line-clamp-1">{item.description}</p>}
                      </button>
                    ))}
                  </div>
                </PanelSection>
              )}
              <PanelSection title={`OBJETOS PORTADOS (${carriedItems.length})`}>
                {carriedItems.length === 0 ? <p className="font-serif italic text-[#5a6478] text-xs">Sin objetos portados.</p> : (
                  <div className="space-y-2">
                    {carriedItems.map((item: any) => (
                      <button key={item.id} onClick={() => setSelectedItem(item)}
                        className="w-full p-2 rounded-lg border border-[#1e2530] bg-[#141820] hover:border-[#3d8eff]/20 hover:bg-[#3d8eff]/5 transition-all text-left">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-2">
                            {item.isSpecial && <Star size={9} className="text-[#f5a623] flex-shrink-0" />}
                            <span className="font-mono text-xs text-[#eef2f8]">{item.name}</span>
                            {item.quantity && item.quantity > 1 && <span className="font-mono text-[9px] text-[#5a6478]">x{item.quantity}</span>}
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-[9px]" style={{ color: conditionColor(item.condition) }}>{item.condition}</span>
                            <ChevronRight size={10} className="text-[#5a6478]" />
                          </div>
                        </div>
                        {item.description && <p className="font-serif text-[10px] text-[#5a6478] mt-0.5 italic line-clamp-1">{item.description}</p>}
                      </button>
                    ))}
                  </div>
                )}
              </PanelSection>
            </>
          )}
        </div>
      )}

      {tab === 4 && (
        <div className="space-y-4">
          <PanelSection title="HABILIDADES DE ERA">
            {(attrs.eraSkills || []).length === 0 ? <p className="font-serif italic text-[#5a6478] text-xs">Sin habilidades registradas. Se descubren con la práctica.</p> : (
              <div className="space-y-2">
                {(attrs.eraSkills as any[]).map((s: any, i: number) => {
                  const SKILL_LEVELS = ['Ignorante', 'Aprendiz', 'Competente', 'Experto', 'Maestro'];
                  const GRADE_COLORS: Record<string, string> = { 'Ignorante': '#ff4444', 'Aprendiz': '#3d8eff', 'Competente': '#00d4a8', 'Experto': '#f5a623', 'Maestro': '#f5a623' };
                  const gradeIdx = SKILL_LEVELS.indexOf(s.grade || 'Ignorante');
                  const gc = GRADE_COLORS[s.grade] || '#5a6478';
                  return (
                    <div key={i} className="p-2.5 rounded-lg bg-[#141820] border border-[#1e2530]">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-[#c8d0dc]">{s.name}</span>
                          <span className="font-mono text-[8px] text-[#5a6478] px-1.5 py-0.5 rounded bg-[#0f1218]">{s.category}</span>
                          {s.isNew && <span className="font-mono text-[8px] text-[#00d4a8] px-1 py-0.5 rounded bg-[#00d4a8]/10">NUEVA</span>}
                        </div>
                        <span className="font-mono text-[10px] font-semibold" style={{ color: gc }}>{s.grade || 'Ignorante'}</span>
                      </div>
                      <div className="flex gap-0.5 mb-1">
                        {SKILL_LEVELS.map((lvl, li) => (
                          <div key={lvl} className="flex-1 h-1 rounded-full transition-all"
                            style={{ background: li <= gradeIdx ? GRADE_COLORS[lvl] : '#1e2530', opacity: li <= gradeIdx ? 1 : 0.4 }} />
                        ))}
                      </div>
                      {s.description && <p className="font-serif text-[10px] text-[#5a6478] italic">{s.description}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </PanelSection>
          {char.languages?.length > 0 && (
            <PanelSection title="IDIOMAS">
              <div className="flex flex-wrap gap-1">
                {(char.languages as string[]).map((l: string, i: number) => (
                  <span key={i} className="px-2 py-0.5 rounded-full bg-[#3d8eff]/10 border border-[#3d8eff]/20 font-mono text-[9px] text-[#3d8eff]">{l}</span>
                ))}
              </div>
            </PanelSection>
          )}
        </div>
      )}

      {tab === 5 && (
        <div className="space-y-3">
          {allFamilyNPCs.length > 0 && (
            <PanelSection title="FAMILIA">
              <div className="space-y-2">
                {allFamilyNPCs.map((npc: any) => {
                  const rel = npc.relationship || {};
                  const ecType = rel.emotionalChargeType || 'neutral';
                  const ecColor = ecType === 'positiva' ? '#00d4a8' : ecType === 'negativa' ? '#ff4444' : ecType === 'tensa' ? '#f5a623' : '#5a6478';
                  const statusColors: Record<string, string> = { vivo: '#00d4a8', muerto: '#ff4444', desaparecido: '#f5a623' };
                  return (
                    <div key={npc.id} className="p-2 rounded-lg bg-[#141820] border border-[#1e2530]">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-serif text-sm text-[#eef2f8]">{npc.name}</span>
                          {npc.estimatedAge && <span className="font-mono text-[9px] text-[#5a6478] ml-2">{npc.estimatedAge}a</span>}
                        </div>
                        <div className="flex items-center gap-1">
                          {(rel.familyRole || rel.type) && <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-full bg-[#3d8eff]/10 text-[#3d8eff]/80">{rel.familyRole || rel.type}</span>}
                          <div className="w-2 h-2 rounded-full" style={{ background: statusColors[npc.status] || '#5a6478' }} title={npc.status} />
                        </div>
                      </div>
                      {rel.emotionalCharge && <p className="font-serif text-[10px] text-[#5a6478] italic mt-0.5">{rel.emotionalCharge}</p>}
                    </div>
                  );
                })}
              </div>
            </PanelSection>
          )}
          <PanelSection title={`CONOCIDOS (${otherNPCs.length})`}>
            {otherNPCs.length === 0 ? <p className="font-serif italic text-[#5a6478] text-xs">Sin relaciones fuera de la familia.</p> : (
              <div className="space-y-2">
                {otherNPCs.map((npc: any) => {
                  const rel = npc.relationship || {};
                  const trust = rel.trustLevel ?? 50;
                  const trustColor = trust > 66 ? '#00d4a8' : trust > 33 ? '#f5a623' : '#ff4444';
                  const ecType = rel.emotionalChargeType || 'neutral';
                  const ecColor = ecType === 'positiva' ? '#00d4a8' : ecType === 'negativa' ? '#ff4444' : ecType === 'tensa' ? '#f5a623' : '#5a6478';
                  const statusColors: Record<string, string> = { vivo: '#00d4a8', muerto: '#ff4444', desaparecido: '#f5a623' };
                  const keyMoments: string[] = rel.keyMoments || [];
                  const lastInteraction: string | null = (rel.interactionHistory || []).slice(-1)[0] || null;
                  return (
                    <div key={npc.id} className="p-2.5 rounded-lg bg-[#141820] border border-[#1e2530]">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: ecColor }} />
                          <span className="font-serif text-sm text-[#eef2f8]">{npc.name}</span>
                          {npc.estimatedAge && <span className="font-mono text-[9px] text-[#5a6478]">{npc.estimatedAge}a</span>}
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: statusColors[npc.status] || '#5a6478' }} title={npc.status} />
                        </div>
                        <div className="flex items-center gap-1">
                          {rel.type && <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-full bg-[#0f1218] text-[#5a6478]">{rel.type}</span>}
                        </div>
                      </div>
                      {npc.occupation && <div className="font-mono text-[9px] text-[#5a6478] mb-1">{npc.occupation}</div>}
                      {rel.emotionalCharge && <p className="font-serif text-[10px] italic mb-1.5" style={{ color: ecColor + 'cc' }}>{rel.emotionalCharge}</p>}
                      {rel.lastAttitude && <div className="font-mono text-[9px] text-[#5a6478] mb-1">Actitud reciente: <span className="text-[#c8d0dc]">{rel.lastAttitude}</span></div>}
                      <div className="flex items-center gap-2 mb-1">
                        <div className="flex-1 h-1 rounded-full bg-[#0f1218]">
                          <div className="h-1 rounded-full transition-all" style={{ width: `${trust}%`, background: `linear-gradient(90deg, #ff4444, #f5a623, #00d4a8)`, clipPath: `inset(0 ${100 - trust}% 0 0)` }} />
                        </div>
                        <span className="font-mono text-[8px]" style={{ color: trustColor }}>CONFIANZA {trust}%</span>
                      </div>
                      {keyMoments.length > 0 && (
                        <div className="mt-1.5 border-t border-[#1e2530] pt-1.5">
                          <div className="font-mono text-[8px] text-[#5a6478] mb-1">MOMENTOS CLAVE</div>
                          {keyMoments.slice(-2).map((m: string, i: number) => (
                            <div key={i} className="font-serif text-[10px] text-[#5a6478] italic">· {m}</div>
                          ))}
                        </div>
                      )}
                      {lastInteraction && (
                        <div className="mt-1 font-serif text-[9px] text-[#5a6478]/60 italic line-clamp-1">Último: {lastInteraction}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </PanelSection>
        </div>
      )}

      {tab === 6 && (
        <div className="space-y-2">
          {historyEvents.length === 0 ? (
            <p className="font-serif italic text-[#5a6478] text-sm py-4 text-center">El historial se registrará conforme avance la narración.</p>
          ) : (
            historyEvents.slice().reverse().map((event: any, i: number) => {
              const emoColor = (event.emotionalWeight || 0) > 0.7 ? '#f5a623' : (event.emotionalWeight || 0) > 0.4 ? '#3d8eff' : '#5a6478';
              const dateLabel = event.day && event.month
                ? `${event.day} de ${MESES_MEDIEVALES[(event.month - 1) % 12]}, ${event.year || '—'}`
                : event.year ? `Año ${event.year}` : event.date || '—';
              const isPast = event.isClosed;
              return (
                <div key={i} className={`p-3 rounded-lg border border-[#1e2530] relative overflow-hidden ${isPast ? 'opacity-60' : ''}`}
                  style={{ background: isPast ? '#0f1218' : '#141820' }}>
                  <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ background: emoColor }} />
                  <div className="font-mono text-[9px] mb-1 pl-2" style={{ color: emoColor }}>
                    {dateLabel}{isPast && ' · Período cerrado'}
                  </div>
                  <p className="font-serif text-xs text-[#c8d0dc] leading-relaxed pl-2">{event.description}</p>
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === 7 && (
        <div className="space-y-4">
          <PanelSection title="PARTES DEL CUERPO">
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(partesDelCuerpo).map(([part, estado]) => (
                <div key={part} className="p-2 rounded-lg border border-[#1e2530] bg-[#141820]">
                  <div className="font-mono text-[9px] text-[#5a6478] mb-1">{BODY_LABELS[part] || part}</div>
                  <div className="font-serif text-xs font-medium" style={{ color: BODY_COLOR[estado as string] || '#5a6478' }}>{estado}</div>
                </div>
              ))}
            </div>
          </PanelSection>
          <PanelSection title="VITALES">
            <div className="space-y-3">
              {[
                { label: 'SALUD', value: char.stats?.health ?? 100, color: '#00d4a8' },
                { label: 'ENERGÍA', value: char.stats?.energy ?? 100, color: '#3d8eff' },
                { label: 'HAMBRE', value: char.stats?.hunger ?? 50, color: '#f5a623' },
                { label: 'MORAL', value: char.stats?.morale ?? 70, color: '#eef2f8' },
                { label: 'SALUD MENTAL', value: char.stats?.mentalHealth ?? 80, color: '#8b5cf6' },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <div className="flex justify-between mb-1">
                    <span className="font-mono text-[9px] text-[#5a6478]">{label}</span>
                    <span className="font-mono text-[9px]" style={{ color }}>{Math.round(value)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#141820] overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
                  </div>
                </div>
              ))}
            </div>
          </PanelSection>
        </div>
      )}

      {tab === 8 && (
        <div className="space-y-3">
          <div className="p-3 rounded-xl bg-[#0f1218] border border-[#1e2530] flex items-center justify-between">
            <div className="font-mono text-[10px] text-[#5a6478]">CLIMA EMOCIONAL</div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: emoColor }} />
              <span className="font-mono text-xs font-semibold" style={{ color: emoColor }}>{emoClimate.replace('_', ' ').toUpperCase()}</span>
            </div>
          </div>
          <PanelSection title="PERSONALIDAD">
            {char.personality?.positive?.length > 0 && (
              <><div className="font-mono text-[9px] text-[#00d4a8] mb-1">VIRTUDES</div>
              <div className="flex flex-wrap gap-1 mb-3">{(char.personality.positive || []).map((t: string) => <span key={t} className="px-2 py-0.5 rounded-full bg-[#00d4a8]/10 border border-[#00d4a8]/20 font-mono text-[9px] text-[#00d4a8]">{t}</span>)}</div></>
            )}
            {char.personality?.negative?.length > 0 && (
              <><div className="font-mono text-[9px] text-[#ff4444] mb-1">DEFECTOS</div>
              <div className="flex flex-wrap gap-1">{(char.personality.negative || []).map((t: string) => <span key={t} className="px-2 py-0.5 rounded-full bg-[#ff4444]/10 border border-[#ff4444]/20 font-mono text-[9px] text-[#ff4444]">{t}</span>)}</div></>
            )}
          </PanelSection>
          <PanelSection title="MIEDOS">
            {fears.length > 0 ? (
              <div className="space-y-1">{fears.map((f: string, i: number) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-[#141820] border border-[#ff4444]/15">
                  <div className="w-1 h-1 rounded-full bg-[#ff4444] flex-shrink-0" />
                  <div className="font-serif text-xs text-[#5a6478]">{f}</div>
                </div>
              ))}</div>
            ) : (
              <p className="font-serif italic text-[#5a6478] text-xs">{age < 2 ? 'Infante — los miedos emergen con la experiencia.' : 'Sin miedos registrados.'}</p>
            )}
          </PanelSection>
          {(run?.traumas || []).length > 0 && (
            <PanelSection title="TRAUMAS">
              <div className="space-y-2">
                {(run.traumas as any[]).map((t: any, i: number) => (
                  <div key={i} className="p-2.5 rounded-lg border border-[#8b0000]/30 bg-[#8b0000]/10">
                    <p className="font-serif text-xs text-[#ff4444]/80 leading-relaxed">{t.description}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="font-mono text-[9px] text-[#5a6478]">{t.acquiredAt}</span>
                      {t.resolved && <span className="font-mono text-[9px] text-[#00d4a8]">SUPERADO</span>}
                    </div>
                  </div>
                ))}
              </div>
            </PanelSection>
          )}
          <PanelSection title="DESEOS PROFUNDOS">
            {desires.length > 0 ? (
              <div className="space-y-1">{desires.map((d: string, i: number) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-[#141820] border border-[#00d4a8]/15">
                  <div className="w-1 h-1 rounded-full bg-[#00d4a8] flex-shrink-0" />
                  <div className="font-serif text-xs text-[#c8d0dc]">{d}</div>
                </div>
              ))}</div>
            ) : (
              <p className="font-serif italic text-[#5a6478] text-xs">{age < 3 ? 'Los deseos emergen con la consciencia.' : 'Sin deseos registrados.'}</p>
            )}
          </PanelSection>
          {run?.innerVoiceLog?.length > 0 && (
            <PanelSection title="VOZ INTERIOR RECIENTE">
              <div className="space-y-1">
                {(run.innerVoiceLog as string[]).slice(-5).map((v: string, i: number) => (
                  <div key={i} className="font-serif text-xs text-[#5a6478] italic border-l border-[#5a6478]/30 pl-2">"{v}"</div>
                ))}
              </div>
            </PanelSection>
          )}
        </div>
      )}

      {tab === 9 && (
        <div className="space-y-3">
          <PanelSection title="CONSECUENCIAS PENDIENTES">
            {(run?.consequenceQueue || []).length === 0 ? (
              <p className="font-serif italic text-[#5a6478] text-xs">Sin consecuencias pendientes.</p>
            ) : (
              (run.consequenceQueue as any[]).map((c: any, i: number) => {
                const statusLabel = c.resolved ? 'Resuelta' : c.scheduledTurn === 0 ? 'Este turno' : c.scheduledTurn > 0 ? `En ${c.scheduledTurn} turno${c.scheduledTurn !== 1 ? 's' : ''}` : 'Pendiente';
                const statusColor = c.resolved ? '#00d4a8' : c.scheduledTurn === 0 ? '#ff4444' : '#f5a623';
                return (
                  <div key={i} className="p-3 rounded-lg border border-[#f5a623]/20 bg-[#f5a623]/5">
                    <p className="font-serif text-xs text-[#c8d0dc]">{c.description}</p>
                    <div className="font-mono text-[10px] mt-1" style={{ color: statusColor }}>{statusLabel}</div>
                  </div>
                );
              })
            )}
          </PanelSection>
          <PanelSection title="MOMENTOS DEFINITORIOS">
            {(run?.moments || []).length === 0 ? (
              <p className="font-serif italic text-[#5a6478] text-xs">Los momentos de alto impacto serán registrados aquí.</p>
            ) : (
              (run.moments as any[]).map((m: any, i: number) => (
                <div key={i} className="p-3 rounded-lg border border-[#1e2530] bg-[#141820]">
                  {m.imageUrl && <img src={m.imageUrl} alt="Momento" className="w-full h-auto rounded mb-2" />}
                  <div className="font-mono text-[10px] text-[#3d8eff]">{m.date}</div>
                  <p className="font-serif text-xs text-[#c8d0dc] mt-1">{m.context}</p>
                </div>
              ))
            )}
          </PanelSection>
        </div>
      )}

      {tab === 10 && (
        <CustomSectionsPanel run={run} />
      )}

      {tab !== 10 && (
        <CustomSectionsPanel run={run} panelScope="character" compact />
      )}
    </div>
  );
}

// ─── CUSTOM SECTIONS PANEL ────────────────────────────────────────────────────

function migrateFieldValue(value: string, fromType: string, toType: string): string {
  if (fromType === toType) return value;
  const v = String(value || '');
  if (toType === 'list') {
    if (fromType === 'tags') return v.split(',').map(t => t.trim()).filter(Boolean).join('\n');
    return v;
  }
  if (toType === 'tags') {
    if (fromType === 'list') return v.split('\n').map(t => t.replace(/^[-•·–]\s*/, '').trim()).filter(Boolean).join(', ');
    return v.split(/[,\n]/).map(t => t.trim()).filter(Boolean).join(', ');
  }
  if (toType === 'number') { const n = parseFloat(v); return isNaN(n) ? '0' : String(n); }
  if (toType === 'progress') { const n = parseFloat(v); return isNaN(n) ? '0' : String(Math.max(0, Math.min(100, n))); }
  if (toType === 'state') return v.length < 30 && !v.includes('\n') ? v : '';
  if (toType === 'header' || toType === 'columns') return '';
  return v;
}

const SCOPE_LABEL: Record<string, string> = {
  global: 'Todas', character: 'Personaje', world: 'Mundo',
  map: 'Mapa', npcs: 'NPCs', facciones: 'Facciones', narrative: 'Narración',
};

function CustomSectionsPanel({ run, panelScope = 'global', compact = false }: { run: any; panelScope?: string; compact?: boolean }) {
  const { updateActiveRun, settings, recordUsage, sectionTemplates, saveSectionTemplate, deleteSectionTemplate } = useEngineStore();
  const aiProvider = ((run?.aiProvider || settings?.aiProvider || 'gemini') as 'gemini' | 'anthropic');
  const customSections: any[] = run?.customSections || [];
  const visibleSections = panelScope === 'global'
    ? customSections
    : customSections.filter((s: any) => !s.scope || s.scope === 'global' || s.scope === panelScope);

  // section creation
  const [showAddSection, setShowAddSection] = useState(false);
  const [addMode, setAddMode] = useState<'manual' | 'ai' | 'template'>('manual');
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [newSectionScope, setNewSectionScope] = useState(panelScope === 'global' ? 'global' : panelScope);
  const [newSectionIcon, setNewSectionIcon] = useState('');
  const [aiSectionDesc, setAiSectionDesc] = useState('');
  const [isGeneratingSection, setIsGeneratingSection] = useState(false);
  const [sectionGenError, setSectionGenError] = useState<string | null>(null);

  // section editing
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editSectionTitle, setEditSectionTitle] = useState('');
  const [editSectionScope, setEditSectionScope] = useState('');
  const [editSectionIcon, setEditSectionIcon] = useState('');

  // field creation
  const [addingFieldTo, setAddingFieldTo] = useState<string | null>(null);
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldValue, setNewFieldValue] = useState('');
  const [newFieldType, setNewFieldType] = useState<string>('text');
  const [newFieldAIManaged, setNewFieldAIManaged] = useState(true);
  const [showFieldAI, setShowFieldAI] = useState(false);
  const [aiFieldDesc, setAiFieldDesc] = useState('');
  const [isGeneratingField, setIsGeneratingField] = useState(false);
  const [fieldGenError, setFieldGenError] = useState<string | null>(null);

  // field editing
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editFieldKey, setEditFieldKey] = useState('');
  const [editFieldType, setEditFieldType] = useState('');
  const [editFieldAIManaged, setEditFieldAIManaged] = useState(true);

  const patchSections = (updater: (secs: any[]) => any[]) => {
    updateActiveRun({ customSections: updater(customSections) } as any);
  };

  const runContext = {
    characterName: run?.character?.name,
    age: run?.character?.age,
    eraLabel: run?.eraConfig?.eraLabel || run?.eraConfig?.eraName,
    location: run?.worldState?.currentLocation?.name,
  };

  // ── section ops ────────────────────────────────────────────────────────────
  const createSection = (data?: any) => {
    const title = (data?.title || newSectionTitle || '').trim();
    if (!title) return;
    patchSections(secs => [...secs, {
      id: 'cs-' + Date.now(),
      title,
      scope: data?.scope || newSectionScope,
      icon: (data?.icon || newSectionIcon || '').trim(),
      fields: data?.fields || [],
    }]);
    setNewSectionTitle(''); setNewSectionIcon(''); setAiSectionDesc('');
    setShowAddSection(false); setSectionGenError(null);
  };

  const removeSection = (id: string) => patchSections(secs => secs.filter((s: any) => s.id !== id));

  const startEditSection = (s: any) => {
    setEditingSectionId(s.id);
    setEditSectionTitle(s.title);
    setEditSectionScope(s.scope || 'global');
    setEditSectionIcon(s.icon || '');
  };

  const saveEditSection = (id: string) => {
    patchSections(secs => secs.map((s: any) =>
      s.id === id ? { ...s, title: editSectionTitle.trim() || s.title, scope: editSectionScope, icon: editSectionIcon.trim() } : s
    ));
    setEditingSectionId(null);
  };

  // ── field ops ──────────────────────────────────────────────────────────────
  const addField = (sectionId: string, data?: any) => {
    const key = (data?.key || newFieldKey || '').trim();
    if (!key) return;
    patchSections(secs => secs.map((s: any) =>
      s.id === sectionId
        ? { ...s, fields: [...s.fields, { key, value: (data?.value || newFieldValue || '').trim(), type: data?.type || newFieldType, aiManaged: data?.aiManaged ?? newFieldAIManaged }] }
        : s
    ));
    setNewFieldKey(''); setNewFieldValue(''); setNewFieldType('text'); setNewFieldAIManaged(true);
    setAiFieldDesc(''); setAddingFieldTo(null); setShowFieldAI(false); setFieldGenError(null);
  };

  const removeField = (sectionId: string, fieldKey: string) => {
    patchSections(secs => secs.map((s: any) =>
      s.id === sectionId ? { ...s, fields: s.fields.filter((f: any) => f.key !== fieldKey) } : s
    ));
  };

  const moveField = (sectionId: string, fieldKey: string, dir: -1 | 1) => {
    patchSections(secs => secs.map((s: any) => {
      if (s.id !== sectionId) return s;
      const fields = [...s.fields];
      const idx = fields.findIndex((f: any) => f.key === fieldKey);
      const next = idx + dir;
      if (next < 0 || next >= fields.length) return s;
      [fields[idx], fields[next]] = [fields[next], fields[idx]];
      return { ...s, fields };
    }));
  };

  const startEditField = (sectionId: string, field: any) => {
    setEditingFieldId(`${sectionId}.${field.key}`);
    setEditFieldKey(field.key);
    setEditFieldType(field.type || 'text');
    setEditFieldAIManaged(field.aiManaged !== false);
  };

  const saveEditField = (sectionId: string, originalKey: string, originalType: string) => {
    patchSections(secs => secs.map((s: any) => {
      if (s.id !== sectionId) return s;
      return {
        ...s,
        fields: s.fields.map((f: any) => {
          if (f.key !== originalKey) return f;
          const newVal = editFieldType !== originalType ? migrateFieldValue(f.value, originalType, editFieldType) : f.value;
          return { ...f, key: editFieldKey.trim() || f.key, type: editFieldType, aiManaged: editFieldAIManaged, value: newVal };
        }),
      };
    }));
    setEditingFieldId(null);
  };

  // ── AI ops ─────────────────────────────────────────────────────────────────
  const generateSection = async () => {
    if (!aiSectionDesc.trim()) return;
    setIsGeneratingSection(true); setSectionGenError(null);
    try {
      const result = await suggestSection({ description: aiSectionDesc, mode: 'section', context: runContext, aiProvider });
      if (result.tokenUsage) recordUsage(aiProvider, result.tokenUsage);
      createSection(result);
    } catch (err: any) {
      const msg = String(err?.message || '');
      setSectionGenError(msg.startsWith('BUDGET_EXCEEDED:') ? 'Límite de créditos alcanzado.' : 'Error al generar. Inténtalo de nuevo.');
    } finally { setIsGeneratingSection(false); }
  };

  const generateField = async (sectionId: string) => {
    if (!aiFieldDesc.trim()) return;
    setIsGeneratingField(true); setFieldGenError(null);
    try {
      const section = customSections.find((s: any) => s.id === sectionId);
      const result = await suggestSection({
        description: aiFieldDesc,
        mode: 'field',
        sectionTitle: section?.title,
        context: { ...runContext, existingFields: (section?.fields || []).map((f: any) => f.key).join(', ') },
        aiProvider,
      });
      if (result.tokenUsage) recordUsage(aiProvider, result.tokenUsage);
      if (result.key) {
        setNewFieldKey(result.key);
        setNewFieldValue(String(result.value || ''));
        setNewFieldType(result.type || 'text');
        setAiFieldDesc(''); setShowFieldAI(false);
      }
    } catch (err: any) {
      const msg = String(err?.message || '');
      setFieldGenError(msg.startsWith('BUDGET_EXCEEDED:') ? 'Límite de créditos alcanzado.' : 'Error al generar campo.');
    } finally { setIsGeneratingField(false); }
  };

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className={compact ? 'space-y-3 mt-5 pt-4 border-t border-[#1e2530]' : 'space-y-4'}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="font-mono text-[9px] text-[#5a6478]/70">
          {compact ? 'Secciones de este panel.' : 'Secciones personalizadas — la IA las integra en la narrativa.'}
        </p>
        <button onClick={() => { setShowAddSection(v => !v); setAddMode('manual'); setSectionGenError(null); }}
          className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[#3d8eff]/30 font-mono text-[9px] text-[#3d8eff] hover:bg-[#3d8eff]/10 transition-all">
          <Plus size={10} /> Nueva sección
        </button>
      </div>

      {/* ── ADD SECTION PANEL ── */}
      {showAddSection && (
        <div className="rounded-xl bg-[#0f1218] border border-[#3d8eff]/30 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#1e2530] bg-[#141820]">
            <div className="font-mono text-[10px] text-[#3d8eff] tracking-wider">NUEVA SECCIÓN</div>
            <div className="flex gap-1">
              <button onClick={() => setAddMode('manual')}
                className={`px-2 py-0.5 rounded font-mono text-[8px] border transition-all ${addMode === 'manual' ? 'bg-[#3d8eff]/15 text-[#3d8eff] border-[#3d8eff]/40' : 'text-[#5a6478] border-[#1e2530] hover:text-[#3d8eff]'}`}>
                ✍️ Manual
              </button>
              <button onClick={() => setAddMode('ai')}
                className={`px-2 py-0.5 rounded font-mono text-[8px] border transition-all ${addMode === 'ai' ? 'bg-[#f5a623]/15 text-[#f5a623] border-[#f5a623]/40' : 'text-[#5a6478] border-[#1e2530] hover:text-[#f5a623]'}`}>
                ✨ Con IA
              </button>
              <button onClick={() => setAddMode('template')}
                className={`px-2 py-0.5 rounded font-mono text-[8px] border transition-all ${addMode === 'template' ? 'bg-[#00d4a8]/15 text-[#00d4a8] border-[#00d4a8]/40' : 'text-[#5a6478] border-[#1e2530] hover:text-[#00d4a8]'}`}>
                📋 {(sectionTemplates || []).length > 0 ? `${(sectionTemplates || []).length}` : ''}Plantillas
              </button>
            </div>
          </div>
          <div className="p-3 space-y-2">
            {addMode === 'ai' ? (
              <>
                <textarea value={aiSectionDesc} onChange={(e) => { setAiSectionDesc(e.target.value); setSectionGenError(null); }}
                  placeholder="Describe qué quieres rastrear. Ej: 'Misiones activas con estado y recompensa', 'Sistema de magia con tipos de hechizos', 'Diario personal del personaje'..."
                  rows={3}
                  className="w-full bg-[#0a0c0f] border border-[#1e2530] rounded-lg px-2 py-1.5 font-serif text-xs text-[#eef2f8] placeholder-[#5a6478] outline-none focus:border-[#f5a623]/40 resize-none" />
                {sectionGenError && (
                  <div className="flex items-center gap-1.5 p-2 rounded bg-[#ff4444]/10 border border-[#ff4444]/20">
                    <AlertTriangle size={10} className="text-[#ff4444] flex-shrink-0" />
                    <span className="font-mono text-[8px] text-[#ff4444]">{sectionGenError}</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={generateSection} disabled={!aiSectionDesc.trim() || isGeneratingSection}
                    className="flex-1 py-1.5 rounded-lg bg-[#f5a623] text-[#0a0c0f] font-mono text-[9px] hover:opacity-80 transition-all disabled:opacity-30 flex items-center justify-center gap-1">
                    {isGeneratingSection ? <><RefreshCw size={10} className="animate-spin" /> Generando...</> : <><Sparkles size={10} /> Generar sección completa</>}
                  </button>
                  <button onClick={() => setShowAddSection(false)} className="px-3 py-1.5 rounded-lg border border-[#1e2530] font-mono text-[9px] text-[#5a6478]">✕</button>
                </div>
              </>
            ) : addMode === 'template' ? (
              /* Template picker */
              <div className="space-y-2">
                {(sectionTemplates || []).length === 0 ? (
                  <div className="py-6 text-center">
                    <div className="text-2xl mb-2">📋</div>
                    <p className="font-serif italic text-[#5a6478] text-xs">Sin plantillas guardadas aún.</p>
                    <p className="font-mono text-[9px] text-[#5a6478]/50 mt-1">
                      Usa el icono <span className="text-[#00d4a8]">📖</span> en cualquier sección para guardarla como plantilla reutilizable.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                    {(sectionTemplates || []).map((tpl) => (
                      <div key={tpl.id} className="flex items-center gap-2 p-2 rounded-lg bg-[#0a0c0f] border border-[#1e2530] hover:border-[#00d4a8]/30 transition-all">
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-[10px] text-[#eef2f8]">{tpl.icon ? `${tpl.icon} ` : ''}{tpl.title}</div>
                          <div className="font-mono text-[8px] text-[#5a6478]/60">{SCOPE_LABEL[tpl.scope] || 'Todas'} · {tpl.fields.length} campo{tpl.fields.length !== 1 ? 's' : ''}</div>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button
                            onClick={() => {
                              createSection({
                                title: tpl.title,
                                icon: tpl.icon,
                                scope: tpl.scope,
                                fields: tpl.fields.map((f) => ({ ...f, value: '' })),
                              });
                            }}
                            className="px-2 py-0.5 rounded bg-[#00d4a8]/10 border border-[#00d4a8]/30 font-mono text-[8px] text-[#00d4a8] hover:bg-[#00d4a8]/20 transition-all">
                            Usar
                          </button>
                          <button onClick={() => deleteSectionTemplate(tpl.id)}
                            className="p-0.5 rounded border border-[#ff4444]/20 text-[#ff4444]/40 hover:text-[#ff4444] hover:bg-[#ff4444]/10 transition-all">
                            <X size={9} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={() => setShowAddSection(false)} className="w-full py-1 rounded-lg border border-[#1e2530] font-mono text-[9px] text-[#5a6478]">Cancelar</button>
              </div>
            ) : (
              <>
                <input value={newSectionTitle} onChange={(e) => setNewSectionTitle(e.target.value)}
                  placeholder="Nombre de la sección (ej: Misiones, Hechizos, Diario...)"
                  className="w-full bg-[#0a0c0f] border border-[#1e2530] rounded-lg px-2 py-1.5 font-serif text-xs text-[#eef2f8] placeholder-[#5a6478] outline-none focus:border-[#3d8eff]/40"
                  onKeyDown={(e) => e.key === 'Enter' && createSection()} />
                <div className="grid grid-cols-2 gap-2">
                  <select value={newSectionScope} onChange={(e) => setNewSectionScope(e.target.value)}
                    className="bg-[#0a0c0f] border border-[#1e2530] rounded-lg px-2 py-1.5 font-mono text-[9px] text-[#5a6478] outline-none">
                    {CUSTOM_SECTION_SCOPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                  <input value={newSectionIcon} onChange={(e) => setNewSectionIcon(e.target.value)}
                    placeholder="Emoji (opcional)"
                    className="bg-[#0a0c0f] border border-[#1e2530] rounded-lg px-2 py-1.5 font-mono text-[10px] text-[#eef2f8] placeholder-[#5a6478] outline-none" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => createSection()} disabled={!newSectionTitle.trim()}
                    className="flex-1 py-1.5 rounded-lg bg-[#3d8eff]/15 border border-[#3d8eff]/30 font-mono text-[9px] text-[#3d8eff] disabled:opacity-30">Crear</button>
                  <button onClick={() => setShowAddSection(false)} className="flex-1 py-1.5 rounded-lg border border-[#1e2530] font-mono text-[9px] text-[#5a6478]">Cancelar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── EMPTY STATE ── */}
      {visibleSections.length === 0 && !showAddSection && (
        <div className="py-8 text-center">
          <div className="text-3xl mb-3">📋</div>
          <p className="font-serif italic text-[#5a6478] text-xs">Sin secciones personalizadas.</p>
          <p className="font-mono text-[9px] text-[#5a6478]/50 mt-1">
            Usa <span className="text-[#f5a623]">✨ Con IA</span> para generar una sección automáticamente,<br />o créala manualmente campo a campo.
          </p>
        </div>
      )}

      {/* ── SECTION CARDS ── */}
      {visibleSections.map((section: any) => {
        const isEditingSection = editingSectionId === section.id;
        const isAddingField = addingFieldTo === section.id;

        return (
          <div key={section.id} className="rounded-xl bg-[#0f1218] border border-[#1e2530] overflow-hidden">

            {/* Section header — view mode */}
            {!isEditingSection ? (
              <div className="flex items-center justify-between px-3 py-2 bg-[#141820] border-b border-[#1e2530]">
                <div>
                  <div className="font-mono text-[10px] text-[#f5a623] tracking-widest">
                    {section.icon ? `${section.icon} ` : ''}{section.title.toUpperCase()}
                  </div>
                  <div className="font-mono text-[8px] text-[#5a6478]/60">
                    {(SCOPE_LABEL[section.scope || 'global'] || 'Todas').toUpperCase()} · {section.fields.length} campo{section.fields.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setAddingFieldTo(isAddingField ? null : section.id); setNewFieldKey(''); setNewFieldValue(''); setShowFieldAI(false); setFieldGenError(null); }}
                    className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-[#3d8eff]/20 font-mono text-[8px] text-[#3d8eff] hover:bg-[#3d8eff]/10 transition-all">
                    <Plus size={8} /> Campo
                  </button>
                  <button onClick={() => saveSectionTemplate(section)} title="Guardar como plantilla reutilizable"
                    className="p-2 rounded border border-[#00d4a8]/20 text-[#00d4a8]/40 hover:text-[#00d4a8] hover:bg-[#00d4a8]/10 transition-all touch-manipulation">
                    <BookMarked size={12} />
                  </button>
                  <button onClick={() => startEditSection(section)} title="Editar sección"
                    className="p-2 rounded border border-[#f5a623]/20 text-[#f5a623]/40 hover:text-[#f5a623] hover:bg-[#f5a623]/10 transition-all touch-manipulation">
                    <Wrench size={12} />
                  </button>
                  <button onClick={() => removeSection(section.id)} title="Eliminar sección"
                    className="p-2 rounded border border-[#ff4444]/20 text-[#ff4444]/30 hover:text-[#ff4444] hover:bg-[#ff4444]/10 transition-all touch-manipulation">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ) : (
              /* Section header — edit mode */
              <div className="p-3 space-y-2 bg-[#141820] border-b border-[#1e2530]">
                <div className="font-mono text-[9px] text-[#f5a623] tracking-wider">EDITAR SECCIÓN</div>
                <input value={editSectionTitle} onChange={(e) => setEditSectionTitle(e.target.value)}
                  placeholder="Nombre de la sección"
                  className="w-full bg-[#0a0c0f] border border-[#f5a623]/30 rounded px-2 py-1 font-serif text-xs text-[#eef2f8] outline-none focus:border-[#f5a623]/60" />
                <div className="grid grid-cols-2 gap-2">
                  <select value={editSectionScope} onChange={(e) => setEditSectionScope(e.target.value)}
                    className="bg-[#0a0c0f] border border-[#1e2530] rounded px-2 py-1 font-mono text-[9px] text-[#5a6478] outline-none">
                    {CUSTOM_SECTION_SCOPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                  <input value={editSectionIcon} onChange={(e) => setEditSectionIcon(e.target.value)}
                    placeholder="Emoji"
                    className="bg-[#0a0c0f] border border-[#1e2530] rounded px-2 py-1 font-mono text-[10px] text-[#eef2f8] outline-none" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => saveEditSection(section.id)}
                    className="flex-1 py-1 rounded bg-[#f5a623] text-[#0a0c0f] font-mono text-[9px] hover:opacity-80">✓ Guardar</button>
                  <button onClick={() => setEditingSectionId(null)}
                    className="flex-1 py-1 rounded border border-[#1e2530] font-mono text-[9px] text-[#5a6478]">Cancelar</button>
                </div>
              </div>
            )}

            {/* Fields */}
            <div className="p-3 space-y-1.5">
              {section.fields.length === 0 && !isAddingField && (
                <p className="font-serif italic text-[#5a6478]/60 text-[10px] text-center py-2">
                  Sin campos. Añade campos manualmente o usa ✨ para sugerir con IA.
                </p>
              )}

              {section.fields.map((field: any, fi: number) => {
                const fieldEditId = `${section.id}.${field.key}`;
                const isEditingField = editingFieldId === fieldEditId;

                if (isEditingField) {
                  return (
                    <div key={field.key} className="p-2 rounded-lg border border-[#f5a623]/30 bg-[#141820] space-y-1.5">
                      <div className="font-mono text-[8px] text-[#f5a623] tracking-wider">EDITAR CAMPO</div>
                      <input value={editFieldKey} onChange={(e) => setEditFieldKey(e.target.value)}
                        placeholder="Nombre del campo"
                        className="w-full bg-[#0a0c0f] border border-[#1e2530] rounded px-2 py-1 font-mono text-[9px] text-[#eef2f8] outline-none focus:border-[#f5a623]/40" />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="font-mono text-[8px] text-[#5a6478] mb-0.5">TIPO</div>
                          <select value={editFieldType} onChange={(e) => setEditFieldType(e.target.value)}
                            className="w-full bg-[#0a0c0f] border border-[#1e2530] rounded px-2 py-1 font-mono text-[9px] text-[#5a6478] outline-none">
                            {CUSTOM_FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <label className="flex items-center gap-1.5 px-2 rounded border border-[#1e2530] bg-[#0a0c0f] font-mono text-[8px] text-[#5a6478] cursor-pointer">
                          <input type="checkbox" checked={editFieldAIManaged} onChange={(e) => setEditFieldAIManaged(e.target.checked)} className="accent-[#f5a623] w-3 h-3" />
                          Gestionado IA
                        </label>
                      </div>
                      {editFieldType !== (field.type || 'text') && (
                        <div className="font-mono text-[8px] text-[#f5a623]/70 bg-[#f5a623]/5 border border-[#f5a623]/15 rounded px-2 py-1">
                          ⚠️ El valor se migrará automáticamente al nuevo formato.
                        </div>
                      )}
                      <div className="flex gap-1.5">
                        <button onClick={() => saveEditField(section.id, field.key, field.type || 'text')}
                          className="flex-1 py-0.5 rounded bg-[#f5a623] text-[#0a0c0f] font-mono text-[8px] hover:opacity-80">✓ Guardar</button>
                        <button onClick={() => setEditingFieldId(null)}
                          className="flex-1 py-0.5 rounded border border-[#1e2530] font-mono text-[8px] text-[#5a6478]">Cancelar</button>
                      </div>
                    </div>
                  );
                }

                /* field.type === 'header' is non-editable via EditableField */
                if (field.type === 'header') {
                  return (
                    <div key={field.key} className="flex items-center gap-1">
                      <FieldRenderer field={field} />
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => startEditField(section.id, field)} title="Editar"
                          className="p-2 rounded bg-[#141820] border border-[#1e2530] text-[#5a6478] hover:text-[#f5a623] transition-colors touch-manipulation"><Wrench size={10} /></button>
                        <button onClick={() => removeField(section.id, field.key)} title="Eliminar"
                          className="p-2 rounded bg-[#141820] border border-[#1e2530] text-[#5a6478] hover:text-[#ff4444] transition-colors touch-manipulation"><X size={10} /></button>
                      </div>
                    </div>
                  );
                }

                return (
                  <EditableField key={field.key}
                    path={`customSection.${section.id}.${field.key}`}
                    label={field.key}
                    value={String(field.value ?? '')}
                    fieldType={field.type || 'text'}>
                    <div className="flex items-start gap-1">
                      <div className="flex-1 min-w-0">
                        <FieldRenderer field={field} />
                      </div>
                      <div className="flex flex-col gap-1 flex-shrink-0 mt-0.5">
                        <button onClick={() => moveField(section.id, field.key, -1)} title="Subir" disabled={fi === 0}
                          className="p-2 rounded bg-[#141820] border border-[#1e2530] text-[#5a6478] hover:text-[#3d8eff] disabled:opacity-20 transition-colors touch-manipulation"><ChevronUp size={10} /></button>
                        <button onClick={() => moveField(section.id, field.key, 1)} title="Bajar" disabled={fi >= section.fields.length - 1}
                          className="p-2 rounded bg-[#141820] border border-[#1e2530] text-[#5a6478] hover:text-[#3d8eff] disabled:opacity-20 transition-colors touch-manipulation"><ChevronDown size={10} /></button>
                        <button onClick={() => startEditField(section.id, field)} title="Editar tipo/nombre"
                          className="p-2 rounded bg-[#141820] border border-[#1e2530] text-[#5a6478] hover:text-[#f5a623] transition-colors touch-manipulation"><Wrench size={10} /></button>
                        <button onClick={() => removeField(section.id, field.key)} title="Eliminar"
                          className="p-2 rounded bg-[#141820] border border-[#1e2530] text-[#5a6478] hover:text-[#ff4444] transition-colors touch-manipulation"><X size={10} /></button>
                      </div>
                    </div>
                  </EditableField>
                );
              })}

              {/* ── ADD FIELD PANEL ── */}
              {isAddingField && (
                <div className="mt-1 pt-2 border-t border-[#1e2530] space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-mono text-[8px] text-[#5a6478] tracking-wider">NUEVO CAMPO</div>
                    <button
                      onClick={() => { setShowFieldAI(v => !v); setFieldGenError(null); }}
                      className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded border font-mono text-[8px] transition-all ${showFieldAI ? 'border-[#f5a623]/40 bg-[#f5a623]/10 text-[#f5a623]' : 'border-[#5a6478]/20 text-[#5a6478] hover:text-[#f5a623] hover:border-[#f5a623]/30'}`}>
                      <Sparkles size={8} /> Sugerir con IA
                    </button>
                  </div>

                  {/* AI field suggestion */}
                  {showFieldAI && (
                    <div className="p-2 rounded-lg bg-[#141820] border border-[#f5a623]/20 space-y-1.5">
                      <textarea value={aiFieldDesc}
                        onChange={(e) => { setAiFieldDesc(e.target.value); setFieldGenError(null); }}
                        placeholder={`Describe qué quieres rastrear en "${section.title}"...\nEj: "El estado actual de la misión", "Lista de aliados conocidos", "Puntos de experiencia"`}
                        rows={2}
                        className="w-full bg-[#0a0c0f] border border-[#1e2530] rounded px-2 py-1.5 font-serif text-xs text-[#eef2f8] placeholder-[#5a6478] outline-none focus:border-[#f5a623]/40 resize-none" />
                      {fieldGenError && (
                        <div className="flex items-center gap-1 text-[#ff4444] font-mono text-[8px]">
                          <AlertTriangle size={8} className="flex-shrink-0" /> {fieldGenError}
                        </div>
                      )}
                      <button onClick={() => generateField(section.id)} disabled={!aiFieldDesc.trim() || isGeneratingField}
                        className="w-full py-1 rounded bg-[#f5a623]/80 text-[#0a0c0f] font-mono text-[8px] hover:opacity-80 transition-all disabled:opacity-30 flex items-center justify-center gap-1">
                        {isGeneratingField ? <><RefreshCw size={8} className="animate-spin" /> Generando...</> : <><Sparkles size={8} /> Generar campo</>}
                      </button>
                    </div>
                  )}

                  {/* Manual field form */}
                  <input value={newFieldKey} onChange={(e) => setNewFieldKey(e.target.value)}
                    placeholder="Nombre del campo (ej: Estado, Objetivo, Recompensa...)"
                    className="w-full bg-[#0a0c0f] border border-[#1e2530] rounded-lg px-2 py-1.5 font-mono text-[9px] text-[#eef2f8] placeholder-[#5a6478] outline-none focus:border-[#f5a623]/40" />
                  {newFieldType !== 'header' && (
                    <textarea value={newFieldValue} onChange={(e) => setNewFieldValue(e.target.value)}
                      placeholder={
                        newFieldType === 'list' ? '• Item 1\n• Item 2\n• Item 3' :
                        newFieldType === 'tags' ? 'etiqueta1, etiqueta2, etiqueta3' :
                        newFieldType === 'table' ? 'Clave 1: Valor 1\nClave 2: Valor 2' :
                        newFieldType === 'columns' ? 'Columna izquierda || Columna derecha' :
                        newFieldType === 'progress' ? '0' :
                        'Valor inicial (opcional)'}
                      rows={newFieldType === 'list' || newFieldType === 'table' ? 3 : 2}
                      className="w-full bg-[#0a0c0f] border border-[#1e2530] rounded-lg px-2 py-1.5 font-serif text-xs text-[#eef2f8] placeholder-[#5a6478] outline-none focus:border-[#f5a623]/40 resize-none" />
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <select value={newFieldType} onChange={(e) => { setNewFieldType(e.target.value); setNewFieldValue(''); }}
                      className="bg-[#0a0c0f] border border-[#1e2530] rounded-lg px-2 py-1.5 font-mono text-[9px] text-[#5a6478] outline-none">
                      {CUSTOM_FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <label className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-[#1e2530] bg-[#0a0c0f] font-mono text-[9px] text-[#5a6478] cursor-pointer">
                      <input type="checkbox" checked={newFieldAIManaged} onChange={(e) => setNewFieldAIManaged(e.target.checked)} className="accent-[#f5a623] w-3 h-3" />
                      Gestionado IA
                    </label>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => addField(section.id)} disabled={!newFieldKey.trim()}
                      className="flex-1 py-1 rounded-lg bg-[#f5a623] text-[#0a0c0f] font-mono text-[9px] hover:opacity-80 transition-all disabled:opacity-30">Añadir campo</button>
                    <button onClick={() => { setAddingFieldTo(null); setShowFieldAI(false); }}
                      className="flex-1 py-1 rounded-lg border border-[#1e2530] font-mono text-[9px] text-[#5a6478]">Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── WORLD PANEL ─────────────────────────────────────────────────────────────

function WorldPanel({ run }: { run: any }) {
  const world = run?.worldState || {};
  const era = run?.eraConfig || {};
  const loc = world.currentLocation || {};
  const explored = run?.exploredLocations || [];
  const [tab, setTab] = useState(0);
  const TABS = ['Tiempo', 'Localización', 'Política', 'Religión', 'Economía', 'Eventos', 'Historia', 'Geografía', 'Fauna'];

  return (
    <div>
      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {tab === 0 && (
        <div className="space-y-3">
          <div className="p-3 rounded-xl bg-[#0f1218] border border-[#1e2530] space-y-2">
            <InfoRow label="Año" value={world.ingameYear ? `${world.ingameYear}` : undefined} />
            <InfoRow label="Era" value={era.eraLabel} />
            <InfoRow label="Estación" value={world.season} />
            <InfoRow label="Clima" value={world.weather} />
            <InfoRow label="Hora del día" value={world.timeOfDay} />
            <InfoRow label="Temperatura" value={world.temperature} />
            <InfoRow label="Fase lunar" value={world.moonPhase} />
            <InfoRow label="Día de la semana" value={world.dayOfWeek} />
          </div>
          {era.yearRange && <InfoRow label="Período histórico" value={`${era.yearRange[0]} – ${era.yearRange[1]}`} />}
        </div>
      )}

      {tab === 1 && (
        <div className="space-y-3">
          {loc.name && (
            <div className="p-3 rounded-xl bg-[#3d8eff08] border border-[#3d8eff]/20">
              <div className="flex items-center gap-2 mb-2">
                <MapPin size={10} className="text-[#3d8eff]" />
                <div className="font-mono text-[10px] text-[#3d8eff] tracking-widest">LOCALIZACIÓN ACTUAL</div>
              </div>
              {(loc.territory || loc.region) && (
                <div className="flex items-center gap-1 mb-1.5 flex-wrap">
                  {loc.territory && <span className="font-mono text-[9px] text-[#5a6478] px-1.5 py-0.5 rounded bg-[#1e2530]">{loc.territory}</span>}
                  {loc.territory && loc.region && <span className="font-mono text-[8px] text-[#5a6478]/40">›</span>}
                  {loc.region && <span className="font-mono text-[9px] text-[#5a6478] px-1.5 py-0.5 rounded bg-[#1e2530]">{loc.region}</span>}
                  <span className="font-mono text-[8px] text-[#5a6478]/40">›</span>
                </div>
              )}
              <div className="font-serif text-sm text-[#eef2f8] mb-1">{loc.name}</div>
              {loc.type && <div className="mb-2 inline-block px-2 py-0.5 rounded-full bg-[#3d8eff10] border border-[#3d8eff]/20 font-mono text-[9px] text-[#3d8eff]/70">{loc.type.toUpperCase()}</div>}
              {loc.description && <p className="font-serif text-xs italic text-[#5a6478] leading-relaxed">{loc.description}</p>}
              {loc.sensoryDescription && <p className="font-serif text-xs text-[#5a6478]/70 mt-2 italic border-l border-[#5a6478]/20 pl-2">{loc.sensoryDescription}</p>}
              {(loc.climate || loc.fauna || loc.geographyDetails) && (
                <div className="mt-2 space-y-1 pt-2 border-t border-[#1e2530]">
                  {loc.climate && <div className="flex justify-between"><span className="font-mono text-[9px] text-[#5a6478]">CLIMA</span><span className="font-serif text-[10px] text-[#c8d0dc]">{loc.climate}</span></div>}
                  {loc.fauna && <div className="flex justify-between gap-3"><span className="font-mono text-[9px] text-[#5a6478] flex-shrink-0">FAUNA</span><span className="font-serif text-[10px] text-[#c8d0dc] text-right">{loc.fauna}</span></div>}
                  {loc.geographyDetails && <div className="flex justify-between gap-3"><span className="font-mono text-[9px] text-[#5a6478] flex-shrink-0">GEOGRAFÍA</span><span className="font-serif text-[10px] text-[#c8d0dc] text-right">{loc.geographyDetails}</span></div>}
                </div>
              )}
            </div>
          )}
          {world.destination && (
            <div className="p-3 rounded-xl bg-[#f5a62308] border border-[#f5a623]/20">
              <div className="font-mono text-[10px] text-[#f5a623] mb-1">DESTINO</div>
              <div className="font-serif text-sm text-[#c8d0dc]">{world.destination}</div>
            </div>
          )}
          {explored.length > 0 && (
            <div>
              <div className="font-mono text-[10px] text-[#5a6478] tracking-widest mb-2">LUGARES EXPLORADOS ({explored.length})</div>
              <div className="space-y-1.5">
                {explored.map((l: any, i: number) => (
                  <div key={i} className="p-2 rounded-lg bg-[#0f1218] border border-[#1e2530]/50">
                    <div className="flex items-center gap-2">
                      <CheckCircle size={9} className="text-[#00d4a8] flex-shrink-0" />
                      <span className="font-serif text-xs text-[#c8d0dc] flex-1">{l.name}</span>
                      {l.visitedAt && <span className="font-mono text-[8px] text-[#5a6478]">{l.visitedAt}</span>}
                    </div>
                    {(l.territory || l.region) && (
                      <div className="flex gap-1 mt-1 ml-5">
                        {l.territory && <span className="font-mono text-[8px] text-[#5a6478]/60">{l.territory}</span>}
                        {l.territory && l.region && <span className="font-mono text-[8px] text-[#5a6478]/30">›</span>}
                        {l.region && <span className="font-mono text-[8px] text-[#5a6478]/60">{l.region}</span>}
                      </div>
                    )}
                    {l.description && <p className="font-serif text-[10px] text-[#5a6478] mt-1 ml-5 italic line-clamp-2">{l.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 2 && (
        <div className="space-y-3">
          {(world.localPolitics || world.localAuthority) && (
            <EditableField path="worldState.localPolitics" label="Política local" value={world.localPolitics || ''}>
              <div className="p-3 rounded-xl bg-[#0f1218] border border-[#3d8eff]/20">
                <div className="flex items-center gap-1.5 mb-2">
                  <MapPin size={9} className="text-[#3d8eff]" />
                  <div className="font-mono text-[10px] text-[#3d8eff] tracking-widest">POLÍTICA LOCAL</div>
                </div>
                {world.localPolitics && <p className="font-serif text-xs text-[#c8d0dc] leading-relaxed mb-1">{world.localPolitics}</p>}
                {world.localAuthority && <div className="font-mono text-[9px] text-[#5a6478]">Autoridad: <span className="text-[#c8d0dc]">{world.localAuthority}</span></div>}
              </div>
            </EditableField>
          )}
          {(world.globalPolitics || world.politicalClimate) && (
            <EditableField path="worldState.globalPolitics" label="Política global" value={world.globalPolitics || world.politicalClimate || ''}>
              <div className="p-3 rounded-xl bg-[#0f1218] border border-[#1e2530]">
                <div className="flex items-center gap-1.5 mb-2">
                  <Globe size={9} className="text-[#5a6478]" />
                  <div className="font-mono text-[10px] text-[#5a6478] tracking-widest">POLÍTICA GLOBAL</div>
                </div>
                <p className="font-serif text-xs text-[#c8d0dc] leading-relaxed">{world.globalPolitics || world.politicalClimate}</p>
              </div>
            </EditableField>
          )}
          {(world.activeConflicts || []).length > 0 && (
            <div className="p-3 rounded-xl bg-[#ff444408] border border-[#ff4444]/20">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={10} className="text-[#ff4444]" />
                <div className="font-mono text-[10px] text-[#ff4444] tracking-widest">CONFLICTOS ACTIVOS</div>
              </div>
              {(world.activeConflicts as string[]).map((c: string, i: number) => (
                <div key={i} className="font-serif text-xs text-[#ff4444]/80 mb-1 pl-1 border-l border-[#ff4444]/30">· {c}</div>
              ))}
            </div>
          )}
          {era.politicalSystem && <InfoRow label="Sistema Político" value={era.politicalSystem} />}
          {!world.localPolitics && !world.globalPolitics && !world.politicalClimate && !era.politicalSystem && <p className="font-serif italic text-[#5a6478] text-xs">Sin datos políticos disponibles aún. Explora para descubrirlos.</p>}
        </div>
      )}

      {tab === 3 && (
        <div className="space-y-3">
          {world.religion || era.religion ? (
            <div className="p-3 rounded-xl bg-[#0f1218] border border-[#1e2530]">
              <div className="flex items-center gap-2 mb-2">
                <Church size={10} className="text-[#f5a623]" />
                <div className="font-mono text-[10px] text-[#f5a623] tracking-widest">RELIGIÓN DOMINANTE</div>
              </div>
              <p className="font-serif text-xs text-[#c8d0dc] leading-relaxed">{world.religion || era.religion}</p>
            </div>
          ) : null}
          {world.religiousInstitutions && (
            <div className="p-3 rounded-xl bg-[#0f1218] border border-[#1e2530]">
              <div className="font-mono text-[10px] text-[#5a6478] mb-1">INSTITUCIONES RELIGIOSAS</div>
              <p className="font-serif text-xs text-[#c8d0dc]">{world.religiousInstitutions}</p>
            </div>
          )}
          {world.religiousFestivals && (
            <div className="p-3 rounded-xl bg-[#0f1218] border border-[#1e2530]">
              <div className="font-mono text-[10px] text-[#5a6478] mb-1">FESTIVIDADES</div>
              <p className="font-serif text-xs text-[#c8d0dc]">{world.religiousFestivals}</p>
            </div>
          )}
          {!world.religion && !era.religion && <p className="font-serif italic text-[#5a6478] text-xs">Sin datos religiosos disponibles. Se registrarán conforme se descubran.</p>}
        </div>
      )}

      {tab === 4 && (
        <div className="space-y-3">
          {run?.currency?.name && (
            <div className="p-3 rounded-xl bg-[#f5a62308] border border-[#f5a623]/15">
              <div className="flex items-center gap-2 mb-1">
                <Banknote size={10} className="text-[#f5a623]" />
                <div className="font-mono text-[10px] text-[#f5a623]">MONEDA</div>
              </div>
              <div className="font-mono text-sm text-[#f5a623]">{run.currency.amount} {run.currency.name}</div>
              {run.currency.context && <p className="font-serif text-xs italic text-[#5a6478] mt-1">{run.currency.context}</p>}
            </div>
          )}
          {world.economy && (
            <div className="p-3 rounded-xl bg-[#0f1218] border border-[#1e2530]">
              <div className="font-mono text-[10px] text-[#5a6478] tracking-widest mb-1">ECONOMÍA LOCAL</div>
              <p className="font-serif text-xs text-[#c8d0dc] leading-relaxed">{world.economy}</p>
            </div>
          )}
          {world.economyDetails && (
            <div className="p-3 rounded-xl bg-[#0f1218] border border-[#1e2530]">
              <div className="font-mono text-[10px] text-[#5a6478] tracking-widest mb-1">DETALLES ECONÓMICOS</div>
              <p className="font-serif text-xs text-[#c8d0dc] leading-relaxed">{world.economyDetails}</p>
            </div>
          )}
          {world.tradeGoods && (
            <div className="p-3 rounded-xl bg-[#0f1218] border border-[#1e2530]">
              <div className="font-mono text-[10px] text-[#5a6478] tracking-widest mb-1">BIENES Y COMERCIO</div>
              <p className="font-serif text-xs text-[#c8d0dc] leading-relaxed">{world.tradeGoods}</p>
            </div>
          )}
          {era.economy && <InfoRow label="Sistema Económico" value={era.economy} />}
          {!world.economy && !world.economyDetails && !era.economy && <p className="font-serif italic text-[#5a6478] text-xs">Sin datos económicos disponibles.</p>}
        </div>
      )}

      {tab === 5 && (
        <div className="space-y-3">
          {(world.activeEvents || []).length > 0 ? (
            (world.activeEvents as string[]).map((ev: string, i: number) => (
              <div key={i} className="p-3 rounded-xl bg-[#0f1218] border border-[#f5a623]/20">
                <p className="font-serif text-xs text-[#c8d0dc] leading-relaxed">· {ev}</p>
              </div>
            ))
          ) : <p className="font-serif italic text-[#5a6478] text-xs">Sin eventos activos registrados.</p>}
        </div>
      )}

      {tab === 6 && (
        <div className="space-y-2">
          {[...(world.worldHistory || []), ...(era.predefinedEvents || [])].length > 0 ? (
            [...(world.worldHistory || []), ...(era.predefinedEvents || [])].map((ev: any, i: number) => (
              <div key={i} className="p-3 rounded-xl bg-[#0f1218] border border-[#1e2530]">
                <div className="font-mono text-[10px] text-[#3d8eff] mb-1">Año {ev.year || '—'}</div>
                <p className="font-serif text-xs text-[#c8d0dc] leading-relaxed">{ev.description || ev.event}</p>
              </div>
            ))
          ) : <p className="font-serif italic text-[#5a6478] text-xs">Sin registros históricos disponibles.</p>}
        </div>
      )}

      {tab === 7 && (
        <div className="space-y-3">
          {world.geography || era.geography ? (
            <div className="p-3 rounded-xl bg-[#0f1218] border border-[#1e2530]">
              <div className="font-mono text-[10px] text-[#5a6478] tracking-widest mb-1">GEOGRAFÍA</div>
              <p className="font-serif text-xs text-[#c8d0dc] leading-relaxed">{world.geography || era.geography}</p>
            </div>
          ) : <p className="font-serif italic text-[#5a6478] text-xs">Sin datos geográficos disponibles.</p>}
          {era.techLevel && <InfoRow label="Nivel Tecnológico" value={era.techLevel} />}
          {era.languages && <InfoRow label="Lenguas" value={era.languages} />}
        </div>
      )}

      {tab === 8 && (
        <div className="space-y-3">
          {world.fauna || era.fauna ? (
            <div className="p-3 rounded-xl bg-[#0f1218] border border-[#1e2530]">
              <div className="font-mono text-[10px] text-[#5a6478] tracking-widest mb-1">FAUNA Y FLORA</div>
              <p className="font-serif text-xs text-[#c8d0dc] leading-relaxed">{world.fauna || era.fauna}</p>
            </div>
          ) : <p className="font-serif italic text-[#5a6478] text-xs">Sin datos de fauna disponibles.</p>}
          {era.specialRules?.uniqueDiseases?.length > 0 && (
            <div>
              <div className="font-mono text-[10px] text-[#ff4444] tracking-widest mb-2">ENFERMEDADES SINGULARES</div>
              {era.specialRules.uniqueDiseases.map((d: any, i: number) => (
                <div key={i} className="p-2 rounded-lg bg-[#ff444408] border border-[#ff4444]/20 mb-2">
                  <div className="font-mono text-xs text-[#ff4444]">{d.name}</div>
                  <p className="font-serif text-[10px] text-[#5a6478] mt-0.5">{d.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <CustomSectionsPanel run={run} panelScope="world" compact />
    </div>
  );
}

// ─── MAP PANEL ───────────────────────────────────────────────────────────────

function MapPanel({ run }: { run: any }) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const explored = run?.exploredLocations || [];
  const world = run?.worldState || {};
  const loc = world.currentLocation || {};
  const era = run?.eraConfig || {};
  const [geocoding, setGeocoding] = useState(false);
  const [currentCoords, setCurrentCoords] = useState<[number, number] | null>(null);

  const geocode = useCallback(async (name: string): Promise<[number, number] | null> => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name)}&format=json&limit=1`, {
        headers: { 'Accept-Language': 'es' }
      });
      const data = await res.json();
      if (data[0]) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
    } catch {}
    return null;
  }, []);

  useEffect(() => {
    if (!loc.name) return;
    setGeocoding(true);
    // Try hierarchy: "specific place, region, territory" → "region, territory" → "territory" → "name"
    const attempts = [
      loc.region && loc.territory ? `${loc.region}, ${loc.territory}` : null,
      loc.territory || null,
      loc.region || null,
      loc.name,
    ].filter(Boolean) as string[];

    (async () => {
      for (const attempt of attempts) {
        const coords = await geocode(attempt);
        if (coords) {
          setCurrentCoords(coords);
          setGeocoding(false);
          return;
        }
      }
      setGeocoding(false);
    })();
  }, [loc.name, loc.region, loc.territory, geocode]);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    let map: any;

    import('leaflet').then((L) => {
      const Ldef = L.default || L;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      if (!mapContainerRef.current) return;

      const center: [number, number] = currentCoords || [30, 15];
      const zoom = currentCoords ? 7 : 2;

      map = Ldef.map(mapContainerRef.current, {
        center,
        zoom,
        zoomControl: false,
        attributionControl: false,
      });

      Ldef.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 18,
      }).addTo(map);

      Ldef.control.zoom({ position: 'bottomright' }).addTo(map);

      if (currentCoords) {
        const icon = Ldef.divIcon({
          html: `<div style="
            width:14px;height:14px;background:#f5a623;border-radius:50%;
            border:2px solid #fff;box-shadow:0 0 8px #f5a62370;
            position:relative;
          "><div style="
            position:absolute;top:-4px;left:-4px;right:-4px;bottom:-4px;
            border-radius:50%;border:2px solid rgba(245,166,35,0.3);
          "></div></div>`,
          className: '',
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        Ldef.marker(currentCoords, { icon }).addTo(map)
          .bindPopup(`<b style="font-family:serif">${loc.name}</b><br><span style="font-size:11px;color:#888">${era.eraLabel || ''}</span>`, { className: 'nexus-popup' });
      }

      explored.forEach((l: any) => {
        if (!l.coords) return;
        const icon = Ldef.divIcon({
          html: `<div style="width:8px;height:8px;background:#00d4a8;border-radius:50%;border:1px solid rgba(0,212,168,0.4);"></div>`,
          className: '',
          iconSize: [8, 8],
          iconAnchor: [4, 4],
        });
        Ldef.marker(l.coords, { icon }).addTo(map).bindPopup(l.name);
      });

      mapInstanceRef.current = map;
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [currentCoords, explored]);

  return (
    <div className="space-y-4">
      <div className="relative rounded-xl overflow-hidden border border-[#1e2530]" style={{ height: '300px' }}>
        <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }} />
        {geocoding && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0c0f]/60 backdrop-blur-sm">
            <div className="font-mono text-[10px] text-[#3d8eff] tracking-widest animate-pulse">LOCALIZANDO...</div>
          </div>
        )}
        <div className="absolute top-2 left-2 z-[1000] px-2 py-1 rounded-lg bg-[#0a0c0f]/85 backdrop-blur-sm border border-[#1e2530]">
          <div className="font-mono text-[9px] text-[#5a6478]">MAPA REAL · TIERRA</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="p-2.5 rounded-lg bg-[#3d8eff08] border border-[#3d8eff]/15">
          <div className="font-mono text-[9px] text-[#3d8eff] mb-1">POSICIÓN ACTUAL</div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[#f5a623]" style={{ boxShadow: '0 0 4px #f5a62360' }} />
            <span className="font-serif text-xs text-[#eef2f8] truncate">{loc.name || '—'}</span>
          </div>
        </div>
        <div className="p-2.5 rounded-lg bg-[#0f1218] border border-[#1e2530]">
          <div className="font-mono text-[9px] text-[#5a6478] mb-1">EXPLORADOS</div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[#00d4a8]" />
            <span className="font-mono text-xs text-[#c8d0dc]">{explored.length} lugares</span>
          </div>
        </div>
      </div>

      {explored.length > 0 && (
        <div>
          <div className="font-mono text-[10px] text-[#5a6478] tracking-widest mb-2">LUGARES VISITADOS</div>
          <div className="space-y-1 max-h-44 overflow-y-auto">
            {explored.map((l: any, i: number) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[#0f1218] border border-[#1e2530]/50">
                <Compass size={9} className="text-[#00d4a8] flex-shrink-0" />
                <span className="font-serif text-xs text-[#c8d0dc] flex-1">{l.name}</span>
                {l.visitedAt && <span className="font-mono text-[8px] text-[#5a6478]">{l.visitedAt}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      <CustomSectionsPanel run={run} panelScope="map" compact />
    </div>
  );
}

// ─── NPCS PANEL ──────────────────────────────────────────────────────────────

const RELATION_SCALE = [
  'Amor incondicional', 'Amor profundo', 'Afecto genuino', 'Aprecio', 'Simpatía',
  'Neutral', 'Indiferencia', 'Distancia', 'Desconfianza', 'Tensión',
  'Rivalidad', 'Animadversión', 'Odio', 'Enemistad declarada', 'Enemistad mortal'
];

function NPCsPanel({ run }: { run: any }) {
  const npcs: any[] = run?.npcs || [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'todos' | 'vivo' | 'muerto' | 'desaparecido'>('todos');
  const [npcTab, setNpcTab] = useState(0);

  const filtered = filter === 'todos' ? npcs : npcs.filter((n) => n.status === filter);
  const alive = npcs.filter((n) => n.status !== 'muerto' && n.status !== 'desaparecido').length;
  const selected = npcs.find((n) => n.id === selectedId);

  const NPC_TABS = ['Identidad', 'Atributos', 'Descriptores', 'Habilidades', 'Relación', 'Inventario', 'Motivaciones', 'Historia', 'Estado'];

  if (selected) {
    const rel = selected.relationship || {};
    const trust = rel.trustLevel ?? 50;
    const trustColor = trust > 66 ? '#00d4a8' : trust > 33 ? '#f5a623' : '#ff4444';
    const ecType = rel.emotionalChargeType || 'neutral';
    const ecColor = ecType === 'positiva' ? '#00d4a8' : ecType === 'negativa' ? '#ff4444' : ecType === 'tensa' ? '#f5a623' : '#5a6478';
    const statusColors: Record<string, string> = { vivo: '#00d4a8', muerto: '#ff4444', desaparecido: '#f5a623' };
    const statusColor = statusColors[selected.status || ''] || '#5a6478';
    const attrs = selected.knownAttributes || {};
    const descriptors = selected.knownDescriptors || {};

    return (
      <div>
        <button onClick={() => { setSelectedId(null); setNpcTab(0); }}
          className="flex items-center gap-1 font-mono text-[10px] text-[#5a6478] hover:text-[#3d8eff] mb-3 transition-colors">
          <ArrowLeft size={10} /> Volver a la lista
        </button>

        <div className="flex items-start gap-3 mb-4">
          <div className="w-16 h-20 rounded-xl overflow-hidden border border-[#1e2530] flex-shrink-0 bg-[#141820]">
            {selected.portraitUrl ? <img src={selected.portraitUrl} alt={selected.name} className="w-full h-full object-cover" /> : <SilhouettePortrait gender={selected.gender} />}
          </div>
          <div className="flex-1">
            <div className="font-serif text-base text-[#eef2f8]">{selected.name || 'Desconocido'}</div>
            {selected.occupation && <div className="font-mono text-[10px] text-[#5a6478]">{selected.occupation}</div>}
            {selected.estimatedAge && <div className="font-mono text-[10px] text-[#5a6478]/70">{selected.estimatedAge} años aprox.</div>}
            <div className="flex items-center gap-1 mt-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: statusColor }} />
              <span className="font-mono text-[9px]" style={{ color: statusColor }}>{selected.status}</span>
            </div>
          </div>
        </div>

        <TabBar tabs={NPC_TABS} active={npcTab} onChange={setNpcTab} />

        {npcTab === 0 && (
          <div className="space-y-2">
            <InfoRow label="Nombre" value={selected.name || '???'} />
            <InfoRow label="Fecha de nacimiento" value={selected.birthDate || '???' } dim={!selected.birthDate} />
            <InfoRow label="Lugar de origen" value={selected.origin || '???'} dim={!selected.origin} />
            <InfoRow label="Género" value={selected.gender} />
            <InfoRow label="Clase social" value={selected.socialClass || '???'} dim={!selected.socialClass} />
            <EditableField path={`npc.${selected.id}.occupation`} label="Ocupación" value={selected.occupation || ''}>
              <InfoRow label="Ocupación" value={selected.occupation || '???'} dim={!selected.occupation} />
            </EditableField>
            <EditableField path={`npc.${selected.id}.lastKnownLocation`} label="Última ubicación" value={selected.lastKnownLocation || ''}>
              <InfoRow label="Última ubicación" value={selected.lastKnownLocation || '???'} dim={!selected.lastKnownLocation} />
            </EditableField>
            {selected.physicalDescription ? (
              <EditableField path={`npc.${selected.id}.physicalDescription`} label="Aspecto físico" value={selected.physicalDescription}>
                <div><div className="font-mono text-[9px] text-[#5a6478] mb-1">ASPECTO FÍSICO</div>
                <p className="font-serif text-xs text-[#c8d0dc] leading-relaxed">{selected.physicalDescription}</p></div>
              </EditableField>
            ) : (
              <EditableField path={`npc.${selected.id}.physicalDescription`} label="Aspecto físico" value="">
                <div><div className="font-mono text-[9px] text-[#5a6478] mb-1">ASPECTO FÍSICO</div>
                <p className="font-serif text-xs italic text-[#5a6478]">Sin descripción. Haz clic en el lápiz para añadir.</p></div>
              </EditableField>
            )}
            {selected.backstory ? (
              <EditableField path={`npc.${selected.id}.backstory`} label="Trasfondo conocido" value={selected.backstory}>
                <div><div className="font-mono text-[9px] text-[#5a6478] mb-1">TRASFONDO CONOCIDO</div>
                <p className="font-serif text-xs italic text-[#5a6478] leading-relaxed">{selected.backstory}</p></div>
              </EditableField>
            ) : null}
          </div>
        )}

        {npcTab === 1 && (
          <div className="space-y-2">
            <p className="font-mono text-[9px] text-[#5a6478]/60 mb-2">Visibilidad según familiaridad. Los desconocidos muestran "???".</p>
            {([
              { key: 'integridadFisica', label: 'Integridad Física' },
              { key: 'reservaMetabolica', label: 'Reserva Metabólica' },
              { key: 'cargaCognitiva', label: 'Carga Cognitiva' },
              { key: 'umbralDeEstres', label: 'Umbral de Estrés' },
              { key: 'aptitudMotriz', label: 'Aptitud Motriz' },
              { key: 'intelectoAplicado', label: 'Intelecto Aplicado' },
              { key: 'presenciaSocial', label: 'Presencia Social' },
              { key: 'estatusDeCasta', label: 'Estatus de Casta' },
            ] as { key: keyof typeof ATTRIBUTE_TUTORIALS; label: string }[]).map(({ key, label }) => (
              <AttributeRow key={key} tutorialKey={key} label={label} value={attrs[key] || undefined} />
            ))}
          </div>
        )}

        {npcTab === 2 && (
          <div className="space-y-2">
            <p className="font-mono text-[9px] text-[#5a6478]/60 mb-2">Descriptores conocidos del personaje. "???" si no se han revelado.</p>
            {[
              ['estadoFisico', 'Estado Físico'], ['condicionMental', 'Condición Mental'],
              ['combate', 'Combate'], ['habilidadesSociales', 'Habilidades Sociales'],
              ['reputacionLocal', 'Reputación Local'], ['condicionSocial', 'Condición Social'],
            ].map(([k, label]) => (
              <div key={k} className="flex justify-between items-start gap-4">
                <span className="font-mono text-[10px] text-[#5a6478] flex-shrink-0">{label.toUpperCase()}</span>
                <span className={`font-serif text-xs text-right ${descriptors[k] ? 'text-[#c8d0dc]' : 'text-[#5a6478]/50 italic'}`}>{descriptors[k] || '???'}</span>
              </div>
            ))}
          </div>
        )}

        {npcTab === 3 && (
          <div className="space-y-2">
            {(selected.knownSkills || []).length === 0 ? (
              <p className="font-serif italic text-[#5a6478] text-xs">Sin habilidades conocidas. Se revelarán narrativamente.</p>
            ) : (
              (selected.knownSkills as any[]).map((s: any, i: number) => {
                const gc = s.grade === 'Maestro' ? '#f5a623' : s.grade === 'Competente' ? '#00d4a8' : '#3d8eff';
                return (
                  <div key={i} className="p-2 rounded-lg bg-[#141820] border border-[#1e2530]">
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-xs text-[#c8d0dc]">{s.name}</span>
                      <span className="font-mono text-[10px]" style={{ color: gc }}>{s.grade}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {npcTab === 4 && (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-[#0f1218] border border-[#3d8eff]/20">
              <div className="font-mono text-[9px] text-[#3d8eff] tracking-widest mb-2">TIPO DE RELACIÓN</div>
              <div className="flex items-center gap-2">
                <div className="font-serif text-sm text-[#eef2f8]">{rel.type || '—'}</div>
                {rel.familyRole && <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-full bg-[#3d8eff]/10 text-[#3d8eff]">{rel.familyRole}</span>}
              </div>
              {rel.emotionalCharge && (
                <div className="mt-2 p-2 rounded-lg bg-[#0a0c0f] border" style={{ borderColor: ecColor + '30' }}>
                  <div className="font-mono text-[9px] mb-0.5" style={{ color: ecColor }}>CARGA EMOCIONAL</div>
                  <p className="font-serif text-xs text-[#c8d0dc]">{rel.emotionalCharge}</p>
                </div>
              )}
            </div>
            {rel.trustLevel !== undefined && (
              <div>
                <div className="flex justify-between mb-1">
                  <span className="font-mono text-[9px] text-[#5a6478]">NIVEL DE CONFIANZA</span>
                  <span className="font-mono text-[9px]" style={{ color: trustColor }}>{trust}%</span>
                </div>
                <div className="h-2 rounded-full bg-[#1e2530] overflow-hidden">
                  <div className="h-2 rounded-full" style={{ width: `${trust}%`, background: trustColor }} />
                </div>
              </div>
            )}
            {rel.lastAttitude && <InfoRow label="Última actitud" value={rel.lastAttitude} />}
            {(rel.keyMoments || []).length > 0 && (
              <div>
                <div className="font-mono text-[9px] text-[#5a6478] mb-1">MOMENTOS CLAVE</div>
                <div className="space-y-1">{(rel.keyMoments as string[]).map((m: string, i: number) => <div key={i} className="font-serif text-xs text-[#5a6478]">· {m}</div>)}</div>
              </div>
            )}
            {(rel.interactionHistory || []).length > 0 && (
              <div>
                <div className="font-mono text-[9px] text-[#5a6478] mb-1">HISTORIAL</div>
                <div className="space-y-1">{(rel.interactionHistory as string[]).map((h: string, i: number) => <div key={i} className="font-serif text-xs text-[#5a6478] pl-2 border-l border-[#1e2530]">{h}</div>)}</div>
              </div>
            )}
          </div>
        )}

        {npcTab === 5 && (
          <div className="space-y-2">
            <p className="font-mono text-[9px] text-[#5a6478]/60 mb-2">Solo objetos de los que el personaje tiene constancia.</p>
            {(selected.knownInventory || []).length === 0 ? (
              <p className="font-serif italic text-[#5a6478] text-xs">Sin posesiones conocidas.</p>
            ) : (
              (selected.knownInventory as string[]).map((item: string, i: number) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[#141820] border border-[#1e2530]">
                  <div className="w-1 h-1 rounded-full bg-[#5a6478] flex-shrink-0" />
                  <span className="font-serif text-xs text-[#c8d0dc]">{item}</span>
                </div>
              ))
            )}
          </div>
        )}

        {npcTab === 6 && (
          <div className="space-y-3">
            <EditableField path={`npc.${selected.id}.knownMotivations`} label="Motivaciones conocidas" value={selected.knownMotivations || ''}>
              <div><div className="font-mono text-[9px] text-[#5a6478] mb-1">MOTIVACIONES CONOCIDAS</div>
              {selected.knownMotivations ? <p className="font-serif text-xs text-[#c8d0dc] leading-relaxed">{selected.knownMotivations}</p> : <p className="font-serif italic text-xs text-[#5a6478]">Sin información. Haz clic en el lápiz para añadir.</p>}</div>
            </EditableField>
            <EditableField path={`npc.${selected.id}.knownFears`} label="Miedos conocidos" value={selected.knownFears || ''}>
              <div><div className="font-mono text-[9px] text-[#5a6478] mb-1">MIEDOS CONOCIDOS</div>
              {selected.knownFears ? <p className="font-serif text-xs text-[#c8d0dc] leading-relaxed">{selected.knownFears}</p> : <p className="font-serif italic text-xs text-[#5a6478]">Sin información. Haz clic en el lápiz para añadir.</p>}</div>
            </EditableField>
            {(selected.secrets || selected.knownSecrets || []).length > 0 && (
              <div className="p-2 rounded-lg bg-[#f5a62308] border border-[#f5a623]/15">
                <div className="font-mono text-[9px] text-[#f5a623] tracking-widest mb-1">SECRETOS CONOCIDOS</div>
                {(selected.secrets || selected.knownSecrets || []).map((s: string, i: number) => (
                  <div key={i} className="font-serif text-xs text-[#f5a623]/70 mb-0.5">· {s}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {npcTab === 7 && (
          <div className="space-y-2">
            {selected.knownHistory ? (
              <p className="font-serif text-xs text-[#c8d0dc] leading-relaxed">{selected.knownHistory}</p>
            ) : <p className="font-serif italic text-[#5a6478] text-xs">Historia desconocida. Se revelará narrativamente.</p>}
          </div>
        )}

        {npcTab === 8 && (
          <div className="space-y-3">
            <InfoRow label="Estado vital" value={selected.status} />
            {selected.knownConditions && <InfoRow label="Condición conocida" value={selected.knownConditions} />}
            {selected.deathDetails && (
              <div className="p-2 rounded-lg bg-[#ff444410] border border-[#ff4444]/20">
                <div className="font-mono text-[9px] text-[#ff4444] tracking-widest mb-1">CAUSA DE MUERTE</div>
                <p className="font-serif text-xs text-[#ff4444]/70">{selected.deathDetails}</p>
              </div>
            )}
            {selected.disappearanceDetails && (
              <div className="p-2 rounded-lg bg-[#f5a62310] border border-[#f5a623]/20">
                <div className="font-mono text-[9px] text-[#f5a623] mb-1">CIRCUNSTANCIAS DE LA DESAPARICIÓN</div>
                <p className="font-serif text-xs text-[#f5a623]/70">{selected.disappearanceDetails}</p>
              </div>
            )}
          </div>
        )}
        <CustomSectionsPanel run={run} panelScope="npcs" compact />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {npcs.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {(['todos', 'vivo', 'muerto', 'desaparecido'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className="px-2 py-0.5 rounded-full font-mono text-[9px] border transition-all"
                style={{ borderColor: filter === f ? '#3d8eff' : '#1e2530', color: filter === f ? '#3d8eff' : '#5a6478', background: filter === f ? '#3d8eff10' : 'transparent' }}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <span className="font-mono text-[9px] text-[#5a6478]">{alive}/{npcs.length} vivos</span>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="font-serif italic text-[#5a6478] text-sm py-4 text-center">{npcs.length === 0 ? 'Ningún personaje conocido aún.' : 'Sin resultados.'}</p>
      ) : (
        filtered.map((npc: any) => {
          const statusColors: Record<string, string> = { vivo: '#00d4a8', muerto: '#ff4444', desaparecido: '#f5a623' };
          const statusColor = statusColors[npc.status || ''] || '#5a6478';
          const rel = npc.relationship || {};
          const ecType = rel.emotionalChargeType || 'neutral';
          const ecColor = ecType === 'positiva' ? '#00d4a8' : ecType === 'negativa' ? '#ff4444' : ecType === 'tensa' ? '#f5a623' : '#5a6478';
          return (
            <button key={npc.id} onClick={() => { setSelectedId(npc.id); setNpcTab(0); }}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-[#1e2530] bg-[#0f1218] hover:border-[#3d8eff]/30 hover:bg-[#3d8eff]/5 transition-all text-left">
              <div className="w-10 h-12 rounded-lg overflow-hidden border border-[#1e2530] flex-shrink-0 bg-[#141820]">
                {npc.portraitUrl ? <img src={npc.portraitUrl} alt={npc.name} className="w-full h-full object-cover" /> : <SilhouettePortrait gender={npc.gender} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: statusColor }} />
                  <div className="font-serif text-sm text-[#eef2f8] truncate">{npc.name || 'Desconocido'}</div>
                </div>
                {npc.occupation && <div className="font-mono text-[9px] text-[#5a6478] truncate">{npc.occupation}</div>}
                {rel.type && <div className="font-mono text-[9px] truncate" style={{ color: ecColor }}>{rel.type}</div>}
              </div>
              <ChevronRight size={12} className="text-[#5a6478] flex-shrink-0" />
            </button>
          );
        })
      )}
      <CustomSectionsPanel run={run} panelScope="npcs" compact />
    </div>
  );
}

// ─── FACTIONS PANEL ──────────────────────────────────────────────────────────

function FactionsPanel({ run }: { run: any }) {
  const { addFaccion } = useEngineStore();
  const facciones: Faccion[] = run?.facciones || [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [facTab, setFacTab] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [newFac, setNewFac] = useState({ name: '', type: 'política', description: '', relationToPlayer: 'neutral', influenceLevel: 'local', isInformal: false });

  const FAC_TABS = ['Identidad', 'Cultura', 'Religión y Lengua', 'Clase Social', 'Política', 'Territorio', 'Historia', 'Miembros', 'Estado actual'];

  const TYPE_COLORS: Record<string, string> = { política: '#3d8eff', religiosa: '#f5a623', militar: '#ff4444', criminal: '#8b5cf6', comercial: '#00d4a8', social: '#5a6478', otra: '#5a6478' };
  const RELATION_COLORS: Record<string, string> = { aliado: '#00d4a8', neutral: '#5a6478', hostil: '#ff4444', desconocido: '#5a6478' };

  const formalFactions = facciones.filter((f: any) => !f.isInformal && !['criminal'].includes(f.type));
  const informalFactions = facciones.filter((f: any) => f.isInformal || f.type === 'criminal');

  const selected = facciones.find((f) => f.id === selectedId);

  const handleAdd = () => {
    if (!newFac.name.trim()) return;
    addFaccion({
      id: 'fac-' + Date.now(),
      name: newFac.name,
      type: newFac.type as Faccion['type'],
      description: newFac.description,
      relationToPlayer: newFac.relationToPlayer as Faccion['relationToPlayer'],
      influenceLevel: newFac.influenceLevel as Faccion['influenceLevel'],
      knownMembers: [],
      playerReputation: 50,
      discoveredAt: run?.worldState?.ingameDate || `Año ${run?.eraConfig?.year}`,
    });
    setNewFac({ name: '', type: 'política', description: '', relationToPlayer: 'neutral', influenceLevel: 'local', isInformal: false });
    setShowAdd(false);
  };

  if (selected) {
    const typeColor = TYPE_COLORS[(selected as any).type] || '#5a6478';
    const relColor = RELATION_COLORS[selected.relationToPlayer] || '#5a6478';
    const repColor = selected.playerReputation > 66 ? '#00d4a8' : selected.playerReputation > 33 ? '#f5a623' : '#ff4444';
    const npcs = run?.npcs || [];
    const memberNPCs = npcs.filter((n: any) => (selected.knownMembers || []).some((m: string) => n.name?.toLowerCase().includes(m.toLowerCase())));

    return (
      <div>
        <button onClick={() => { setSelectedId(null); setFacTab(0); }}
          className="flex items-center gap-1 font-mono text-[10px] text-[#5a6478] hover:text-[#3d8eff] mb-3 transition-colors">
          <ArrowLeft size={10} /> Volver a la lista
        </button>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 border" style={{ background: typeColor + '20', borderColor: typeColor + '30' }}>
            <Shield size={20} style={{ color: typeColor }} />
          </div>
          <div className="flex-1">
            <div className="font-serif text-base text-[#eef2f8]">{selected.name}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: typeColor + '20', color: typeColor }}>{(selected as any).type}</span>
              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: relColor + '20', color: relColor }}>{selected.relationToPlayer}</span>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <div className="flex justify-between mb-1">
            <span className="font-mono text-[9px] text-[#5a6478]">REPUTACIÓN DEL PJ</span>
            <span className="font-mono text-[9px]" style={{ color: repColor }}>{selected.playerReputation}/100</span>
          </div>
          <div className="h-2 rounded-full bg-[#1e2530] overflow-hidden">
            <div className="h-2 rounded-full" style={{ width: `${selected.playerReputation}%`, background: repColor }} />
          </div>
          <p className="font-mono text-[8px] text-[#5a6478]/50 mt-0.5">Actualizado automáticamente por la narración</p>
        </div>

        <TabBar tabs={FAC_TABS} active={facTab} onChange={setFacTab} />

        {facTab === 0 && (
          <div className="space-y-2">
            <EditableField path={`faccion.${selected.id}.description`} label="Descripción" value={selected.description || ''}>
              {selected.description
                ? <p className="font-serif text-xs text-[#c8d0dc] leading-relaxed">{selected.description}</p>
                : <p className="font-serif italic text-xs text-[#5a6478]">Sin descripción. Haz clic en el lápiz para añadir.</p>}
            </EditableField>
            <InfoRow label="Influencia" value={selected.influenceLevel} />
            <InfoRow label="Tamaño" value={(selected as any).size || '???'} dim={!(selected as any).size} />
            <EditableField path={`faccion.${selected.id}.sede`} label="Sede" value={(selected as any).sede || ''}>
              <InfoRow label="Sede" value={(selected as any).sede || '???'} dim={!(selected as any).sede} />
            </EditableField>
            <EditableField path={`faccion.${selected.id}.leaderKnown`} label="Líder conocido" value={(selected as any).leaderKnown || ''}>
              <InfoRow label="Líder conocido" value={(selected as any).leaderKnown || '???'} dim={!(selected as any).leaderKnown} />
            </EditableField>
            <InfoRow label="Lema" value={(selected as any).slogan || '???'} dim={!(selected as any).slogan} />
            <InfoRow label="Año de fundación" value={(selected as any).foundingYear ? `${(selected as any).foundingYear}` : '???'} dim={!(selected as any).foundingYear} />
            {selected.discoveredAt && <InfoRow label="Descubierta" value={selected.discoveredAt} />}
            {selected.knownGoals ? (
              <EditableField path={`faccion.${selected.id}.knownGoals`} label="Objetivos conocidos" value={selected.knownGoals}>
                <div><div className="font-mono text-[9px] text-[#5a6478] mb-1">OBJETIVOS CONOCIDOS</div><p className="font-serif text-xs italic text-[#5a6478] leading-relaxed">{selected.knownGoals}</p></div>
              </EditableField>
            ) : null}
          </div>
        )}

        {facTab === 1 && (
          <div className="space-y-3">
            {(selected as any).values && <div><div className="font-mono text-[9px] text-[#5a6478] mb-1">VALORES</div><p className="font-serif text-xs text-[#c8d0dc] leading-relaxed">{(selected as any).values}</p></div>}
            {(selected as any).norms && <div><div className="font-mono text-[9px] text-[#5a6478] mb-1">NORMAS</div><p className="font-serif text-xs text-[#c8d0dc] leading-relaxed">{(selected as any).norms}</p></div>}
            {(selected as any).taboos && <div><div className="font-mono text-[9px] text-[#5a6478] mb-1">TABÚES</div><p className="font-serif text-xs text-[#c8d0dc] leading-relaxed">{(selected as any).taboos}</p></div>}
            {(selected as any).rituals && <div><div className="font-mono text-[9px] text-[#5a6478] mb-1">RITUALES</div><p className="font-serif text-xs text-[#c8d0dc] leading-relaxed">{(selected as any).rituals}</p></div>}
            {(selected as any).hierarchy && <div><div className="font-mono text-[9px] text-[#5a6478] mb-1">JERARQUÍA</div><p className="font-serif text-xs text-[#c8d0dc] leading-relaxed">{(selected as any).hierarchy}</p></div>}
            {(selected as any).treatmentOfOutsiders && <div><div className="font-mono text-[9px] text-[#5a6478] mb-1">TRATO A FORASTEROS</div><p className="font-serif text-xs text-[#c8d0dc] leading-relaxed">{(selected as any).treatmentOfOutsiders}</p></div>}
            {!((selected as any).values) && !((selected as any).norms) && <p className="font-serif italic text-[#5a6478] text-xs">Sin información cultural disponible.</p>}
          </div>
        )}

        {facTab === 2 && (
          <div className="space-y-3">
            {(selected as any).religion && <div><div className="font-mono text-[9px] text-[#f5a623] mb-1">RELIGIÓN DOMINANTE</div><p className="font-serif text-xs text-[#c8d0dc]">{(selected as any).religion}</p></div>}
            {(selected as any).language && <div><div className="font-mono text-[9px] text-[#5a6478] mb-1">IDIOMA</div><p className="font-serif text-xs text-[#c8d0dc]">{(selected as any).language}</p></div>}
            {(selected as any).religiousPractices && <div><div className="font-mono text-[9px] text-[#5a6478] mb-1">PRÁCTICAS RELIGIOSAS</div><p className="font-serif text-xs text-[#c8d0dc]">{(selected as any).religiousPractices}</p></div>}
            {!(selected as any).religion && !(selected as any).language && <p className="font-serif italic text-[#5a6478] text-xs">Sin información de religión y lengua.</p>}
          </div>
        )}

        {facTab === 3 && (
          <div className="space-y-3">
            {(selected as any).socialStructure && <div><div className="font-mono text-[9px] text-[#5a6478] mb-1">ESTRATIFICACIÓN SOCIAL</div><p className="font-serif text-xs text-[#c8d0dc]">{(selected as any).socialStructure}</p></div>}
            {(selected as any).socialMobility && <div><div className="font-mono text-[9px] text-[#5a6478] mb-1">MOVILIDAD SOCIAL</div><p className="font-serif text-xs text-[#c8d0dc]">{(selected as any).socialMobility}</p></div>}
            {!(selected as any).socialStructure && <p className="font-serif italic text-[#5a6478] text-xs">Sin información de estructura social.</p>}
          </div>
        )}

        {facTab === 4 && (
          <div className="space-y-3">
            {(selected as any).internalPolitics && <div><div className="font-mono text-[9px] text-[#3d8eff] mb-1">POLÍTICA INTERNA</div><p className="font-serif text-xs text-[#c8d0dc]">{(selected as any).internalPolitics}</p></div>}
            {(selected as any).relationsWithOtherFactions && <div><div className="font-mono text-[9px] text-[#5a6478] mb-1">RELACIONES EXTERNAS</div><p className="font-serif text-xs text-[#c8d0dc]">{(selected as any).relationsWithOtherFactions}</p></div>}
            {!(selected as any).internalPolitics && <p className="font-serif italic text-[#5a6478] text-xs">Sin información política disponible.</p>}
          </div>
        )}

        {facTab === 5 && (
          <div className="space-y-3">
            {(selected as any).territory && <div><div className="font-mono text-[9px] text-[#5a6478] mb-1">TERRITORIO</div><p className="font-serif text-xs text-[#c8d0dc] leading-relaxed">{(selected as any).territory}</p></div>}
            {(selected as any).resources && <div><div className="font-mono text-[9px] text-[#5a6478] mb-1">RECURSOS</div><p className="font-serif text-xs text-[#c8d0dc] leading-relaxed">{(selected as any).resources}</p></div>}
            {!(selected as any).territory && <p className="font-serif italic text-[#5a6478] text-xs">Sin información territorial.</p>}
          </div>
        )}

        {facTab === 6 && (
          <div className="space-y-2">
            {(selected as any).foundingYear && <InfoRow label="Fundación" value={`Año ${(selected as any).foundingYear}`} />}
            {(selected as any).currentSituation && <div><div className="font-mono text-[9px] text-[#5a6478] mb-1">SITUACIÓN ACTUAL</div><p className="font-serif text-xs text-[#c8d0dc]">{(selected as any).currentSituation}</p></div>}
            {((selected as any).history || []).length > 0 ? (
              (selected as any).history.map((ev: any, i: number) => (
                <div key={i} className="p-2 rounded-lg bg-[#141820] border border-[#1e2530]">
                  <div className="font-mono text-[9px] text-[#3d8eff]">Año {ev.year}</div>
                  <p className="font-serif text-xs text-[#c8d0dc]">{ev.event}</p>
                </div>
              ))
            ) : <p className="font-serif italic text-[#5a6478] text-xs">Sin registros históricos.</p>}
          </div>
        )}

        {facTab === 7 && (
          <div className="space-y-2">
            {(selected.knownMembers || []).length === 0 ? (
              <p className="font-serif italic text-[#5a6478] text-xs">Sin miembros conocidos.</p>
            ) : (
              (selected.knownMembers as string[]).map((m: string, i: number) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[#141820] border border-[#1e2530]">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#5a6478] flex-shrink-0" />
                  <span className="font-serif text-xs text-[#c8d0dc]">{m}</span>
                </div>
              ))
            )}
          </div>
        )}

        {facTab === 8 && (
          <div className="space-y-3">
            <EditableField path={`faccion.${selected.id}.currentSituation`} label="Situación actual" value={(selected as any).currentSituation || ''}>
              <div><div className="font-mono text-[9px] text-[#5a6478] mb-1">SITUACIÓN</div>
              {(selected as any).currentSituation
                ? <p className="font-serif text-xs text-[#c8d0dc]">{(selected as any).currentSituation}</p>
                : <p className="font-serif italic text-xs text-[#5a6478]">Sin información. Haz clic en el lápiz para añadir.</p>}
              </div>
            </EditableField>
            {(selected as any).internalConflicts && <div><div className="font-mono text-[9px] text-[#ff4444]/70 mb-1">CONFLICTOS INTERNOS</div><p className="font-serif text-xs text-[#c8d0dc]">{(selected as any).internalConflicts}</p></div>}
          </div>
        )}
        <CustomSectionsPanel run={run} panelScope="factions" compact />
      </div>
    );
  }

  const FactionList = ({ list, title }: { list: Faccion[]; title: string }) => (
    <div className="space-y-2">
      {list.length > 0 && <div className="font-mono text-[10px] text-[#5a6478] tracking-widest mb-1">{title}</div>}
      {list.map((fac) => {
        const typeColor = TYPE_COLORS[(fac as any).type] || '#5a6478';
        const relColor = RELATION_COLORS[fac.relationToPlayer] || '#5a6478';
        const repColor = fac.playerReputation > 66 ? '#00d4a8' : fac.playerReputation > 33 ? '#f5a623' : '#ff4444';
        return (
          <button key={fac.id} onClick={() => { setSelectedId(fac.id); setFacTab(0); }}
            className="w-full flex items-center gap-3 p-3 rounded-xl border border-[#1e2530] bg-[#0f1218] hover:border-[#3d8eff]/20 transition-all text-left">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: typeColor + '15', border: `1px solid ${typeColor}30` }}>
              <Shield size={12} style={{ color: typeColor }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-serif text-sm text-[#eef2f8] truncate">{fac.name}</div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px]" style={{ color: typeColor }}>{(fac as any).type}</span>
                <span className="font-mono text-[9px]" style={{ color: relColor }}>· {fac.relationToPlayer}</span>
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <div className="flex-1 h-0.5 rounded-full bg-[#1e2530] max-w-[60px]">
                  <div className="h-0.5 rounded-full" style={{ width: `${fac.playerReputation}%`, background: repColor }} />
                </div>
                <span className="font-mono text-[8px]" style={{ color: repColor }}>{fac.playerReputation}</span>
              </div>
            </div>
            <ChevronRight size={12} className="text-[#5a6478] flex-shrink-0" />
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] text-[#5a6478]">{facciones.length} faccion{facciones.length !== 1 ? 'es' : ''}</p>
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[#1e2530] font-mono text-[9px] text-[#5a6478] hover:text-[#3d8eff] hover:border-[#3d8eff]/30 transition-all">
          <Plus size={10} /> Añadir
        </button>
      </div>

      {showAdd && (
        <div className="p-3 rounded-xl bg-[#0f1218] border border-[#3d8eff]/20 space-y-2">
          <div className="font-mono text-[10px] text-[#3d8eff] tracking-widest mb-1">NUEVA FACCIÓN</div>
          <input value={newFac.name} onChange={(e) => setNewFac(p => ({ ...p, name: e.target.value }))} placeholder="Nombre"
            className="w-full bg-[#0a0c0f] border border-[#1e2530] rounded-lg px-3 py-1.5 font-serif text-xs text-[#eef2f8] placeholder-[#5a6478] outline-none focus:border-[#3d8eff]/40" />
          <div className="grid grid-cols-2 gap-2">
            <select value={newFac.type} onChange={(e) => setNewFac(p => ({ ...p, type: e.target.value }))}
              className="bg-[#0a0c0f] border border-[#1e2530] rounded-lg px-2 py-1.5 font-mono text-[9px] text-[#5a6478] outline-none">
              {['política','religiosa','militar','criminal','comercial','social','otra'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
            <select value={newFac.relationToPlayer} onChange={(e) => setNewFac(p => ({ ...p, relationToPlayer: e.target.value }))}
              className="bg-[#0a0c0f] border border-[#1e2530] rounded-lg px-2 py-1.5 font-mono text-[9px] text-[#5a6478] outline-none">
              {['aliado','neutral','hostil','desconocido'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} className="flex-1 py-1.5 rounded-lg bg-[#3d8eff20] border border-[#3d8eff]/30 font-mono text-[9px] text-[#3d8eff]">Añadir</button>
            <button onClick={() => setShowAdd(false)} className="flex-1 py-1.5 rounded-lg border border-[#1e2530] font-mono text-[9px] text-[#5a6478]">Cancelar</button>
          </div>
        </div>
      )}

      {facciones.length === 0 && !showAdd ? (
        <p className="font-serif italic text-[#5a6478] text-sm py-4 text-center">Ninguna facción descubierta. Aparecerán automáticamente durante la narración.</p>
      ) : (
        <>
          {formalFactions.length > 0 && <FactionList list={formalFactions} title="ORGANIZACIONES FORMALES" />}
          {informalFactions.length > 0 && <FactionList list={informalFactions} title="GRUPOS INFORMALES" />}
        </>
      )}
      <CustomSectionsPanel run={run} panelScope="factions" compact />
    </div>
  );
}

// ─── EDITOR PANEL ─────────────────────────────────────────────────────────────

function EditorPanel({ run, onRegenerate, isGenerating, canRegenerate }: {
  run: any; onRegenerate: () => void; isGenerating: boolean; canRegenerate: boolean;
}) {
  const { settings, updateSettings, updateActiveRun, narrativeVoice, setNarrativeVoice, sessionStats, resetSessionStats } = useEngineStore();
  const [tab, setTab] = useState(0);
  const TABS = ['Narración', 'IA', 'Contenido', 'Experiencia', 'Ritmo', 'Simulación'];
  const selectedAIProvider = (run?.aiProvider || settings.aiProvider || 'gemini') as 'gemini' | 'anthropic';

  const toggleSub = (key: keyof typeof settings.explicitSubToggles) => {
    updateSettings({ explicitSubToggles: { ...settings.explicitSubToggles, [key]: !settings.explicitSubToggles[key] } });
  };

  const handleExplicitMasterToggle = () => {
    const newVal = !settings.explicitMode;
    const subs = newVal
      ? { violence: true, language: true, sexual: true, torture: true, substances: true, psychologicalTrauma: true }
      : { violence: false, language: false, sexual: false, torture: false, substances: false, psychologicalTrauma: false };
    updateSettings({ explicitMode: newVal, explicitSubToggles: subs });
  };

  return (
    <div>
      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {tab === 0 && (
        <div className="space-y-5">
          <div>
            <div className="font-mono text-[10px] text-[#5a6478] tracking-widest mb-3">VOZ NARRATIVA</div>
            <div className="space-y-2">
              {[
                { id: 'third_person', label: 'Narrador externo', desc: 'Perspectiva omnisciente en tercera persona' },
                { id: 'first_person', label: 'Primera persona', desc: 'Experiencia visceral en segunda persona' },
                { id: 'world_speaks', label: 'El mundo habla', desc: 'Fragmentos, cartas y artefactos' },
              ].map((v) => (
                <button key={v.id} onClick={() => setNarrativeVoice(v.id as any)} className="w-full text-left px-3 py-2.5 rounded-lg font-mono text-xs border transition-all"
                  style={{ borderColor: narrativeVoice === v.id ? '#3d8eff' : '#1e2530', color: narrativeVoice === v.id ? '#3d8eff' : '#5a6478', background: narrativeVoice === v.id ? '#3d8eff10' : '#0f1218' }}>
                  <div>{v.label}</div>
                  <div className="font-serif text-[10px] mt-0.5 opacity-70 italic">{v.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <Toggle value={settings.otherPerspectives} onChange={() => updateSettings({ otherPerspectives: !settings.otherPerspectives })}
            label="Perspectivas de NPCs" desc="El narrador puede hablar desde personajes relevantes" />
        </div>
      )}

      {tab === 1 && (
        <div className="space-y-4">
          <AIProviderSelector value={selectedAIProvider} onChange={(aiProvider) => updateActiveRun({ aiProvider })} compact />
          <div className="p-3 rounded-xl bg-[#0f1218] border border-[#1e2530] space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-mono text-[10px] text-[#5a6478] tracking-widest">CONSUMO DE ESTA SESIÓN</div>
              <button onClick={() => resetSessionStats()} title="Reiniciar contadores de sesión"
                className="font-mono text-[9px] text-[#5a6478] hover:text-[#f5a623] transition-colors">RESET</button>
            </div>
            {(['gemini','anthropic'] as const).map((p) => {
              const s = sessionStats[p];
              const total = s.inputTokens + s.outputTokens;
              const color = p === 'gemini' ? '#3d8eff' : '#00d4a8';
              return (
                <div key={p} className="flex items-center justify-between gap-2 py-1 border-t border-[#1e2530] first:border-t-0 first:pt-0">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                    <span className="font-mono text-[10px]" style={{ color }}>{p === 'gemini' ? 'GEMINI' : 'CLAUDE'}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-[11px] text-[#eef2f8]">{total.toLocaleString()} tk</div>
                    <div className="font-mono text-[8px] text-[#5a6478]">{s.calls} llamadas · ↓{s.inputTokens.toLocaleString()} ↑{s.outputTokens.toLocaleString()}</div>
                  </div>
                </div>
              );
            })}
            {sessionStats.lastTurn && (
              <div className="pt-2 border-t border-[#1e2530] font-mono text-[9px] text-[#5a6478]">
                Último turno: <span style={{ color: sessionStats.lastTurn.provider === 'gemini' ? '#3d8eff' : '#00d4a8' }}>{sessionStats.lastTurn.provider === 'gemini' ? 'Gemini' : 'Claude'}</span> · {(sessionStats.lastTurn.inputTokens + sessionStats.lastTurn.outputTokens).toLocaleString()} tokens
              </div>
            )}
            <p className="font-serif italic text-[10px] text-[#5a6478]/70 pt-1 border-t border-[#1e2530]">
              Cada IA tiene su propio cupo: si una se agota puedes cambiar a la otra y seguir jugando sin perder tu partida.
            </p>
          </div>
        </div>
      )}

      {tab === 2 && (
        <div className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-2">
              <div>
                <div className="font-mono text-[10px] text-[#5a6478] tracking-widest">MODO EXPLÍCITO</div>
                <p className="font-serif text-[10px] italic text-[#5a6478]/60">Activa contenido sin censura</p>
              </div>
              <button onClick={handleExplicitMasterToggle} className="w-10 h-5 rounded-full flex items-center transition-all"
                style={{ background: settings.explicitMode ? '#f5a62340' : '#1e2530', border: `1px solid ${settings.explicitMode ? '#f5a623' : '#1e2530'}` }}>
                <div className="w-3 h-3 rounded-full mx-0.5 transition-all" style={{ background: settings.explicitMode ? '#f5a623' : '#5a6478', transform: settings.explicitMode ? 'translateX(20px)' : 'translateX(0)' }} />
              </button>
            </div>
            <div className="space-y-2 ml-2 border-l border-[#f5a623]/20 pl-3">
              {(Object.entries(settings.explicitSubToggles) as [keyof typeof settings.explicitSubToggles, boolean][]).map(([k, v]) => {
                const LABELS: Record<string, string> = {
                  violence: 'Violencia y gore', language: 'Lenguaje vulgar', sexual: 'Contenido sexual',
                  torture: 'Tortura y crueldad extrema', substances: 'Consumo de sustancias detallado', psychologicalTrauma: 'Trauma psicológico explícito',
                };
                return (
                  <button key={k} onClick={() => toggleSub(k)} disabled={!settings.explicitMode} className="flex items-center gap-2 w-full py-0.5 disabled:opacity-40">
                    <div className="w-3 h-3 rounded border flex-shrink-0 flex items-center justify-center transition-all"
                      style={{ background: v ? '#f5a623' : 'transparent', borderColor: v ? '#f5a623' : '#5a6478' }}>
                      {v && <div className="w-1.5 h-1.5 bg-black rounded-sm" />}
                    </div>
                    <span className="font-mono text-[10px] text-[#5a6478]">{LABELS[k] || k}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 3 && (
        <div className="space-y-4">
          <div>
            <div className="font-mono text-[10px] text-[#5a6478] tracking-widest mb-2">TAMAÑO DE TEXTO</div>
            <div className="flex gap-2">
              {(['sm', 'md', 'lg'] as const).map((s) => (
                <button key={s} onClick={() => updateSettings({ textSize: s })} className="flex-1 py-2 rounded-lg font-mono text-xs border transition-all"
                  style={{ borderColor: settings.textSize === s ? '#3d8eff' : '#1e2530', color: settings.textSize === s ? '#3d8eff' : '#5a6478', background: settings.textSize === s ? '#3d8eff10' : '#0f1218' }}>
                  {s === 'sm' ? 'Pequeño' : s === 'md' ? 'Normal' : 'Grande'}
                </button>
              ))}
            </div>
          </div>
          <Toggle value={settings.imageGenEnabled} onChange={() => updateSettings({ imageGenEnabled: !settings.imageGenEnabled })}
            label="Generar imágenes en momentos clave" />
        </div>
      )}

      {tab === 4 && (
        <div className="space-y-4">
          <div>
            <div className="font-mono text-[10px] text-[#5a6478] tracking-widest mb-2">INTENSIDAD NARRATIVA</div>
            <div className="space-y-1">
              {([
                { id: 'minima', label: 'Mínima', desc: 'Respuestas cortas y directas' },
                { id: 'normal', label: 'Normal', desc: 'Equilibrio entre detalle y agilidad' },
                { id: 'extensa', label: 'Extensa', desc: 'Narración rica y detallada' },
                { id: 'epica', label: 'Épica', desc: 'Prosa cinematográfica elaborada' },
              ] as const).map((v) => (
                <button key={v.id} onClick={() => updateSettings({ narrativeIntensity: v.id })} className="w-full text-left px-3 py-2 rounded-lg font-mono text-xs border transition-all"
                  style={{ borderColor: settings.narrativeIntensity === v.id ? '#f5a623' : '#1e2530', color: settings.narrativeIntensity === v.id ? '#f5a623' : '#5a6478', background: settings.narrativeIntensity === v.id ? '#f5a62310' : '#0f1218' }}>
                  <div>{v.label}</div>
                  <div className="font-serif text-[10px] mt-0.5 opacity-70 italic">{v.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] text-[#5a6478] tracking-widest mb-2">RITMO NARRATIVO</div>
            <div className="space-y-1">
              {([
                { id: 'frenetico', label: 'Frenético', desc: 'Acción y tensión constante' },
                { id: 'normal', label: 'Normal', desc: 'Alternancia de calma y drama' },
                { id: 'pausado', label: 'Pausado', desc: 'Énfasis en lo cotidiano' },
                { id: 'contemplativo', label: 'Contemplativo', desc: 'Introspección y reflexión' },
              ] as const).map((v) => (
                <button key={v.id} onClick={() => updateSettings({ narrativeRhythm: v.id })} className="w-full text-left px-3 py-2 rounded-lg font-mono text-xs border transition-all"
                  style={{ borderColor: settings.narrativeRhythm === v.id ? '#8b5cf6' : '#1e2530', color: settings.narrativeRhythm === v.id ? '#8b5cf6' : '#5a6478', background: settings.narrativeRhythm === v.id ? '#8b5cf610' : '#0f1218' }}>
                  <div>{v.label}</div>
                  <div className="font-serif text-[10px] mt-0.5 opacity-70 italic">{v.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2 pt-2 border-t border-[#1e2530]">
            <div className="font-mono text-[10px] text-[#5a6478] tracking-widest mb-2">ACCIONES NARRATIVAS</div>
            <button onClick={onRegenerate} disabled={isGenerating || !canRegenerate}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[#3d8eff]/20 text-[#3d8eff] hover:bg-[#3d8eff]/5 transition-all disabled:opacity-30">
              <RefreshCw size={12} />
              <div className="text-left">
                <div className="font-mono text-xs">Regenerar última narración</div>
                <div className="font-serif text-[10px] opacity-70 italic">Resultado diferente, sin avanzar la historia</div>
              </div>
            </button>
            <button disabled className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[#1e2530] text-[#5a6478] opacity-40">
              <Wrench size={12} />
              <div className="text-left">
                <div className="font-mono text-xs">Corregir continuidad</div>
                <div className="font-serif text-[10px] opacity-70 italic">Detectar y corregir inconsistencias</div>
              </div>
            </button>
          </div>
        </div>
      )}

      {tab === 5 && (
        <div className="space-y-4">
          <Toggle value={settings.subjectiveTime} onChange={() => updateSettings({ subjectiveTime: !settings.subjectiveTime })}
            label="Tiempo subjetivo" desc="El tiempo in-game avanza según la narrativa" />
          <p className="font-mono text-[9px] text-[#5a6478]/50 text-center px-2">Más ajustes de simulación en futuras versiones.</p>
        </div>
      )}
    </div>
  );
}

function AIProviderSelector({ value, onChange, compact = false }: { value: 'gemini' | 'anthropic'; onChange: (value: 'gemini' | 'anthropic') => void; compact?: boolean }) {
  const providers = [
    { id: 'gemini' as const, label: 'Gemini', desc: 'Usa la cuota independiente de Gemini.' },
    { id: 'anthropic' as const, label: 'Claude (Anthropic)', desc: 'Usa la cuota independiente de Anthropic.' },
  ];

  return (
    <div className={compact ? 'space-y-2' : 'grid grid-cols-1 gap-2'}>
      {providers.map((provider) => (
        <button
          key={provider.id}
          onClick={() => onChange(provider.id)}
          className={`w-full text-left p-3 rounded-lg border transition-all ${
            value === provider.id
              ? 'border-[#00d4a8] bg-[#00d4a8]/10 text-[#eef2f8]'
              : 'border-[#1e2530] bg-[#0f1218] text-[#5a6478] hover:border-[#00d4a8]/30 hover:text-[#c8d0dc]'
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="font-mono text-xs font-bold">{provider.label}</div>
            {value === provider.id && <span className="font-mono text-[9px] text-[#00d4a8]">ACTIVA EN ESTA PARTIDA</span>}
          </div>
          <div className="font-serif text-[10px] italic mt-1 opacity-80">{provider.desc}</div>
        </button>
      ))}
    </div>
  );
}

// ─── SAVE PANEL ──────────────────────────────────────────────────────────────

function SavePanel({ run, onClose }: { run: any; onClose: () => void }) {
  const { updateActiveRun, setActiveRun, pastRuns, saveRunToLibrary } = useEngineStore();
  const [saved, setSaved] = useState(false);
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const importRef = React.useRef<HTMLInputElement>(null);

  const handleSave = () => {
    updateActiveRun({ savedAt: Date.now() });
    if (run) saveRunToLibrary({ ...run, savedAt: Date.now() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleExport = () => {
    if (!run) return;
    const exportData = {
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      run,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const charName = (run.character?.name || 'partida').replace(/\s+/g, '_');
    a.download = `nexus_${charName}_v${SCHEMA_VERSION}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError('');
    setImportSuccess('');
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const parsed = JSON.parse(text);
        if (!parsed.run) throw new Error('Archivo inválido: falta el campo "run".');
        const migrated = migrateRunState(parsed.run);
        setActiveRun(migrated);
        setImportSuccess(`✓ Partida de ${migrated.character?.name || 'personaje desconocido'} importada correctamente.`);
        setTimeout(() => setImportSuccess(''), 4000);
      } catch (err: any) {
        setImportError('× Error al importar: ' + (err?.message || 'archivo no reconocido.'));
      }
      if (importRef.current) importRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const savedAt = run?.savedAt ? new Date(run.savedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : null;

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-xl bg-[#0f1218] border border-[#1e2530] space-y-2">
        <InfoRow label="Personaje" value={run?.character?.name} />
        <InfoRow label="Edad" value={run?.character?.age ? `${run.character.age} años` : undefined} />
        <InfoRow label="Turnos jugados" value={run?.turnCount || 0} />
        <InfoRow label="NPCs conocidos" value={(run?.npcs || []).length} />
        <InfoRow label="Inventario" value={(run?.inventory || []).length} />
        {savedAt && <InfoRow label="Último guardado" value={savedAt} />}
      </div>

      <button onClick={handleSave} className="w-full py-3 rounded-xl font-mono text-sm border transition-all active:scale-95 flex items-center justify-center gap-2"
        style={{ borderColor: saved ? '#00d4a850' : '#1e2530', color: saved ? '#00d4a8' : '#5a6478', background: saved ? '#00d4a810' : '#0f1218' }}>
        {saved ? <><CheckCircle size={14} /> Partida guardada</> : <><Save size={14} /> Guardar partida</>}
      </button>

      <p className="font-mono text-[9px] text-[#5a6478] text-center">El guardado se mantiene en este navegador.</p>

      <div className="p-3 rounded-xl bg-[#0f1218] border border-[#1e2530] space-y-2">
        <div className="font-mono text-[10px] text-[#5a6478] tracking-widest mb-2">EXPORTAR / IMPORTAR</div>
        <button onClick={handleExport}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#3d8eff]/30 font-mono text-xs text-[#3d8eff] bg-[#3d8eff]/5 hover:bg-[#3d8eff]/10 transition-all active:scale-95">
          <BookOpen size={12} /> Exportar partida (JSON)
        </button>
        <button onClick={() => importRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#8b5cf6]/30 font-mono text-xs text-[#8b5cf6] bg-[#8b5cf6]/5 hover:bg-[#8b5cf6]/10 transition-all active:scale-95">
          <RefreshCw size={12} /> Importar partida (JSON)
        </button>
        <input ref={importRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImport} />
        {importError && <p className="font-mono text-[10px] text-[#ff4444] leading-relaxed">{importError}</p>}
        {importSuccess && <p className="font-mono text-[10px] text-[#00d4a8] leading-relaxed">{importSuccess}</p>}
        <p className="font-mono text-[9px] text-[#5a6478]/60 text-center">Transfiere partidas entre dispositivos o cuentas.</p>
      </div>

      {!showConfirmEnd ? (
        <button onClick={() => setShowConfirmEnd(true)}
          className="w-full py-2 rounded-xl font-mono text-xs border border-[#ff4444]/20 text-[#ff4444]/60 hover:text-[#ff4444] hover:border-[#ff4444]/40 transition-all">
          Terminar y archivar partida
        </button>
      ) : (
        <div className="p-3 rounded-xl bg-[#ff444410] border border-[#ff4444]/30">
          <p className="font-serif text-xs text-[#ff4444] mb-3">Terminar la partida de <strong>{run?.character?.name}</strong>. Se archivará el run.</p>
          <div className="flex gap-2">
            <button onClick={() => { updateActiveRun({ endedAt: Date.now(), endCause: 'Terminada por el jugador' }); onClose(); }}
              className="flex-1 py-1.5 rounded-lg bg-[#ff444420] border border-[#ff4444]/30 font-mono text-[9px] text-[#ff4444]">Confirmar</button>
            <button onClick={() => setShowConfirmEnd(false)}
              className="flex-1 py-1.5 rounded-lg border border-[#1e2530] font-mono text-[9px] text-[#5a6478]">Cancelar</button>
          </div>
        </div>
      )}

      {pastRuns.length > 0 && (
        <>
          <div className="font-mono text-[10px] text-[#5a6478] tracking-widest mt-2">PARTIDAS ARCHIVADAS</div>
          <div className="space-y-2">
            {pastRuns.slice(0, 8).map((r) => (
              <div key={r.runId} className="p-3 rounded-lg border border-[#1e2530] bg-[#0f1218]">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-serif text-sm text-[#eef2f8]">{r.character?.name || '?'}</div>
                    <div className="font-mono text-[9px] text-[#5a6478]">{r.eraConfig?.eraLabel || ''}</div>
                  </div>
                  <div className="font-mono text-[9px] text-[#5a6478]">
                    {r.endedAt ? new Date(r.endedAt).toLocaleDateString('es-ES') : '—'}
                  </div>
                </div>
                {r.endCause && <p className="font-serif text-[10px] italic text-[#5a6478] mt-1">{r.endCause}</p>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── MEMORIA IA PANEL ─────────────────────────────────────────────────────────

function MemoriaPanel({ run }: { run: any }) {
  const { updateMemoriaNarrador, globalInstructions, setGlobalInstructions } = useEngineStore();
  const memoria = run?.memoriaNarrador || { notasLibres: '', reglasDeLaPartida: '', hechosCanonicos: [] };
  const [newHecho, setNewHecho] = useState('');
  const [editingNotas, setEditingNotas] = useState(false);
  const [notasDraft, setNotasDraft] = useState(memoria.notasLibres || '');
  const [editingReglas, setEditingReglas] = useState(false);
  const [reglasDraft, setReglasDraft] = useState(memoria.reglasDeLaPartida || '');
  const [editingGlobal, setEditingGlobal] = useState(false);
  const [globalDraft, setGlobalDraft] = useState(globalInstructions || '');
  const hechosCanonicos: string[] = memoria.hechosCanonicos || [];

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-xl bg-[#8b5cf608] border border-[#8b5cf6]/20">
        <div className="flex items-center gap-2 mb-1">
          <Brain size={12} className="text-[#8b5cf6]" />
          <div className="font-mono text-[10px] text-[#8b5cf6] tracking-widest">SOBRE ESTE PANEL</div>
        </div>
        <p className="font-serif text-xs text-[#5a6478] leading-relaxed">
          Esta memoria se pasa al narrador en cada turno. Úsala para anclar hechos, reglas y notas que nunca deben olvidarse.
        </p>
      </div>

      {memoria.resumen ? (
        <div className="p-3 rounded-xl bg-[#22c55e08] border border-[#22c55e]/25">
          <div className="flex items-center gap-2 mb-2">
            <Brain size={11} className="text-[#22c55e]" />
            <div className="font-mono text-[10px] text-[#22c55e] tracking-widest">RESUMEN IA (auto-generado)</div>
            <span className="font-mono text-[8px] text-[#5a6478]/60 ml-auto">Se actualiza en eventos importantes</span>
          </div>
          <div className="font-serif text-xs text-[#c8d0dc]"><RichText>{memoria.resumen}</RichText></div>
        </div>
      ) : null}

      <div className="p-3 rounded-xl bg-[#3d8eff08] border border-[#3d8eff]/30">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="font-mono text-[10px] text-[#3d8eff] tracking-widest">INSTRUCCIONES GLOBALES PERMANENTES</div>
            <p className="font-mono text-[8px] text-[#5a6478]/60 mt-0.5">Aplican a TODAS las partidas, incluidas las nuevas</p>
          </div>
          <button onClick={() => { setEditingGlobal(!editingGlobal); setGlobalDraft(globalInstructions || ''); }}
            className="font-mono text-[9px] text-[#3d8eff] hover:underline">{editingGlobal ? 'Cancelar' : 'Editar'}</button>
        </div>
        {editingGlobal ? (
          <div className="space-y-2">
            <textarea value={globalDraft} onChange={(e) => setGlobalDraft(e.target.value)} rows={4}
              placeholder="Ej: 'Siempre narra en tono oscuro', 'Nunca uses humor absurdo'..."
              className="w-full bg-[#0a0c0f] border border-[#1e2530] rounded-lg px-3 py-2 font-serif text-xs text-[#eef2f8] placeholder-[#5a6478] outline-none focus:border-[#3d8eff]/40 resize-none leading-relaxed" />
            <button onClick={() => { setGlobalInstructions(globalDraft); setEditingGlobal(false); }}
              className="w-full py-1.5 rounded-lg bg-[#3d8eff20] border border-[#3d8eff]/30 font-mono text-[9px] text-[#3d8eff] hover:bg-[#3d8eff30] transition-all">
              Guardar instrucciones globales
            </button>
          </div>
        ) : (
          globalInstructions
            ? <div className="font-serif text-xs text-[#c8d0dc]"><RichText>{globalInstructions}</RichText></div>
            : <p className="font-serif italic text-xs text-[#5a6478]">Sin instrucciones globales. Haz clic en Editar.</p>
        )}
      </div>

      <div className="p-3 rounded-xl bg-[#0f1218] border border-[#1e2530]">
        <div className="flex items-center justify-between mb-2">
          <div className="font-mono text-[10px] text-[#5a6478] tracking-widest">NOTAS AL NARRADOR (ESTA PARTIDA)</div>
          <button onClick={() => { setEditingNotas(!editingNotas); setNotasDraft(memoria.notasLibres || ''); }}
            className="font-mono text-[9px] text-[#3d8eff] hover:underline">{editingNotas ? 'Cancelar' : 'Editar'}</button>
        </div>
        {editingNotas ? (
          <div className="space-y-2">
            <textarea value={notasDraft} onChange={(e) => setNotasDraft(e.target.value)} rows={4}
              placeholder="Notas adicionales para esta partida..."
              className="w-full bg-[#0a0c0f] border border-[#1e2530] rounded-lg px-3 py-2 font-serif text-xs text-[#eef2f8] placeholder-[#5a6478] outline-none focus:border-[#8b5cf6]/40 resize-none leading-relaxed" />
            <button onClick={() => { updateMemoriaNarrador({ notasLibres: notasDraft }); setEditingNotas(false); }}
              className="w-full py-1.5 rounded-lg bg-[#8b5cf620] border border-[#8b5cf6]/30 font-mono text-[9px] text-[#8b5cf6]">
              Guardar notas
            </button>
          </div>
        ) : (
          memoria.notasLibres
            ? <div className="font-serif text-xs text-[#c8d0dc]"><RichText>{memoria.notasLibres}</RichText></div>
            : <p className="font-serif italic text-xs text-[#5a6478]">Sin notas. Haz clic en Editar.</p>
        )}
      </div>

      <div className="p-3 rounded-xl bg-[#0f1218] border border-[#1e2530]">
        <div className="flex items-center justify-between mb-2">
          <div className="font-mono text-[10px] text-[#5a6478] tracking-widest">REGLAS DE LA PARTIDA</div>
          <button onClick={() => { setEditingReglas(!editingReglas); setReglasDraft(memoria.reglasDeLaPartida || ''); }}
            className="font-mono text-[9px] text-[#3d8eff] hover:underline">{editingReglas ? 'Cancelar' : 'Editar'}</button>
        </div>
        {editingReglas ? (
          <div className="space-y-2">
            <textarea value={reglasDraft} onChange={(e) => setReglasDraft(e.target.value)} rows={3}
              placeholder="Ej: 'La magia no existe', 'Tono oscuro y realista'..."
              className="w-full bg-[#0a0c0f] border border-[#1e2530] rounded-lg px-3 py-2 font-serif text-xs text-[#eef2f8] placeholder-[#5a6478] outline-none focus:border-[#8b5cf6]/40 resize-none leading-relaxed" />
            <button onClick={() => { updateMemoriaNarrador({ reglasDeLaPartida: reglasDraft }); setEditingReglas(false); }}
              className="w-full py-1.5 rounded-lg bg-[#8b5cf620] border border-[#8b5cf6]/30 font-mono text-[9px] text-[#8b5cf6]">
              Guardar reglas
            </button>
          </div>
        ) : (
          memoria.reglasDeLaPartida
            ? <div className="font-serif text-xs text-[#c8d0dc]"><RichText>{memoria.reglasDeLaPartida}</RichText></div>
            : <p className="font-serif italic text-xs text-[#5a6478]">Sin reglas definidas.</p>
        )}
      </div>

      <div className="p-3 rounded-xl bg-[#0f1218] border border-[#1e2530]">
        <div className="font-mono text-[10px] text-[#5a6478] tracking-widest mb-2">HECHOS CANÓNICOS ({hechosCanonicos.length})</div>
        <div className="flex gap-2 mb-3">
          <input value={newHecho} onChange={(e) => setNewHecho(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && newHecho.trim()) { updateMemoriaNarrador({ hechosCanonicos: [...hechosCanonicos, newHecho.trim()] }); setNewHecho(''); } }}
            placeholder="Nuevo hecho canónico..."
            className="flex-1 bg-[#0a0c0f] border border-[#1e2530] rounded-lg px-3 py-1.5 font-serif text-xs text-[#eef2f8] placeholder-[#5a6478] outline-none focus:border-[#8b5cf6]/40" />
          <button onClick={() => { if (!newHecho.trim()) return; updateMemoriaNarrador({ hechosCanonicos: [...hechosCanonicos, newHecho.trim()] }); setNewHecho(''); }}
            className="px-3 py-1.5 rounded-lg bg-[#8b5cf620] border border-[#8b5cf6]/30 font-mono text-[9px] text-[#8b5cf6]">
            <Plus size={12} />
          </button>
        </div>
        {hechosCanonicos.length === 0
          ? <p className="font-serif italic text-xs text-[#5a6478] text-center py-2">Sin hechos canónicos.</p>
          : (
            <div className="space-y-1.5">
              {hechosCanonicos.map((h: string, i: number) => (
                <div key={i} className="flex items-start gap-2 group">
                  <div className="w-1 h-1 rounded-full bg-[#8b5cf6] mt-2 flex-shrink-0" />
                  <span className="font-serif text-xs text-[#c8d0dc] flex-1 leading-relaxed">{h}</span>
                  <button onClick={() => updateMemoriaNarrador({ hechosCanonicos: hechosCanonicos.filter((_: string, idx: number) => idx !== i) })}
                    className="p-1 text-[#ff4444]/30 hover:text-[#ff4444] active:text-[#ff4444] transition-colors flex-shrink-0 touch-manipulation">
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
      </div>

      <div className="p-3 rounded-xl bg-[#0f1218] border border-[#1e2530]">
        <div className="font-mono text-[10px] text-[#5a6478] tracking-widest mb-2">RESUMEN</div>
        <div className="space-y-1">
          <InfoRow label="Turnos" value={run?.turnCount || 0} />
          <InfoRow label="NPCs" value={(run?.npcs || []).length} />
          <InfoRow label="Facciones" value={(run?.facciones || []).length} />
          <InfoRow label="Lugares explorados" value={(run?.exploredLocations || []).length} />
        </div>
      </div>
    </div>
  );
}

// ─── GOD MODE GAME ────────────────────────────────────────────────────────────

const GOD_INTERVENTIONS = [
  { id: 'plague', icon: Skull, label: 'Plaga', color: '#ff4444', action: '[INTERVENCIÓN: PLAGA] El dios decreta una plaga.' },
  { id: 'war', icon: Sword, label: 'Guerra', color: '#f5a623', action: '[INTERVENCIÓN: GUERRA] El dios enciende el fuego de la guerra.' },
  { id: 'fortune', icon: Sparkles, label: 'Fortuna', color: '#00d4a8', action: '[INTERVENCIÓN: FORTUNA] El dios derrama su gracia.' },
  { id: 'famine', icon: Wind, label: 'Hambruna', color: '#5a6478', action: '[INTERVENCIÓN: HAMBRUNA] El dios retira su favor.' },
  { id: 'storm', icon: Flame, label: 'Tormenta', color: '#8b5cf6', action: '[INTERVENCIÓN: TORMENTA] El dios desata los elementos.' },
  { id: 'vision', icon: Eye, label: 'Visión', color: '#3d8eff', action: '[INTERVENCIÓN: VISIÓN] El dios susurra una profecía.' },
];

function GodModeGame({
  run, isGenerating, history, textSizeClass,
  onSendAction, onExit, onConfirmExit, onCancelExit, showConfirmExit, isStreaming,
}: {
  run: any; isGenerating: boolean; history: NarrativeTurn[];
  textSizeClass: string; onSendAction: (text?: string) => void;
  onExit: () => void; onConfirmExit: () => void; onCancelExit: () => void;
  showConfirmExit: boolean; isStreaming: boolean;
}) {
  const [godInput, setGodInput] = useState('');
  const [selectedIntervention, setSelectedIntervention] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const year = run?.worldState?.ingameYear || run?.eraConfig?.year;
  const ingameDate = `Año ${year}`;
  const timeOfDay = run?.worldState?.timeOfDay || '';

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history.length, isStreaming]);

  const handleDecree = () => {
    const base = selectedIntervention ? GOD_INTERVENTIONS.find((i) => i.id === selectedIntervention)?.action || '' : '';
    const text = godInput.trim() ? `${base}${base ? ' ' : ''}${godInput.trim()}` : base || 'El dios observa en silencio.';
    onSendAction(text);
    setGodInput('');
    setSelectedIntervention(null);
  };

  return (
    <div className="h-screen w-full flex flex-col bg-[#0a0c0f] overflow-hidden">
      <div className="flex items-center justify-between px-6 py-3 border-b border-[#8b5cf6]/20 bg-[#0a0c0f]/95">
        <button onClick={onExit} className="text-[#5a6478] hover:text-[#eef2f8] transition-colors"><ArrowLeft size={16} /></button>
        <div className="text-center">
          <div className="flex items-center gap-2 justify-center">
            <Crown size={12} className="text-[#8b5cf6]" />
            <span className="font-mono text-xs text-[#8b5cf6] tracking-widest">MODO DIOS</span>
          </div>
          <div className="font-mono text-[10px] text-[#5a6478]">Año {year} · {run.eraConfig?.eraLabel || ''}</div>
        </div>
        <div className="font-mono text-[10px] text-[#5a6478]">{(run?.npcs || []).length} mortales</div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto pb-48">
        <div className="px-6 py-8 space-y-8 max-w-2xl mx-auto">
          {history.length === 0 && (
            <div className="text-center py-12 border border-dashed border-[#8b5cf6]/20 rounded-xl">
              <Crown size={24} className="text-[#8b5cf6]/40 mx-auto mb-3" />
              <p className="font-serif italic text-[#5a6478]">El mundo aguarda la primera intervención divina.</p>
            </div>
          )}
          <AnimatePresence initial={false}>
            {history.map((turn, i) => {
              const isLastTurn = i === history.length - 1;
              const isLoadingTurn = isLastTurn && isStreaming && !turn.text;
              return (
                <motion.div key={turn.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                  {turn.role === 'user' ? (
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-[#8b5cf6]/20 border border-[#8b5cf6]/30 flex items-center justify-center flex-shrink-0">
                        <Crown size={10} className="text-[#8b5cf6]" />
                      </div>
                      <div className="font-mono text-xs text-[#8b5cf6]/80 pt-1">{turn.text}</div>
                    </div>
                  ) : turn.role === 'narrator' ? (
                    isLoadingTurn ? (
                      <NarratorClock ingameDate={ingameDate} timeOfDay={timeOfDay} />
                    ) : turn.text ? (
                      <motion.p className={`font-serif ${textSizeClass} leading-relaxed text-[#c8d0dc]/90`}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }}>
                        {turn.text}
                      </motion.p>
                    ) : null
                  ) : null}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      <div className="border-t border-[#8b5cf6]/20 bg-[#0a0c0f]/95 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
            {GOD_INTERVENTIONS.map((intervention) => {
              const Icon = intervention.icon;
              const isSelected = selectedIntervention === intervention.id;
              return (
                <button key={intervention.id} onClick={() => setSelectedIntervention(isSelected ? null : intervention.id)}
                  className="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border font-mono text-xs transition-all"
                  style={{ borderColor: isSelected ? intervention.color + '60' : '#1e2530', background: isSelected ? intervention.color + '15' : '#0f1218', color: isSelected ? intervention.color : '#5a6478' }}>
                  <Icon size={12} />{intervention.label}
                </button>
              );
            })}
          </div>
          <div className="relative">
            <input value={godInput} onChange={(e) => setGodInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleDecree(); } }}
              disabled={isGenerating}
              placeholder={selectedIntervention ? 'Añade un decreto divino...' : 'Dicta tu decreto...'}
              className="w-full h-14 pl-5 pr-14 bg-[#0f1218] border border-[#8b5cf6]/20 rounded-xl font-serif text-base text-[#eef2f8] placeholder:text-[#2a3040] focus:outline-none focus:border-[#8b5cf6]/40 disabled:opacity-50" />
            <button onClick={handleDecree} disabled={isGenerating || (!godInput.trim() && !selectedIntervention)}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center bg-[#8b5cf6]/20 text-[#8b5cf6] transition-all active:scale-90 disabled:opacity-30">
              <Crown size={14} />
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showConfirmExit && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="bg-[#0f1218] border border-[#1e2530] rounded-2xl p-8 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-display font-bold text-xl mb-2">Salir del Modo Dios</h3>
              <p className="font-serif italic text-[#5a6478] mb-6 text-sm">El mundo seguirá esperando tu intervención.</p>
              <div className="flex gap-3">
                <button onClick={onConfirmExit} className="flex-1 py-3 rounded-xl font-mono text-sm border border-[#1e2530] text-[#5a6478]">Salir</button>
                <button onClick={onCancelExit} className="flex-1 py-3 rounded-xl font-mono text-sm border border-[#8b5cf6]/30 text-[#8b5cf6]">Continuar</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
