export type PlayMode = 'HUMANO' | 'DIOS';

export type EmotionalClimate =
  | 'sereno'
  | 'ansioso'
  | 'de_duelo'
  | 'euforico'
  | 'entumecido'
  | 'desesperado'
  | 'esperanzador'
  | 'traumatizado';

export interface Descriptor {
  value: string;
  tooltip?: string;
}

// ─── SISTEMA DE ATRIBUTOS REALISTAS (SAD v4.2) ───────────────────────────────

export type IntegridadFisica = 'Impecable' | 'Magullado' | 'Lesionado' | 'Lisiado' | 'Agonizante';
export type ReservaMetabolica = 'Saciado' | 'Nutrido' | 'Débil' | 'Famélico' | 'Desfallecido';
export type CargaCognitiva = 'Alerta' | 'Nublado' | 'Somnoliento' | 'Agotado' | 'Delirante';
export type UmbralDeEstres = 'Imperturbable' | 'Tenso' | 'Ansioso' | 'En Pánico' | 'Colapsado';

export type AptitudMotriz = 'Torpe' | 'Funcional' | 'Atlético' | 'Excepcional';
export type IntelectoAplicado = 'Limitado' | 'Promedio' | 'Sagaz' | 'Genio';
export type PresenciaSocial = 'Invisible' | 'Común' | 'Carismático' | 'Imponente';
export type EstatusDeCasta = 'Paria' | 'Plebeyo' | 'Influyente' | 'Noble/Elite';

export type GradoDeAutonomia = 'Ignorante' | 'Aprendiz' | 'Competente' | 'Experto' | 'Maestro';

export interface EraSkill {
  name: string;
  grade: GradoDeAutonomia;
  category: 'Supervivencia' | 'Oficios' | 'Artes Bélicas' | 'Erudición';
  description?: string;
}

export interface RealisticAttributes {
  integridadFisica: IntegridadFisica;
  reservaMetabolica: ReservaMetabolica;
  cargaCognitiva: CargaCognitiva;
  umbralDeEstres: UmbralDeEstres;
  aptitudMotriz: AptitudMotriz;
  intelectoAplicado: IntelectoAplicado;
  presenciaSocial: PresenciaSocial;
  estatusDeCasta: EstatusDeCasta;
  eraSkills: EraSkill[];
}

export const ATTRIBUTE_TUTORIALS: Record<keyof Omit<RealisticAttributes, 'eraSkills'>, { label: string; tutorial: string }> = {
  integridadFisica: {
    label: 'Integridad Física',
    tutorial: 'Tu cuerpo es el primer instrumento de supervivencia. En esta era, una lesión no tratada puede convertirse en gangrena. Un hueso roto mal curado deja cojo de por vida. Tu estado físico determina si puedes trabajar, huir, luchar o simplemente cargar agua. Los sanadores son escasos y caros; el descanso, un lujo que pocos se permiten.',
  },
  reservaMetabolica: {
    label: 'Reserva Metabólica',
    tutorial: 'El hambre no es solo malestar — es un enemigo que embota la mente, debilita los músculos y corroe la voluntad. En épocas de escasez, pasar de "Nutrido" a "Famélico" puede ocurrir en días. Un personaje "Desfallecido" pierde capacidad de razonar con claridad y está dispuesto a hacer cosas que contradicen sus valores más profundos.',
  },
  cargaCognitiva: {
    label: 'Carga Cognitiva',
    tutorial: 'La mente tiene un límite. Demasiado estrés, demasiadas decisiones, demasiado poco sueño... y el pensamiento se vuelve lento, neblinoso. En estado "Agotado" o "Delirante", percibes mal las intenciones de los demás y los detalles cruciales se te escapan. El sueño es la única cura real.',
  },
  umbralDeEstres: {
    label: 'Umbral de Estrés',
    tutorial: 'Cada era tiene sus propias formas de romper a las personas. La guerra, la pérdida, la injusticia, el terror. Tu umbral de estrés determina si actúas con lógica fría o por puro instinto animal. Un personaje "En Pánico" toma decisiones que arruinan relaciones. "Colapsado" significa que el cuerpo mismo se niega a obedecer.',
  },
  aptitudMotriz: {
    label: 'Aptitud Motriz',
    tutorial: 'La fuerza bruta, la gracia en el movimiento, la coordinación entre mano y ojo. En esta época, el cuerpo es tu herramienta principal. Un campesino "Torpe" lucha más para arar el campo. Un soldado "Excepcional" sobrevive combates que matan a los demás. La aptitud motriz se forja con años de trabajo físico o entrenamiento.',
  },
  intelectoAplicado: {
    label: 'Intelecto Aplicado',
    tutorial: 'No es solo la capacidad de leer o calcular — es la habilidad de entender sistemas: cómo funcionan las leyes, los mercados, los cuerpos humanos. En una era sin educación universal, un intelecto "Sagaz" puede abrir puertas que el dinero no puede comprar. Un "Genio" en la época equivocada puede ser quemado en la hoguera o coronado rey.',
  },
  presenciaSocial: {
    label: 'Presencia Social',
    tutorial: 'Hay personas que entran a una sala y el aire cambia. Tu presencia social no es solo carisma — es la forma en que los demás te perciben en los primeros segundos, si te dan crédito antes de que hables, si sienten que pueden seguirte o si te ignoran. En una sociedad donde la primera impresión puede decidir tu destino, esto vale tanto como la espada.',
  },
  estatusDeCasta: {
    label: 'Estatus de Casta/Clase',
    tutorial: 'Naciste en algún lugar de la jerarquía — Siervo, Villano, Burgués, Noble, Clérigo. Ese lugar define qué puertas están abiertas. Un "Paria" no puede entrar a ciertos edificios ni presentar quejas ante la ley. Un "Noble/Elite" tiene crédito antes de abrir la boca. Este atributo puede cambiar, pero hacerlo es una empresa extraordinariamente difícil.',
  },
};

