const BASE = '/api';

export type AIProvider = 'gemini' | 'anthropic';

async function handleApiError(res: Response, fallback: string): Promise<never> {
  const err = await res.json().catch(() => ({}));
  if (res.status === 402 || err?.error === 'BUDGET_EXCEEDED') {
    throw new Error('BUDGET_EXCEEDED:' + (err?.message || ''));
  }
  throw new Error(err?.error || fallback);
}

export async function aiAssist(type: string, context: Record<string, any> = {}, aiProvider?: AIProvider): Promise<any> {
  const res = await fetch(`${BASE}/assist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, context, aiProvider }),
  });
  if (!res.ok) await handleApiError(res, 'AI assist failed');
  return res.json();
}

export async function generateNarrative(payload: Record<string, any>): Promise<any> {
  const res = await fetch(`${BASE}/narrative/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Narrative generation failed');
  return res.json();
}

export interface NarrativeTokenUsage {
  inputTokens: number;
  outputTokens: number;
  narrationInput?: number;
  narrationOutput?: number;
  stateInput?: number;
  stateOutput?: number;
  provider: AIProvider;
  estimated?: boolean;
}

export interface NarrativeStreamResult {
  narrative: string;
  timeAdvanced: number;
  eventType: string;
  legacyWeight: number;
  shouldGenerateImage: boolean;
  mood: string | null;
  characterStatChanges: any;
  attributeUpdates: Record<string, string | null> | null;
  descriptorUpdates: Record<string, string | null> | null;
  suggestedActions: string[];
  worldStateUpdates: any;
  newNPCs: any[];
  inventoryChanges: any;
  currencyChange: number | null;
  personalHistoryEvent: string | null;
  hiddenLayer: string | null;
  scheduledConsequence: { description: string; turnsFromNow: number } | null;
  ingameTime: { day?: number; month?: number; year?: number; timeOfDay?: string; dayOfWeek?: string } | null;
  skillUpdates: Array<{ name: string; grade: string; category?: string; description?: string; isNew?: boolean }> | null;
  psychologyUpdates: { fearAdded?: string; desireAdded?: string; traumaAdded?: string; fearResolved?: string } | null;
  npcUpdates: any[] | null;
  newFacciones: any[];
  factionUpdates: any[] | null;
  consequenceResolutions: Array<{ description: string; status: string; reason?: string; newDescription?: string; newTurnsFromNow?: number }> | null;
  characterFieldUpdates: { motherName?: string; fatherName?: string; birthPlace?: string; motherTongue?: string; religion?: string; currentDescription?: string } | null;
  customSectionUpdates?: any[] | null;
  fullStateSnapshot?: any | null;
  tokenUsage?: NarrativeTokenUsage | null;
}

export async function generateNarrativeStream(
  payload: Record<string, any>,
  onChunk: (text: string, fullSoFar: string) => void,
): Promise<NarrativeStreamResult> {
  const res = await fetch(`${BASE}/narrative/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) await handleApiError(res, 'Narrative stream failed');
  if (!res.body) throw new Error('No response body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    fullText += chunk;

    const sepIdx = fullText.indexOf('---META---');
    const displayText = sepIdx !== -1
      ? fullText.slice(0, sepIdx).trim()
      : fullText;

    onChunk(chunk, displayText);
  }

  const sepIdx = fullText.indexOf('---META---');
  let narrative = fullText.trim();
  let meta: any = {};

  if (sepIdx !== -1) {
    narrative = fullText.slice(0, sepIdx).trim();
    const metaPart = fullText.slice(sepIdx + 10).trim();
    try {
      const jsonMatch = metaPart.match(/\{[\s\S]*\}/);
      if (jsonMatch) meta = JSON.parse(jsonMatch[0]);
    } catch { meta = {}; }
  } else {
    const jsonMatch = fullText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.narrative) {
          narrative = parsed.narrative;
          meta = parsed;
        }
      } catch { }
    }
  }

  return {
    narrative,
    timeAdvanced: meta.timeAdvanced ?? 30,
    eventType: meta.eventType ?? 'action',
    legacyWeight: meta.legacyWeight ?? 0.3,
    shouldGenerateImage: meta.shouldGenerateImage ?? false,
    mood: meta.mood ?? null,
    characterStatChanges: meta.characterStatChanges ?? null,
    attributeUpdates: meta.attributeUpdates ?? null,
    descriptorUpdates: meta.descriptorUpdates ?? null,
    suggestedActions: meta.suggestedActions ?? [],
    worldStateUpdates: meta.worldStateUpdates ?? null,
    newNPCs: meta.newNPCs ?? [],
    inventoryChanges: meta.inventoryChanges ?? null,
    currencyChange: meta.currencyChange ?? null,
    personalHistoryEvent: meta.personalHistoryEvent ?? null,
    hiddenLayer: meta.hiddenLayer ?? null,
    scheduledConsequence: meta.scheduledConsequence ?? null,
    ingameTime: meta.ingameTime ?? null,
    skillUpdates: meta.skillUpdates ?? null,
    psychologyUpdates: meta.psychologyUpdates ?? null,
    npcUpdates: meta.npcUpdates ?? null,
    newFacciones: meta.newFacciones ?? [],
    factionUpdates: meta.factionUpdates ?? null,
    consequenceResolutions: meta.consequenceResolutions ?? null,
    characterFieldUpdates: meta.characterFieldUpdates ?? null,
    customSectionUpdates: meta.customSectionUpdates ?? meta.customSectionsUpdate ?? null,
    fullStateSnapshot: meta.fullStateSnapshot ?? meta.stateSnapshot ?? meta.fullState ?? null,
    tokenUsage: meta.tokenUsage ?? null,
  };
}

export async function saveStateToServer(playerId: string, state: Record<string, any>): Promise<void> {
  try {
    await fetch(`${BASE}/state/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, state }),
    });
  } catch {}
}

