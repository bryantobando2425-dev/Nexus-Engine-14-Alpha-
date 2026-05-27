import type { ActiveRun } from './types';
import { deriveInitialAttributes, DEFAULT_BODY_PARTS } from './types';

function mkId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const DEFAULT_DESCRIPTORS = {
  estadoFisico: 'Saludable',
  condicionMental: 'Lúcido',
  combate: 'Sin entrenamiento',
  habilidadesSociales: 'Reservado',
  conocimiento: 'Básico',
  condicionSocial: 'Plebeyo',
  reputacionLocal: 'Desconocido',
  renombreGlobal: 'Anónimo',
  relacionesActivas: [] as string[],
};

/**
 * REGLA DE ADAPTACIÓN A EXPANSIONES:
 * Toma cualquier objeto de partida (de cualquier versión) y devuelve un ActiveRun
 * completamente válido, con todos los campos requeridos y valores coherentes.
 * Nunca lanza errores por campos faltantes — siempre aplica defaults seguros.
 */
export function migrateRun(raw: any): ActiveRun {
  if (!raw || typeof raw !== 'object') {
    throw new Error('El archivo no contiene datos de partida válidos.');
  }

  const character = raw.character || {};
  const socialClass = character.socialClass || 'Plebeyo';

  // Attributes: migrate existing or derive from social class
  const baseAttrs = deriveInitialAttributes(socialClass);
  const realisticAttributes = {
    ...baseAttrs,
    ...(raw.realisticAttributes || {}),
    // Ensure eraSkills array always exists
    eraSkills: raw.realisticAttributes?.eraSkills ?? [],
  };

  // World state: fill every required field
  const worldState = {
    season: 'desconocida',
    weather: 'despejado',
    timeOfDay: 'mañana',
    ingameYear: raw.eraConfig?.year ?? 1000,
    ingameDate: `Año ${raw.eraConfig?.year ?? 1000}`,
    ingameAge: character.age ?? 0,
    ...(raw.worldState ?? {}),
    // Always ensure currentLocation is a full object
    currentLocation: {
      name: 'Desconocido',
      description: '',
      type: 'exterior',
      ...(raw.worldState?.currentLocation ?? {}),
    },
  };

  // NPCs: ensure each has required fields
  const npcs = (raw.npcs ?? []).map((n: any) => ({
    name: n.name || 'Desconocido',
    status: n.status || 'vivo',
    ...n,
    id: n.id || mkId(),
    relationship: {
      type: 'conocido',
      emotionalCharge: 'neutral',
      keyMoments: [],
      ...(n.relationship ?? {}),
    },
  }));

  // Inventory: ensure each item has required fields
  const inventory = (raw.inventory ?? []).map((i: any) => ({
    name: i.name || 'Objeto',
    description: i.description || '',
    condition: i.condition || 'usado',
    ...i,
    id: i.id || mkId(),
  }));

  // Facciones: ensure each has required fields
  const facciones = (raw.facciones ?? []).map((f: any) => ({
    name: f.name || 'Facción',
    type: f.type || 'política',
    description: f.description || '',
    relationToPlayer: f.relationToPlayer || 'neutral',
    influenceLevel: f.influenceLevel || 'local',
    knownMembers: f.knownMembers ?? [],
    playerReputation: f.playerReputation ?? 50,
    ...f,
    id: f.id || mkId(),
  }));

  // Consequence queue: ensure each entry has required fields
  const consequenceQueue = (raw.consequenceQueue ?? []).map((c: any) => ({
    description: '',
    scheduledTurn: 5,
    sourceAction: '',
    resolved: false,
    ...c,
  }));

  return {
    runId: raw.runId || mkId(),
    gameId: raw.gameId || 'una-vida',
    playMode: raw.playMode || 'HUMANO',

    character: {
      name: 'Personaje Importado',
      age: 0,
      gender: '—',
      socialClass: 'Plebeyo',
      ...character,
      // Always ensure stats exist with defaults
      stats: {
        health: 100,
        energy: 100,
        hunger: 50,
        morale: 70,
        mentalHealth: 80,
        ...(character.stats ?? {}),
      },
    },

    eraConfig: {
      name: 'Era Desconocida',
      year: 1000,
      eraLabel: 'Era Desconocida',
      eraName: 'Era Desconocida',
      dangerLevel: 0.5,
      ...(raw.eraConfig ?? {}),
    },

    worldState,

    descriptors: {
      ...DEFAULT_DESCRIPTORS,
      condicionSocial: socialClass,
      ...(raw.descriptors ?? {}),
    },

    realisticAttributes,

    partesDelCuerpo: {
      ...DEFAULT_BODY_PARTS,
      ...(raw.partesDelCuerpo ?? {}),
    },

    narrativeHistory: raw.narrativeHistory ?? [],
    innerVoiceLog: raw.innerVoiceLog ?? [],
    emotionalClimate: raw.emotionalClimate ?? 'sereno',
    suggestedActions: raw.suggestedActions ?? [],
    secretsQueue: raw.secretsQueue ?? [],
    consequenceQueue,
    turnCount: raw.turnCount ?? 0,
    totalMinutesElapsed: raw.totalMinutesElapsed ?? 0,
    npcs,
    inventory,
    currency: {
      amount: 0,
      name: 'monedas',
      ...(raw.currency ?? {}),
    },
    personalHistory: raw.personalHistory ?? [],
    moments: raw.moments ?? [],
    facciones,
    memoriaNarrador: {
      notasLibres: '',
      reglasDeLaPartida: '',
      hechosCanonicos: [],
      resumen: '',
      ...(raw.memoriaNarrador ?? {}),
    },
    exploredLocations: raw.exploredLocations ?? [],
    traumas: raw.traumas ?? [],
    customSections: (raw.customSections ?? []).map((s: any) => ({
      id: s.id || mkId(),
      title: s.title || 'Sección',
      icon: s.icon || '',
      scope: s.scope || 'global',
      aiCreated: s.aiCreated ?? false,
      fields: (s.fields ?? []).map((f: any) => ({
        key: f.key || '',
        value: String(f.value ?? ''),
        type: f.type || 'text',
        aiManaged: f.aiManaged !== false,
      })),
    })),
    savedAt: raw.savedAt ?? Date.now(),
  };
}

/**
 * Valida que un objeto tenga los campos mínimos requeridos de una partida.
 * Devuelve { valid: true } o { valid: false, reason: string }
 */
export function validateRunData(data: any): { valid: boolean; reason?: string } {
  if (!data || typeof data !== 'object') {
    return { valid: false, reason: 'El archivo no contiene un objeto JSON válido.' };
  }
  if (!data.character && !data.eraConfig && !data.worldState && !data.runId) {
    return { valid: false, reason: 'El archivo no parece ser una partida de NEXUS ENGINE.' };
  }
  return { valid: true };
}