// ─── SISTEMA DE PARTES DEL CUERPO ────────────────────────────────────────────

export type EstadoParteDelCuerpo = 'Sano' | 'Magullado' | 'Herido' | 'Fracturado' | 'Inutilizado';

export interface PartesDelCuerpo {
  cabeza: EstadoParteDelCuerpo;
  torso: EstadoParteDelCuerpo;
  brazoDerecho: EstadoParteDelCuerpo;
  brazoIzquierdo: EstadoParteDelCuerpo;
  piernaDerecha: EstadoParteDelCuerpo;
  piernaIzquierda: EstadoParteDelCuerpo;
}

// ─── DESCRIPTORES Y ESTADO ────────────────────────────────────────────────────

export interface CharacterDescriptors {
  estadoFisico: string;
  condicionMental: string;
  combate: string;
  habilidadesSociales: string;
  conocimiento: string;
  condicionSocial: string;
  reputacionLocal: string;
  renombreGlobal: string;
  relacionesActivas: string[];
}

export interface NarrativeTurn {
  id: string;
  role: 'user' | 'narrator' | 'dream' | 'perspective';
  text: string;
  imageUrl?: string;
  imagePrompt?: string;
  ingameDate?: string;
  mood?: string;
  eventType?: string;
  legacyWeight?: number;
  timestamp: number;
  inputType?: 'action' | 'speak' | 'observe' | 'think' | 'free';
  hiddenLayer?: string;
  tags?: { people?: string[]; location?: string; emotionalWeight?: number; themes?: string[] };
  tokenUsage?: {
    provider: 'gemini' | 'anthropic';
    inputTokens: number;
    outputTokens: number;
    narrationInput?: number;
    narrationOutput?: number;
    stateInput?: number;
    stateOutput?: number;
    estimated?: boolean;
  };
}

export interface WorldState {
  currentLocation: { name: string; description: string; type?: string };
  season: string;
  weather: string;
  timeOfDay: string;
  ingameYear: number;
  ingameDate: string;
  ingameDay?: number;
  ingameMonth?: number;
  ingameAge: number;
  politicalClimate?: string;
  localPolitics?: string;
  globalPolitics?: string;
  localAuthority?: string;
  activeConflicts?: string[];
  economy?: string;
  economyDetails?: string;
  tradeGoods?: string;
  religion?: string;
  religiousInstitutions?: string;
  religiousFestivals?: string;
  activeEvents?: string[];
  worldHistory?: Array<{ year: number; description: string }>;
  geography?: string;
  fauna?: string;
  destination?: string;
  dayOfWeek?: string;
  temperature?: string;
  moonPhase?: string;
}

export type NPCFamilyRole = 'madre' | 'padre' | 'hermano' | 'hermana' | 'hijo' | 'hija' | 'abuelo' | 'abuela' | 'tío' | 'tía' | 'primo' | 'prima' | 'cónyuge' | 'pareja' | 'ninguno';

export type EmotionalCharge = 'positiva' | 'negativa' | 'tensa' | 'neutral';