export async function loadStateFromServer(playerId: string): Promise<Record<string, any> | null> {
  try {
    const res = await fetch(`${BASE}/state/load/${encodeURIComponent(playerId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.ok ? data.state : null;
  } catch {
    return null;
  }
}

export async function generateStateUpdate(payload: Record<string, any>): Promise<any> {
  const res = await fetch(`${BASE}/narrative/state-update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await handleApiError(res, 'State update failed');
  return res.json();
}

export async function suggestFieldValue(payload: { fieldPath: string; currentValue: any; suggestion: string; context: any; aiProvider?: AIProvider }): Promise<{ newValue: any; explanation: string; tokenUsage?: NarrativeTokenUsage }> {
  const res = await fetch(`${BASE}/narrative/suggest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await handleApiError(res, 'Suggest failed');
  return res.json();
}

export async function suggestSection(payload: {
  description: string;
  mode?: 'section' | 'field';
  sectionTitle?: string;
  context: any;
  aiProvider?: AIProvider;
}): Promise<any> {
  const res = await fetch(`${BASE}/narrative/suggest-section`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await handleApiError(res, 'Suggest section failed');
  return res.json();
}

export async function updateAIMemory(payload: {
  currentResumen: string;
  recentEvents: string[];
  character: any;
  worldState: any;
  era: any;
  memoriaNarrador: any;
  aiProvider?: AIProvider;
}): Promise<{ resumen: string; tokenUsage?: NarrativeTokenUsage }> {
  const res = await fetch(`${BASE}/narrative/memory-update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await handleApiError(res, 'Memory update failed');
  return res.json();
}

export async function generateDream(payload: {
  character: any;
  emotionalClimate: string;
  innerVoiceLog: string[];
  recentEvents: string[];
  era: any;
  aiProvider?: AIProvider;
}): Promise<{ dream: string; tokenUsage?: NarrativeTokenUsage }> {
  const res = await fetch(`${BASE}/narrative/dream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    if (res.status === 402) await handleApiError(res, 'Dream failed');
    return { dream: 'Un sueño que se disuelve al despertar...' };
  }
  return res.json();
}