export interface NPCCard {
  id: string;
  name: string;
  estimatedAge?: number;
  gender?: string;
  socialClass?: string;
  occupation?: string;
  lastKnownLocation?: string;
  physicalDescription?: string;
  descriptors?: Partial<CharacterDescriptors>;
  relationship?: {
    type: string;
    emotionalCharge: string;
    emotionalChargeType?: EmotionalCharge;
    descriptor?: string;
    keyMoments: string[];
    lastAttitude?: string;
    interactionHistory?: string[];
    trustLevel?: number;
    familyRole?: NPCFamilyRole;
  };
  knownInventory?: string[];
  knownMotivations?: string;
  knownFears?: string;
  knownHistory?: string;
  knownSecrets?: string[];
  status: 'vivo' | 'muerto' | 'desaparecido';
  deathDetails?: string;
  portraitUrl?: string;
  portraitSilhouette?: boolean;
  isAnimal?: boolean;
  backstory?: string;
  secrets?: string[];
}

export interface InventoryItem {
  id: string;
  name: string;
  description: string;
  condition: 'nuevo' | 'usado' | 'deteriorado' | 'roto';
  isSpecial?: boolean;
  eraOrigin?: string;
  weight?: number;
  weightUnit?: string;
  quantity?: number;
  isWorn?: boolean;
  wornSlot?: 'cabeza' | 'torso' | 'piernas' | 'pies' | 'manos' | 'cuello' | 'otro';
  category?: 'ropa' | 'arma' | 'herramienta' | 'comida' | 'documento' | 'joya' | 'otro';
}

export interface Faccion {
  id: string;
  name: string;
  type: 'política' | 'religiosa' | 'militar' | 'criminal' | 'comercial' | 'social' | 'otra';
  description: string;
  relationToPlayer: 'aliado' | 'neutral' | 'hostil' | 'desconocido';
  influenceLevel: 'local' | 'regional' | 'nacional' | 'global';
  knownMembers: string[];
  knownGoals?: string;
  playerReputation: number;
  discoveredAt?: string;
  emblem?: string;
  sede?: string;
  leaderKnown?: string;
  size?: 'pequeña' | 'mediana' | 'grande' | 'masiva';
  foundingYear?: number;
  slogan?: string;
  values?: string;
  norms?: string;
  taboos?: string;
  rituals?: string;
  hierarchy?: string;
  treatmentOfOutsiders?: string;
  territory?: string;
  resources?: string;
  currentSituation?: string;
  internalConflicts?: string;
  relationsWithOtherFactions?: string;
  history?: Array<{ year: number; event: string }>;
}

export interface MemoriaNarrador {
  notasLibres: string;
  reglasDeLaPartida: string;
  hechosCanonicos: string[];
  resumen?: string;
}

export interface ActiveRun {
  runId: string;
  gameId: string;
  aiProvider?: 'gemini' | 'anthropic';
  playMode: PlayMode;
  character: Record<string, any>;
  eraConfig: Record<string, any>;
  worldState: WorldState;
  descriptors: CharacterDescriptors;
  realisticAttributes: RealisticAttributes;
  partesDelCuerpo?: PartesDelCuerpo;
  narrativeHistory: NarrativeTurn[];
  innerVoiceLog: string[];
  emotionalClimate: EmotionalClimate;
  suggestedActions: string[];
  secretsQueue: string[];
  consequenceQueue: Array<{ description: string; scheduledTurn: number; sourceAction: string; resolved?: boolean }>;
  turnCount: number;
  totalMinutesElapsed: number;
  npcs: NPCCard[];
  inventory: InventoryItem[];
  currency: { amount: number; name: string; context?: string };
  personalHistory: Array<{ date: string; year?: number; month?: number; day?: number; description: string; emotionalWeight: number; isClosed?: boolean }>;
  moments: Array<{ imageUrl?: string; date: string; context: string }>;
  facciones: Faccion[];
  memoriaNarrador: MemoriaNarrador;
  exploredLocations: Array<{ name: string; description: string; visitedAt: string }>;
  traumas?: Array<{ description: string; acquiredAt: string; resolved?: boolean }>;
  savedAt?: number;
  endCause?: string;
  endedAt?: number;
}

export interface GameConfig {
  id: string;
  name: string;
  tagline: string;
  description: string;
  status: 'playable' | 'locked';
  backgroundGradient: string;
  accentColor: string;
  narrativePersonality: string;
  defaultVoice: string;
  allowsGodMode: boolean;
}

export interface WorldBuilderConfig {
  id: string;
  name: string;
  eraLabel: string;
  yearRange: [number, number];
  geography: string;
  techLevel: string;
  politicalSystem: string;
  religion: string;
  economy: string;
  languages: string;
  fauna: string;
  specialRules: {
    magic: boolean;
    magicType?: string;
    uniqueDiseases?: Array<{ name: string; description: string; transmission: string }>;
    customRules?: string[];
  };
  dangerLevel: number;
  predefinedEvents: Array<{ year: number; description: string }>;
  freeNotes: string;
  currency?: { name: string; type: string };
  moneyInequalityLevel?: number;
  createdAt: number;
}

export interface AppSettings {
  aiProvider: 'gemini' | 'anthropic';
  explicitMode: boolean;
  explicitSubToggles: {
    violence: boolean;
    language: boolean;
    sexual: boolean;
    torture: boolean;
    substances: boolean;
    psychologicalTrauma: boolean;
  };
  showNpcDescriptors: boolean;
  otherPerspectives: boolean;
  defaultVoice: 'third_person' | 'first_person' | 'world_speaks';
  textSize: 'sm' | 'md' | 'lg';
  imageGenEnabled: boolean;
  subjectiveTime: boolean;
  narrativeIntensity: 'minima' | 'normal' | 'extensa' | 'epica';
  narrativeRhythm: 'frenetico' | 'normal' | 'pausado' | 'contemplativo';
}

export function deriveInitialAttributes(socialClass: string): RealisticAttributes {
  const eliteClasses = ['Noble', 'Rey', 'Aristócrata', 'Patricio', 'Gobernante', 'Noble/Elite', 'Élite'];
  const midClasses = ['Mercader', 'Burgués', 'Clérigo', 'Intelectual', 'Profesional', 'Empresario'];
  const highPhysicalClasses = ['Soldado', 'Caballero', 'Militar'];

  let estatusDeCasta: EstatusDeCasta = 'Plebeyo';
  let aptitudMotriz: AptitudMotriz = 'Funcional';
  let intelectoAplicado: IntelectoAplicado = 'Promedio';
  let presenciaSocial: PresenciaSocial = 'Común';

  if (eliteClasses.some(c => socialClass.includes(c))) {
    estatusDeCasta = 'Noble/Elite';
    presenciaSocial = 'Imponente';
    intelectoAplicado = 'Sagaz';
  } else if (midClasses.some(c => socialClass.includes(c))) {
    estatusDeCasta = 'Influyente';
    intelectoAplicado = 'Sagaz';
    presenciaSocial = 'Carismático';
  } else if (socialClass.includes('Esclavo') || socialClass.includes('Paria') || socialClass.includes('Marginado') || socialClass.includes('Siervo')) {
    estatusDeCasta = 'Paria';
    presenciaSocial = 'Invisible';
  } else if (highPhysicalClasses.some(c => socialClass.includes(c))) {
    aptitudMotriz = 'Atlético';
  }

  return {
    integridadFisica: 'Impecable',
    reservaMetabolica: 'Saciado',
    cargaCognitiva: 'Alerta',
    umbralDeEstres: 'Imperturbable',
    aptitudMotriz,
    intelectoAplicado,
    presenciaSocial,
    estatusDeCasta,
    eraSkills: [],
  };
}

export const DEFAULT_BODY_PARTS: PartesDelCuerpo = {
  cabeza: 'Sano',
  torso: 'Sano',
  brazoDerecho: 'Sano',
  brazoIzquierdo: 'Sano',
  piernaDerecha: 'Sano',
  piernaIzquierda: 'Sano',
};

export const MESES_MEDIEVALES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

export function formatIngameDate(year: number, month?: number, day?: number): string {
  if (day && month) return `${day} de ${MESES_MEDIEVALES[(month - 1) % 12]}, ${year}`;
  if (month) return `${MESES_MEDIEVALES[(month - 1) % 12]} de ${year}`;
  return `Año ${year}`;
}

export const FAMILY_ROLES: NPCFamilyRole[] = ['madre', 'padre', 'hermano', 'hermana', 'hijo', 'hija', 'abuelo', 'abuela', 'tío', 'tía', 'primo', 'prima', 'cónyuge', 'pareja'];

export function isFamilyRole(role?: string): boolean {
  if (!role) return false;
  return FAMILY_ROLES.includes(role as NPCFamilyRole) ||
    ['madre', 'padre', 'hermano', 'hermana', 'hijo', 'hija', 'familiar', 'family'].some(r => role.toLowerCase().includes(r));
}
