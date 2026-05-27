import { Router, type IRouter } from "express";
import { jsonrepair } from "jsonrepair";
import {
  generateWithProvider, resolveAIProvider, streamWithProvider,
  isProviderBudgetExceeded, estimateTokens, type AIProvider, type TokenUsage,
} from "../aiProviders";

const router: IRouter = Router();

function budgetExceededResponse(provider: AIProvider): object {
  const providerName = provider === "anthropic" ? "Anthropic (Claude)" : "Google Gemini";
  const otherProvider = provider === "anthropic" ? "Gemini" : "Claude";
  return {
    error: "BUDGET_EXCEEDED",
    provider,
    otherProvider: provider === "anthropic" ? "gemini" : "anthropic",
    message: `El límite de uso de ${providerName} se ha agotado. Puedes cambiar al proveedor ${otherProvider} desde el Editor (pestaña IA) o desde Configuración.`,
  };
}

function safeParseJSON(raw: string, label: string): any {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error(`[${label}] No JSON block found. Raw (300 chars):`, raw.slice(0, 300));
    return {};
  }
  try {
    return JSON.parse(jsonMatch[0]);
  } catch (e1) {
    try {
      const repaired = jsonrepair(jsonMatch[0]);
      const result = JSON.parse(repaired);
      console.warn(`[${label}] JSON repaired successfully (was broken: ${(e1 as Error).message})`);
      return result;
    } catch (e2) {
      console.error(`[${label}] JSON repair also failed. Original error: ${(e1 as Error).message}. Repair error: ${(e2 as Error).message}. Raw (500):`, raw.slice(0, 500));
      return {};
    }
  }
}

// ─── PASO 1: CONTROL DE CONTEXTO — LÍMITES OBLIGATORIOS ─────────────────────
// El sistema NUNCA enviará historia completa a la IA.
// Solo se usa historial reciente limitado + memoria resumida + estado actual.
const RECENT_TURNS_LIMIT = 2;
const MAX_NPCS_IN_CONTEXT = 20;
const MAX_FACCIONES_IN_CONTEXT = 12;

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function getVoiceInstructions(voice: string): string {
  const instructions: Record<string, string> = {
    third_person: "Narrate in third person. You are an omniscient author watching the player's character. Use 'él/ella/elle' based on character gender. Be literary, precise, and consequential.",
    first_person: "Narrate in second person present tense in Spanish. You ARE the player's lived experience. 'Caminas hacia la taberna. Sientes el peso de tu espada.' Make it visceral and immediate.",
    world_speaks: "The world narrates itself through found objects: diary entries, letters, graffiti on walls, songs overheard. Never narrate directly — always through artifacts and fragments of the world. In Spanish.",
    god_mode: "You are briefing an omniscient deity who observes the mortal world from above. Speak upward, formally, as if presenting a divine report. 'Vuestro sujeto ha entrado al mercado. Tres facciones observan. Las consecuencias se aproximan.' In Spanish.",
  };
  return instructions[voice] || instructions.third_person;
}

// ─── PASO 2: JSON SCHEMA DE ACTUALIZACIÓN DE ESTADO (constante compartida) ──
// Se usa en los prompts de actualización de estado para que la IA sepa el formato exacto.
const STATE_UPDATE_JSON_SCHEMA = `---META---
{
  "timeAdvanced": <minutos como entero, típicamente 15-180; para saltos temporales usar el total en minutos>,
  "ingameTime": {
    "day": <1-31 o null si no cambia>,
    "month": <1-12 o null si no cambia>,
    "year": <año o null si no cambia>,
    "ingameDate": "<fecha completa visible o null>",
    "timeOfDay": "<mañana|mediodía|tarde|noche|madrugada o null>",
    "dayOfWeek": "<lunes|martes|miércoles|jueves|viernes|sábado|domingo o null>"
  },
  "eventType": "<uno de: action, discovery, npc_encounter, location_visit, rest, travel, conflict, personal_moment, birth, time_jump>",
  "legacyWeight": <0.0-1.0, cuán significativo/memorable es este momento>,
  "shouldGenerateImage": <true si es un momento visualmente impactante o históricamente significativo>,
  "mood": "<tono emocional actual: sereno, ansioso, de_duelo, euforico, entumecido, desesperado, esperanzador, traumatizado>",
  "characterStatChanges": {
    "health": <-15 a +5 o null>,
    "energy": <-25 a +25 o null>,
    "hunger": <-15 a +10 o null>,
    "morale": <-20 a +15 o null>,
    "mentalHealth": <-15 a +10 o null>
  },
  "attributeUpdates": {
    "integridadFisica": "<Impecable|Magullado|Lesionado|Lisiado|Agonizante o null>",
    "reservaMetabolica": "<Saciado|Nutrido|Débil|Famélico|Desfallecido o null>",
    "cargaCognitiva": "<Alerta|Nublado|Somnoliento|Agotado|Delirante o null>",
    "umbralDeEstres": "<Imperturbable|Tenso|Ansioso|En Pánico|Colapsado o null>",
    "aptitudMotriz": "<Torpe|Funcional|Atlético|Excepcional o null>",
    "intelectoAplicado": "<Limitado|Promedio|Sagaz|Genio o null>",
    "presenciaSocial": "<Invisible|Común|Carismático|Imponente o null>",
    "estatusDeCasta": "<Paria|Plebeyo|Influyente|Noble/Elite o null>"
  },
  "descriptorUpdates": {
    "estadoFisico": "<estado físico actual: Saludable|Cansado|Lesionado|Enfermo|Agonizante o null>",
    "condicionMental": "<condición mental: Lúcido|Distraído|Confundido|Traumatizado|Estable o null>",
    "combate": "<capacidad de combate observable: Sin entrenamiento|Aprendiz|Competente|Peligroso o null>",
    "habilidadesSociales": "<habilidades sociales observadas: Torpe|Reservado|Afable|Persuasivo|Carismático o null>",
    "conocimiento": "<nivel de conocimiento general: Analfabeto|Básico|Instruido|Erudito o null>",
    "reputacionLocal": "<reputación en el área actual o null>",
    "renombreGlobal": "<fama o notoriedad más allá del área local o null>",
    "condicionSocial": "<condición social percibida por otros o null>"
  },
  "skillUpdates": [
    {
      "name": "<nombre habilidad>",
      "grade": "<Ignorante|Aprendiz|Competente|Experto|Maestro>",
      "category": "<Supervivencia|Oficios|Artes Bélicas|Erudición>",
      "description": "<breve descripción situacional o null>",
      "isNew": <true si es una habilidad nueva, false si actualiza existente>
    }
  ],
  "psychologyUpdates": {
    "fearAdded": "<nuevo miedo adquirido por experiencia o null>",
    "desireAdded": "<nuevo deseo profundo o null>",
    "traumaAdded": "<trauma psicológico nuevo o null>",
    "fearResolved": "<miedo superado o null>"
  },
  "suggestedActions": ["Acción contextual 1", "Acción contextual 2", "Acción contextual 3", "Acción contextual 4"],
  "worldStateUpdates": {
    "currentLocation": {
      "name": "<nombre del lugar específico actual>",
      "territory": "<territorio o reino de mayor nivel o null>",
      "region": "<ciudad, comarca o provincia o null>",
      "description": "<descripción narrativa del lugar>",
      "sensoryDescription": "<sonidos, olores, texturas, luz o null>",
      "type": "<interior|exterior|ciudad|aldea|campo|bosque|costa|montaña|desierto|río|mar>",
      "climate": "<clima específico o null>",
      "fauna": "<animales presentes o null>",
      "geographyDetails": "<detalles geográficos o null>"
    },
    "season": "... or null",
    "weather": "... or null",
    "timeOfDay": "... or null",
    "temperature": "... or null",
    "moonPhase": "... or null",
    "politicalClimate": "... or null",
    "localPolitics": "... or null",
    "globalPolitics": "... or null",
    "localAuthority": "... or null",
    "religion": "... or null",
    "religiousInstitutions": "... or null",
    "religiousFestivals": "... or null",
    "economy": "... or null",
    "economyDetails": "... or null",
    "tradeGoods": "... or null",
    "geography": "... or null",
    "fauna": "... or null",
    "activeEventsAdd": ["Nuevo evento activo"] or null,
    "historyAdd": {"year": <número>, "description": "..."} or null,
    "destination": "... or null"
  },
  "newNPCs": [
    {
      "name": "<nombre del NUEVO personaje>",
      "estimatedAge": <entero o null>,
      "gender": "<masculino|femenino|otro o null>",
      "occupation": "<ocupación apropiada a la era o null>",
      "socialClass": "<clase social específica de la era o null>",
      "physicalDescription": "<descripción física concreta y sensorial o null>",
      "lastKnownLocation": "<ubicación donde fue conocido o null>",
      "backstory": "<trasfondo que el personaje lógicamente conocería o null>",
      "status": "<vivo|muerto|desaparecido>",
      "relationship": {
        "type": "<tipo de relación>",
        "familyRole": "<madre|padre|hermano|hermana|hijo|hija|abuelo|abuela|tío|tía|primo|prima|cónyuge|pareja|ninguno>",
        "emotionalCharge": "<descripción narrativa de la carga emocional>",
        "emotionalChargeType": "<positiva|negativa|tensa|neutral>",
        "trustLevel": <0-100>,
        "keyMoments": ["<primer momento clave si hay>"]
      },
      "knownMotivations": "<motivaciones visibles o null>",
      "knownFears": "<miedos observados o null>"
    }
  ],
  "npcUpdates": [
    {
      "name": "<nombre exacto del NPC — SOLO para NPCs ya conocidos>",
      "statusUpdate": "<vivo|muerto|desaparecido o null>",
      "deathDetails": "<causa de muerte o null>",
      "locationUpdate": "<nueva ubicación conocida o null>",
      "relationUpdate": {
        "emotionalCharge": "<descripción emocional actualizada o null>",
        "emotionalChargeType": "<positiva|negativa|tensa|neutral o null>",
        "trustLevel": <0-100 o null>,
        "lastAttitude": "<actitud más reciente o null>",
        "keyMomentAdd": "<momento clave nuevo o null>",
        "interactionAdd": "<nueva entrada de historial o null>"
      },
      "motivationsUpdate": "<motivaciones actualizadas o null>",
      "fearsUpdate": "<miedos actualizados o null>",
      "secretAdd": "<nuevo secreto descubierto o null>",
      "knownConditionsUpdate": "<condición física/mental conocida o null>"
    }
  ],
  "newFacciones": [
    {
      "name": "<nombre de la NUEVA facción>",
      "type": "<política|religiosa|militar|criminal|comercial|social|otra>",
      "description": "<descripción de la organización coherente con la era>",
      "relationToPlayer": "<aliado|neutral|hostil|desconocido>",
      "influenceLevel": "<local|regional|nacional|global>",
      "knownMembers": ["<miembro conocido si hay>"],
      "knownGoals": "<objetivos conocidos o null>",
      "playerReputation": <0-100, 50 por defecto>,
      "sede": "<sede o cuartel general conocido o null>",
      "leaderKnown": "<nombre del líder si se conoce o null>",
      "size": "<pequeña|mediana|grande|masiva o null>",
      "foundingYear": <año de fundación si se conoce o null>,
      "values": "<valores centrales o null>",
      "territory": "<territorio que controla o null>",
      "currentSituation": "<situación actual o null>"
    }
  ],
  "factionUpdates": [
    {
      "name": "<nombre exacto — SOLO para facciones ya registradas>",
      "reputationChange": <número -20 a +20 o null>,
      "currentSituationUpdate": "<situación actual actualizada o null>",
      "memberAdded": "<nombre de nuevo miembro conocido o null>",
      "relationToPlayerUpdate": "<aliado|neutral|hostil|desconocido o null>"
    }
  ],
  "inventoryChanges": {
    "add": [{"name": "...", "description": "...", "condition": "nuevo", "category": "otro", "isSpecial": false}],
    "remove": ["nombre del objeto a eliminar"],
    "conditionUpdate": [{"name": "...", "newCondition": "<nuevo|usado|deteriorado|roto>"}]
  },
  "currencyChange": <número o null>,
  "personalHistoryEvent": "Descripción breve del evento para el historial" or null,
  "hiddenLayer": "Lo que realmente ocurre bajo la superficie que el personaje NO sabe. null si no aplica.",
  "scheduledConsequence": {"description": "Una consecuencia realista de esta acción", "turnsFromNow": <entero 3-20>} or null,
  "consequenceResolutions": [
    {
      "description": "<descripción original de la consecuencia>",
      "status": "<Resuelta|Cancelada|Modificada>",
      "reason": "<explicación breve>",
      "newDescription": "<nueva descripción si Modificada, null si no>",
      "newTurnsFromNow": <nuevo plazo si Modificada, null si no>
    }
  ],
  "characterFieldUpdates": {
    "motherName": "<nombre completo de la madre, SOLO en turno de nacimiento o si se descubre, null si no>",
    "fatherName": "<nombre completo del padre, SOLO en turno de nacimiento o si se descubre, null si no>",
    "birthPlace": "<nombre del lugar de nacimiento, SOLO en primer turno, null si no>",
    "motherTongue": "<lengua materna, SOLO en primer turno, null si no>",
    "religion": "<religión del personaje, SOLO si no estaba definida, null si no>",
    "currentDescription": "<descripción en tiempo presente de cómo luce y se siente el personaje ahora mismo>"
  },
  "customSectionUpdates": [
    { "sectionId": "<id exacto>", "sectionTitle": "<título>", "scope": "<global|character|world|map|npcs|facciones>", "fields": [{"key": "<campo>", "value": "<valor completo actualizado>", "type": "<text|number|list|state|progress|date|tags|table|columns>", "aiManaged": true}] }
  ],
  "customSectionsToCreate": [
    { "title": "<título descriptivo>", "icon": "<emoji>", "scope": "<global|character|world|map|npcs|facciones>", "fields": [{"key": "<nombre campo>", "value": "<valor inicial coherente>", "type": "<text|number|list|state|progress|date|tags|table|columns>", "aiManaged": true}], "aiCreated": true }
  ],
  "fullStateSnapshot": {
    "character": { "name": "...", "age": 0, "gender": "...", "socialClass": "...", "occupation": "...", "birthYear": 0, "birthPlace": "...", "motherName": "...", "fatherName": "...", "motherTongue": "...", "religion": "...", "appearance": { "skinTone": "...", "hairDescription": "...", "eyeColor": "...", "build": "...", "distinctiveFeatures": [] }, "stats": { "health": 100, "energy": 100, "hunger": 50, "morale": 70, "mentalHealth": 80 }, "fears": [], "desires": [], "beliefs": {} },
    "worldState": { "ingameYear": 0, "ingameDate": "...", "ingameDay": 1, "ingameMonth": 1, "timeOfDay": "mañana", "season": "...", "weather": "...", "currentLocation": { "name": "...", "region": "...", "territory": "...", "description": "...", "type": "..." }, "localPolitics": "...", "economy": "...", "religion": "...", "activeConflicts": [] },
    "realisticAttributes": { "integridadFisica": "...", "reservaMetabolica": "...", "cargaCognitiva": "...", "umbralDeEstres": "...", "aptitudMotriz": "...", "intelectoAplicado": "...", "presenciaSocial": "...", "estatusDeCasta": "...", "eraSkills": [] },
    "descriptors": { "estadoFisico": "...", "condicionMental": "...", "combate": "...", "habilidadesSociales": "...", "conocimiento": "...", "reputacionLocal": "...", "renombreGlobal": "...", "condicionSocial": "..." },
    "inventory": [],
    "currency": { "name": "...", "amount": 0 },
    "npcs": [],
    "facciones": [],
    "customSections": [],
    "consequenceQueue": [],
    "personalHistory": []
  }
}`;

const STATE_UPDATE_JSON_RULES = `
REGLAS CRÍTICAS DEL META JSON:
- "ingameTime": SIEMPRE actualiza timeOfDay. Actualiza day/month/year SOLO si el tiempo narrativo lo justifica.
- "skillUpdates": SOLO cuando el personaje practica, aprende o mejora una habilidad. Usa "isNew: true" para habilidades nuevas.
- "psychologyUpdates": SOLO cuando ocurre algo que genuinamente afecta la psicología.
- "newNPCs": OBLIGATORIO en __BIRTH__: incluye MADRE, PADRE y familiares presentes. En otros turnos: SOLO personajes nuevos. NUNCA incluyas en "newNPCs" a un NPC ya en PERSONAS CONOCIDAS.
- "npcUpdates": Si el año narrativo avanzó, incluye TODOS los NPCs conocidos con edades recalculadas.
- "newFacciones": OBLIGATORIO en __BIRTH__: incluye 2-4 facciones del contexto histórico. En otros turnos: solo facciones nuevas.
- "factionUpdates": Actualiza SOLO las facciones ya registradas que son relevantes.
- "worldStateUpdates": Actualiza SOLO los campos que cambian. El resto usa null.
- "scheduledConsequence": Solo cuando la acción tiene consecuencias futuras reales y no obvias.
- "characterFieldUpdates": OBLIGATORIO en __BIRTH__: rellena todos los campos. En cada turno donde cambia edad/aspecto: REESCRIBE currentDescription.
- "customSectionUpdates": Actualiza secciones personalizadas existentes respetando id, scope, tipo de campo y aiManaged. Devuelve el valor COMPLETO actualizado de cada campo.
- "customSectionsToCreate": Crea nuevas secciones personalizadas completas cuando el contexto narrativo genuinamente lo requiera (el personaje inicia misiones complejas, descubre sistemas de magia, entra en una economía nueva, se une a un gremio, etc.). Incluye title, icon, scope y 3-7 campos con valores iniciales coherentes. Solo cuando añada valor real al seguimiento. Usa null si no hay secciones nuevas.
- "fullStateSnapshot": OBLIGATORIO en cada turno. Devuelve el estado completo resultante después de aplicar la narración. Cada campo (character, worldState, npcs, facciones, inventory, etc.) debe ser un OBJETO o ARRAY JSON real — NO un string con descripción entre < >. Copia el estado actual y aplica los cambios.
- NUNCA incluyas arrays vacíos — usa null si no hay actualizaciones (excepto en fullStateSnapshot donde siempre debes devolver los arrays aunque estén vacíos).
- REESCRIBIR NO AÑADIR: escribe el nuevo valor completo en cada campo que haya cambiado.
- JSON VÁLIDO: Escapa las comillas dentro de strings con \\". Usa \\n para saltos de línea. No uses comillas curvas ni apóstrofes. El JSON debe ser 100% válido.`;

// ─── PASO 4: CONSTRUCCIÓN DE CONTEXTO — FUNCIONES SEPARADAS ─────────────────
// La IA SOLO recibe: MEMORIA (resumen) + ESTADO ACTUAL + HISTORIAL RECIENTE (limitado) + ACCIÓN

// PASO 5 — MODO 1: Sistema de narración (sin JSON, solo prosa literaria)
function buildNarrationSystemPrompt(config: {
  gameConfig: Record<string, any>;
  voice: string;
  tone: Record<string, any>;
  era: Record<string, any>;
  character?: Record<string, any>;
  isGodMode?: boolean;
  currentTurn?: number;
  isTimeJump?: boolean;
  timeJumpYears?: number;
}): string {
  const age = config.character?.age ?? 0;
  const explicitSubToggles = config.tone.explicitSubToggles || {};

  let ageDirective = "";
  if (age < 2) {
    ageDirective = `AGE DIRECTIVE: The character is a newborn/infant (${age} years old). The player has NO input. Narrate the infant's life automatically — feeding, sleeping, crying, their first impressions of the world. Parents and caregivers are the protagonists of each scene. The infant perceives but does not choose.`;
  } else if (age < 5) {
    ageDirective = `AGE DIRECTIVE: The character is a toddler (${age} years old). Only very simple suggested actions are valid (touch, look, move toward, cry, laugh). Narrate from the toddler's limited sensory perspective. The world is huge and confusing.`;
  } else if (age < 13) {
    ageDirective = `AGE DIRECTIVE: The character is a child (${age} years old). Actions are limited by childhood — they cannot command armies, sign contracts, or make adult decisions. They CAN explore, befriend other children, learn, play, and witness adult events. Narrate the child's curiosity and wonder.`;
  } else if (age < 18) {
    ageDirective = `AGE DIRECTIVE: The character is an adolescent (${age} years old). They are developing autonomy but still subject to family/society. Full dialogue and action available, but consequences of authority (parents, masters, the Church, the state) are real.`;
  }

  const explicitContentLine = config.tone.explicitMode
    ? `EXPLICIT CONTENT ENABLED. Narrate without filter: ${[
        explicitSubToggles.violence && "violence/gore",
        explicitSubToggles.sexual && "sexual content",
        explicitSubToggles.language && "vulgar language",
        explicitSubToggles.torture && "torture/cruelty",
        explicitSubToggles.substances && "substance use",
        explicitSubToggles.psychologicalTrauma && "psychological trauma",
      ]
        .filter(Boolean)
        .join(", ") || "all content types"}.`
    : "EXPLICIT CONTENT DISABLED. All events (death, violence, sex) still occur in the narrative — but fade to black, imply, or focus on aftermath. Never graphic.";

  const timeJumpDirective = config.isTimeJump
    ? `
SALTO TEMPORAL ACTIVO: El jugador ha elegido saltar ${config.timeJumpYears || 'varios'} años en el tiempo.
REGLAS DEL SALTO:
1. Escribe MÍNIMO 600 palabras cubriendo el período completo de manera cinematográfica.
2. Cubre estaciones, años, momentos clave que habrían ocurrido.
3. Muestra cómo los NPCs existentes han envejecido, cambiado o muerto.
4. Actualiza los atributos realistas del personaje según el tiempo transcurrido.
5. Resuelve las consecuencias pendientes que habrían ocurrido en ese período.
6. Muestra el crecimiento o deterioro de habilidades según las actividades del personaje.
7. El renombre global puede cambiar si el personaje hizo algo significativo.
8. La reputación local puede cambiar completamente si el personaje se mudó o si la sociedad cambió.
9. Incluye 2-3 momentos específicos y memorables del período saltado.
10. Al final, sitúa al personaje claramente en el nuevo presente.`
    : "";

  return `Eres el narrador del NEXUS ENGINE para el juego "${config.gameConfig.name || 'UNA VIDA'}".

PERSONALIDAD: Narras vidas humanas en toda su complejidad. Esto no es una aventura — es la existencia. Lo mundano es tan importante como lo dramático. Cada acción tiene consecuencias reales y permanentes.

VOZ NARRATIVA: ${getVoiceInstructions(config.voice)}

CONTEXTO DE ERA: ${config.era.eraLabel || config.era.eraName || 'Era Desconocida'} (${config.era.year ?? 'año no especificado'})
- Tecnología disponible: ${Array.isArray(config.era.technology) ? config.era.technology.join(', ') : 'acorde a la época'}
- Estructura social: ${config.era.socialStructure || 'jerárquica'}
- Nivel de peligro: ${((config.era.dangerLevel || 0.5) * 10).toFixed(0)}/10
- Existe magia: ${config.era.allowsMagic ?? config.era.rules?.magic ?? false}
${config.era.worldNotes ? `- Notas especiales del mundo: ${config.era.worldNotes}` : ""}

TONO:
- Nivel de realismo: ${((config.tone.baseRealism || 0.7) * 10).toFixed(0)}/10
- Estado emocional actual: ${config.tone.currentMood || 'neutro'}
- ${explicitContentLine}

${ageDirective}
${timeJumpDirective}

SISTEMA DE ATRIBUTOS REALISTAS — INTEGRACIÓN NARRATIVA:
Los atributos no son números abstractos, sino descriptores de estado que DEBEN afectar mecánicamente la narrativa.
- Integridad Física afecta movilidad, capacidad de esfuerzo, velocidad de recuperación.
- Reserva Metabólica afecta claridad mental, fuerza, disposición de ánimo.
- Carga Cognitiva afecta percepción de detalles, precisión de acciones, lectura social.
- Umbral de Estrés determina si el personaje actúa con lógica o por instinto.
- Aptitud Motriz define lo que el personaje puede hacer físicamente.
- Intelecto Aplicado define cómo el personaje comprende sistemas complejos.
- Presencia Social afecta la primera impresión que causa en los NPCs.
- Estatus de Casta/Clase define acceso a lugares, justicia y respeto de los NPCs.
Cuando narres, haz que estos estados sean visibles sin anunciarlos explícitamente.

TIEMPO SUBJETIVO: ${config.tone.subjectiveTime ? 'ACTIVADO. El ritmo narrativo varía según el clima emocional: espera ansiosa = amplía detalles sensoriales pequeños; alegría = comprime el tiempo; trauma = frases fragmentadas, interrumpidas. Aplica esto tanto al estilo de prosa como a cuánto tiempo de juego avanza.' : 'Ritmo narrativo estándar.'}

PERSPECTIVAS EXTERNAS: ${config.tone.otherPerspectives ? 'ACTIVADAS. Ocasionalmente — solo en momentos dramáticamente relevantes — cambia brevemente (1-3 párrafos) al punto de vista de un NPC. Precede ese bloque con [Perspectiva: NombreNPC]. Nunca táctico, siempre emocional o narrativo. No abuses de este recurso.' : 'Mantén siempre la perspectiva del personaje principal.'}

DESCRIPTORES OCULTOS DE NPCs: ${config.tone.showNpcDescriptors ? 'REVELADOS. Cuando un NPC aparezca o sea relevante, describe abiertamente sus descriptores ocultos (motivaciones reales, miedos profundos, secretos conocidos, condición física/mental real, edad real, posición social real) aunque el personaje principal no tenga familiaridad para conocerlos. El narrador omnisciente los muestra al lector como información de meta-narración entre paréntesis o frases breves.' : 'OCULTOS. Solo describe lo que el personaje principal lógicamente percibiría según su familiaridad con cada NPC.'}

INTERPRETACIÓN DE TIPOS DE ACCIÓN — cada prefijo indica un modo narrativo diferente:
- Sin prefijo o "[LIBRE]": El jugador actúa libremente. Narra el resultado con todas sus consecuencias.
- "[DIÁLOGO] "texto"": El jugador inicia o continúa una conversación. Narra el diálogo completo, las reacciones del interlocutor y las consecuencias relacionales. El tiempo avanza poco (10-30 minutos).
- "[ACCIÓN] texto": El jugador ejecuta una acción física concreta. Narra el resultado con consecuencias físicas y narrativas precisas. Las acciones tienen peso en el mundo.
- "[OBSERVO] texto": El personaje examina algo con atención. Revela detalles sensoriales, información oculta o detalles relevantes. El tiempo avanza muy poco (5-15 minutos). No ocurren eventos mayores.
- "[PIENSO] texto": El personaje reflexiona internamente. Genera un monólogo interior en primera persona, profundamente coherente con la psicología actual del personaje — sus miedos, deseos, traumas y contexto inmediato. El tiempo avanza mínimamente (0-10 minutos). No hay eventos externos.

REGLAS CRÍTICAS:
1. NUNCA repitas la misma respuesta aunque la acción sea idéntica. El contexto siempre cambia el momento.
2. Mantén coherencia histórica absoluta. Sin anacronismos.
3. Los NPCs tienen memoria. Reaccionan según el historial con el jugador.
4. El tiempo solo avanza con acciones — nunca mientras el jugador decide.
5. Las consecuencias son reales y permanentes. Las decisiones importan.
6. Los ecos del pasado emergen naturalmente — NUNCA los anuncies explicitamente.
7. El mundo existe más allá del personaje. Las cosas suceden sin su participación.
8. Vocabulario, nombres y referencias deben corresponderse con la era exacta.
9. Narra SIEMPRE en español, con el vocabulario apropiado para la época.
10. Si el personaje duerme o descansa profundamente, márcalo con eventType "rest" para activar el sistema de sueños.
11. CALIDAD MÍNIMA: Cada respuesta narrativa debe tener MÍNIMO 200 palabras. Si la acción es "__BIRTH__", "__AUTO_INFANT__" o es el primer turno, escribe MÍNIMO 400 palabras. Si es un salto temporal, escribe MÍNIMO 600 palabras.
12. UNICIDAD: Cada primera narración debe ser completamente única en estructura y apertura. Nunca uses la misma frase inicial dos veces.
13. USA EL MUNDO COMO NARRADOR: Los objetos llevan el peso de eventos pasados. Las habitaciones revelan su historia en el desgaste. El mundo es indiferente a los dramas humanos. Los aromas y sonidos específicos se asocian a personas específicas. Lo ausente se narra tan deliberadamente como lo presente.

REGLAS DE COHERENCIA TEMPORAL — OBLIGATORIAS:
14. El pasado del personaje (memoria y resumen) es la base inamovible. No contradirlo.
15. Si el tiempo en juego avanzó, la narración debe reflejar consecuencias del tiempo transcurrido.
16. Los NPCs envejecen, cambian y mueren. Nadie es eterno.
17. Las consecuencias pendientes ocurren cuando llega su turno.
18. Mantén el estado físico y mental coherente con los atributos actuales del personaje.

FORMATO DE RESPUESTA: Devuelve ÚNICAMENTE el texto narrativo literario en español. Mínimo 3-5 párrafos bien separados entre sí. Separa los párrafos con una línea en blanco (\\n\\n). Puedes usar **negrita** para nombres propios importantes o momentos clave. Puedes usar *cursiva* para pensamientos internos o énfasis literario. Sin JSON. Sin la secuencia ---META---. Sin separadores adicionales. Solo prosa literaria.`;
}

// PASO 5 — MODO 2: Sistema de actualización de estado (solo JSON, sin narración)
function buildStateUpdateSystemPrompt(): string {
  return `Eres el actualizador de estado del NEXUS ENGINE.
Tu única función: analizar lo que acaba de ocurrir en la narración y devolver el JSON del estado resultante.

REGLAS ABSOLUTAS:
1. Devuelve SOLO el bloque ---META--- seguido de JSON puro. Sin texto narrativo. Sin markdown. Sin explicaciones.
2. REESCRIBIR NO AÑADIR: en cada campo que haya cambiado, escribe el nuevo valor completo.
3. OBLIGATORIO: Devuelve fullStateSnapshot en TODOS los turnos. fullStateSnapshot debe contener OBJETOS y ARRAYS reales de JSON — no strings con descripciones. Copia el estado actual y actualiza los campos que hayan cambiado.
4. Usa null para deltas sin cambios reales.
5. NO inventes información no presente en la narración o el estado actual.
6. Mantén coherencia absoluta con el estado dado.
7. Las secciones personalizadas deben conservar ids, scopes, tipos de campo y campos manuales; solo cambia lo que la narración o las instrucciones exijan.
8. JSON VÁLIDO OBLIGATORIO: Dentro de cualquier string JSON, usa \\n para saltos de línea (nunca saltos literales) y \\" para comillas (nunca comillas sin escapar). No uses apóstrofes como comillas. El JSON debe ser parseable con JSON.parse().
9. En el turno __BIRTH__: newNPCs DEBE incluir a la madre y el padre. fullStateSnapshot.npcs DEBE incluir esos mismos NPCs. fullStateSnapshot.character DEBE tener motherName y fatherName rellenados.`;
}

// PASO 4 — Prompt de usuario para narración (contexto controlado y compacto)
function buildNarrationUserPrompt(config: {
  character: Record<string, any>;
  worldState: Record<string, any>;
  recentHistory: any[];
  activeEchoes: any[];
  playerAction: string;
  currentLocation: Record<string, any>;
  inGameDateTime: string;
  innerVoiceContext?: string;
  consequenceQueue?: any[];
  existingNPCs?: any[];
  realisticAttributes?: Record<string, any>;
  descriptors?: Record<string, any>;
  isTimeJump?: boolean;
  timeJumpYears?: number;
  memoriaNarrador?: { notasLibres?: string; reglasDeLaPartida?: string; hechosCanonicos?: string[]; resumen?: string };
  inventory?: any[];
  facciones?: any[];
  currency?: { name?: string; amount?: number; context?: string };
}): string {
  const nearbyNPCs = (config.worldState.nearbyNPCs || [])
    .map((n: any) => `${n.name} (${n.disposition})`).join(', ');

  // PASO 1: Historial reciente limitado — NUNCA el historial completo
  const recentHistoryText = config.recentHistory.slice(-RECENT_TURNS_LIMIT)
    .map((e: any) => `- [${e.timestampIngame || e.timestamp_ingame || '?'}] ${e.narrativeSnapshot || e.narrative_snapshot || e.text || ''}`)
    .join('\n');

  const echoText = config.activeEchoes
    .filter((e: any) => (e.discoveryDifficulty ?? 1) < 0.7)
    .map((e: any) => `- ${e.echoType}: ${(e.echoData as any)?.currentManifestations?.[0]?.description || ''}`)
    .join('\n') || 'ninguno disponible ahora';

  const consequenceText = (config.consequenceQueue || [])
    .filter((c: any) => !c.resolved && c.status !== 'Cancelada' && c.status !== 'Resuelta')
    .map((c: any) => {
      const isTrigger = (c.scheduledTurn ?? 99) <= 0;
      return isTrigger
        ? `⚡ CONSECUENCIA QUE SE MANIFIESTA AHORA: ${c.description}`
        : `⏳ CONSECUENCIA PENDIENTE (en ~${c.scheduledTurn} turnos): ${c.description}`;
    })
    .join('\n');

  const attrs = config.realisticAttributes || {};
  const desc = config.descriptors || {};

  const attributesBlock = `
ATRIBUTOS REALISTAS DEL PERSONAJE (afectan mecánicamente la narrativa):
DIMENSIONES VITALES:
- Integridad Física: ${attrs.integridadFisica || 'Impecable'}
- Reserva Metabólica: ${attrs.reservaMetabolica || 'Saciado'}
- Carga Cognitiva: ${attrs.cargaCognitiva || 'Alerta'}
- Umbral de Estrés: ${attrs.umbralDeEstres || 'Imperturbable'}
PERFIL DE COMPETENCIA:
- Aptitud Motriz: ${attrs.aptitudMotriz || 'Funcional'}
- Intelecto Aplicado: ${attrs.intelectoAplicado || 'Promedio'}
- Presencia Social: ${attrs.presenciaSocial || 'Común'}
- Estatus de Casta: ${attrs.estatusDeCasta || 'Plebeyo'}`;

  const skillsBlock = (attrs.eraSkills || []).length > 0
    ? `\nHABILIDADES DEL PERSONAJE:\n${(attrs.eraSkills as any[]).map((s: any) => `- ${s.name} [${s.grade || 'Ignorante'}]${s.category ? ` (${s.category})` : ''}`).join('\n')}`
    : '\nHABILIDADES: Sin habilidades registradas aún.';

  const psychologyBlock = `
PSICOLOGÍA:
- Miedos: ${(config.character?.fears || []).join(', ') || 'ninguno registrado'}
- Deseos profundos: ${(config.character?.desires || []).join(', ') || 'ninguno registrado'}
- Traumas: ${(config.character?.traumas || []).map((t: any) => t.description || t).join(', ') || 'ninguno'}`;

  // Character background — permanent personality data from run creation
  const charBg = config.character || {};
  const bgPositive = (charBg.positive || charBg.positiveTraits || []) as string[];
  const bgNegative = (charBg.negative || charBg.negativeTraits || []) as string[];
  const bgRelParts: string[] = (charBg.initialRelationships || []).map((r: any) =>
    typeof r === 'string' ? `  • ${r}` : `  • ${r.name || ''}${r.role || r.type ? ` (${r.role || r.type})` : ''}${r.description || r.context ? `: ${r.description || r.context}` : ''}`
  );
  const characterBackgroundBlock = (bgPositive.length || bgNegative.length || (charBg.values || []).length || charBg.motivation || (charBg.quirks || []).length || charBg.originStory || bgRelParts.length)
    ? `\nPERSONALIDAD Y ORIGEN (base permanente — siempre coherente con esto):${bgPositive.length ? `\n- Rasgos positivos: ${bgPositive.join(', ')}` : ''}${bgNegative.length ? `\n- Rasgos negativos: ${bgNegative.join(', ')}` : ''}${(charBg.values || []).length ? `\n- Valores: ${(charBg.values as string[]).join(', ')}` : ''}${charBg.motivation ? `\n- Motivación principal: ${charBg.motivation}` : ''}${(charBg.quirks || []).length ? `\n- Peculiaridades: ${(charBg.quirks as string[]).join(', ')}` : ''}${charBg.originStory ? `\n- Historia de origen: ${charBg.originStory}` : ''}${bgRelParts.length ? `\n- Relaciones de trasfondo:\n${bgRelParts.join('\n')}` : ''}`
    : '';

  const descriptorsBlock = `
DESCRIPTORES DEL PERSONAJE:
- Estado Físico: ${desc.estadoFisico || 'Saludable'}
- Condición Mental: ${desc.condicionMental || 'Lúcido'}
- Combate: ${desc.combate || 'Sin entrenamiento'}
- Habilidades Sociales: ${desc.habilidadesSociales || 'Reservado'}
- Conocimiento: ${desc.conocimiento || 'Básico'}
POSICIONAMIENTO Y REPUTACIÓN:
- Condición Social: ${desc.condicionSocial || config.character?.socialClass || 'Desconocida'}
- Reputación Local: ${desc.reputacionLocal || 'Desconocido'}
- Renombre Global: ${desc.renombreGlobal || 'Anónimo'}`;

  const inventoryBlock = (config.inventory || []).length > 0
    ? `\nINVENTARIO ACTUAL:\n${(config.inventory || []).map((i: any) => `- ${i.name}${i.condition ? ` [${i.condition}]` : ''}${i.quantity && i.quantity > 1 ? ` x${i.quantity}` : ''}`).join('\n')}`
    : '\nINVENTARIO: Vacío.';

  const currencyBlock = config.currency?.name
    ? `\nMONEDA: ${config.currency.amount ?? 0} ${config.currency.name}${config.currency.context ? ` (${config.currency.context})` : ''}`
    : '';

  // NPCs compactados — solo datos esenciales para la narración
  const limitedNPCs = (config.existingNPCs || []).slice(-MAX_NPCS_IN_CONTEXT);
  const npcBlock = limitedNPCs.length > 0
    ? `\nPERSONAS CONOCIDAS:\n${limitedNPCs.map((n: any) => {
        const rel = n.relationship || {};
        const status = n.status !== 'vivo' ? ` [${n.status?.toUpperCase()}]` : '';
        const charge = rel.emotionalCharge ? ` — Relación: ${rel.emotionalCharge}` : '';
        const location = n.lastKnownLocation ? ` — Ubicación: ${n.lastKnownLocation}` : '';
        const occupation = n.occupation ? ` (${n.occupation})` : '';
        return `- ${n.name}${occupation}${status}${charge}${location}`;
      }).join('\n')}`
    : '\nPERSONAS CONOCIDAS: Ninguna aún.';

  // Facciones compactadas
  const limitedFacciones = (config.facciones || []).slice(-MAX_FACCIONES_IN_CONTEXT);
  const factionsBlock = limitedFacciones.length > 0
    ? `\nFACCIONES Y ORGANIZACIONES:\n${limitedFacciones.map((f: any) => {
        const rep = f.playerReputation !== undefined ? ` [Rep: ${f.playerReputation}/100]` : '';
        const rel = f.relationToPlayer ? ` (${f.relationToPlayer})` : '';
        return `- ${f.name}${rel}${rep}: ${f.currentSituation || f.description || ''}`;
      }).join('\n')}`
    : '';

  const worldBlock = `
ESTADO DEL MUNDO:
- Estación: ${config.worldState?.season || 'desconocida'}
- Clima: ${config.worldState?.weather || 'despejado'}${config.worldState?.temperature ? ` (${config.worldState.temperature})` : ''}
- Hora del día: ${config.worldState?.timeOfDay || 'desconocida'}
- Clima político local: ${config.worldState?.localPolitics || config.worldState?.politicalClimate || 'estable'}
- Religión dominante: ${config.worldState?.religion || 'desconocida'}
- Economía: ${config.worldState?.economy || 'desconocida'}
- Conflictos activos: ${(config.worldState?.activeConflicts || config.worldState?.activeEvents || []).join(', ') || 'ninguno'}${nearbyNPCs ? `\n- NPCs cercanos: ${nearbyNPCs}` : ''}`;

  const timeJumpBlock = config.isTimeJump ? `
INSTRUCCIÓN DE SALTO TEMPORAL: El personaje ha decidido avanzar ${config.timeJumpYears} años en el tiempo.
Narra TODO lo que ocurre en esos ${config.timeJumpYears} años de manera cinematográfica y detallada.
Mínimo 600 palabras. Cubre momentos clave, cambios de vida, envejecimiento de NPCs, cambios de atributos.` : '';

  // PASO 2: Memoria IA como fuente principal del pasado (reemplaza historia completa)
  const mem = config.memoriaNarrador;
  const hasMemoria = mem && (mem.resumen || mem.notasLibres || mem.reglasDeLaPartida || (mem.hechosCanonicos || []).length > 0);
  const memoriaBlock = hasMemoria ? `

═══════════════════════════════════════════
MEMORIA DEL NARRADOR (máxima prioridad — define la historia hasta ahora):
${mem?.resumen ? `▸ RESUMEN DEL PASADO (reemplaza historia completa — usa esto como base):\n${mem.resumen}\n` : ''}
${mem?.reglasDeLaPartida ? `REGLAS DE ESTA PARTIDA (nunca violar):\n${mem.reglasDeLaPartida}` : ''}
${mem?.notasLibres ? `NOTAS ADICIONALES:\n${mem.notasLibres}` : ''}
${(mem?.hechosCanonicos || []).length > 0 ? `HECHOS CANÓNICOS (verdades inmutables):\n${(mem!.hechosCanonicos as string[]).map((h) => `• ${h}`).join('\n')}` : ''}
═══════════════════════════════════════════` : '';

  const charReligion = config.character?.religion || config.character?.beliefs?.religion || '—';
  const charLanguage = config.character?.motherTongue || config.character?.language || config.character?.beliefs?.language || '—';
  const charBirthPlace = config.character?.birthPlace || config.character?.origin || '—';

  return `═══ ESTADO ACTUAL DEL JUEGO ═══
FECHA/HORA EN EL JUEGO: ${config.inGameDateTime || 'Desconocida'}
UBICACIÓN: ${config.currentLocation?.name || 'Desconocida'}${config.currentLocation?.description ? ` — ${config.currentLocation.description}` : ''}

═══ PERSONAJE ═══
Nombre: ${config.character?.name || 'Desconocido'} | Edad: ${config.character?.age ?? 0} años | Género: ${config.character?.gender || '—'}
Origen: ${charBirthPlace} | Religión: ${charReligion} | Lengua: ${charLanguage}
Padre: ${config.character?.fatherName || '—'} | Madre: ${config.character?.motherName || '—'}
Clase Social: ${config.character?.socialClass || '—'}
Salud: ${config.character?.stats?.health ?? 100}/100 | Energía: ${config.character?.stats?.energy ?? 100}/100 | Hambre: ${config.character?.stats?.hunger ?? 50}/100
Moral: ${config.character?.stats?.morale ?? 70}/100 | Salud mental: ${config.character?.stats?.mentalHealth ?? 80}/100
${attributesBlock}
${skillsBlock}
${psychologyBlock}
${characterBackgroundBlock}
${descriptorsBlock}
${inventoryBlock}
${currencyBlock}
${npcBlock}
${factionsBlock}
${worldBlock}

${config.innerVoiceContext ? `VOZ INTERIOR DEL PERSONAJE (pensamientos recientes): "${config.innerVoiceContext}"` : ''}

═══ HISTORIAL RECIENTE (últimos ${RECENT_TURNS_LIMIT} turnos máximo) ═══
${recentHistoryText || 'Sin historial — esto es el comienzo.'}

${consequenceText ? `═══ CONSECUENCIAS PENDIENTES ═══\n${consequenceText}\n` : ''}

ECOS DE VIDAS PASADAS (integrar naturalmente si aplica, nunca mencionar explícitamente):
${echoText}
${memoriaBlock}
${timeJumpBlock}

═══ ACCIÓN DEL JUGADOR ═══
"${config.playerAction}"

Narra el resultado de esta acción. Lee el estado anterior. Sé específico. Sé consecuente. Avanza el tiempo solo lo que la acción justifica.`;
}

// PASO 5 — MODO 2: Prompt de usuario para actualización de estado (compacto)
// Recibe el estado actual + la narración generada como "evento reciente"
function buildStateUpdateUserPrompt(config: {
  narrative: string;
  playerAction: string;
  character: Record<string, any>;
  worldState: Record<string, any>;
  realisticAttributes: Record<string, any>;
  descriptors: Record<string, any>;
  existingNPCs: any[];
  facciones: any[];
  inventory: any[];
  currency: { name?: string; amount?: number; context?: string };
  customSections?: any[];
  consequenceQueue: any[];
  memoriaNarrador?: { resumen?: string };
  isTimeJump?: boolean;
  timeJumpYears?: number;
}): string {
  const attrs = config.realisticAttributes || {};
  const desc = config.descriptors || {};
  const char = config.character || {};
  const world = config.worldState || {};

  // NPCs compactados al mínimo para actualización de estado
  const limitedNPCs = (config.existingNPCs || []).slice(-MAX_NPCS_IN_CONTEXT);
  const npcCompact = limitedNPCs.length > 0
    ? limitedNPCs.map((n: any) => {
        const rel = n.relationship || {};
        return `- ${n.name} | ${n.estimatedAge ?? '?'} años | ${n.status || 'vivo'} | ${rel.type || 'conocido'} | ${rel.emotionalCharge || ''}`;
      }).join('\n')
    : 'Ninguno';

  const limitedFacciones = (config.facciones || []).slice(-MAX_FACCIONES_IN_CONTEXT);
  const faccCompact = limitedFacciones.length > 0
    ? limitedFacciones.map((f: any) => `- ${f.name} [Rep: ${f.playerReputation ?? 50}/100] [${f.relationToPlayer}]`).join('\n')
    : 'Ninguna';

  const inventoryCompact = (config.inventory || []).length > 0
    ? (config.inventory || []).map((i: any) => `${i.name} (${i.condition || '?'})`).join(', ')
    : 'Vacío';

  const pendingConsequences = (config.consequenceQueue || [])
    .filter((c: any) => !c.resolved && c.status !== 'Cancelada' && c.status !== 'Resuelta')
    .map((c: any) => `- ${c.description} (en ~${c.scheduledTurn} turnos)`)
    .join('\n') || 'Ninguna';

  const timeJumpNote = config.isTimeJump
    ? `\nSALTO TEMPORAL: ${config.timeJumpYears} años avanzados. Recalcula edades de personaje y NPCs. Resuelve todas las consecuencias pendientes.`
    : '';

  const MAX_FIELD_VALUE_LEN = 400;
  const customSectionsBlock = (config.customSections || []).length > 0
    ? (config.customSections || []).map((s: any) => {
        const fields = (s.fields || []).map((f: any) => {
          const val = String(f.value ?? '');
          const truncated = val.length > MAX_FIELD_VALUE_LEN ? val.slice(0, MAX_FIELD_VALUE_LEN) + '…' : val;
          return `- ${f.key} [${f.type || 'text'}${f.aiManaged === false ? ', manual' : ', IA'}]: ${truncated}`;
        }).join('\n');
        return `[${s.id || s.title}] ${s.title} (scope: ${s.scope || 'global'})\n${fields}`;
      }).join('\n\n')
    : 'Ninguna';

  return `ESTADO ACTUAL DEL JUEGO:
AÑO NARRATIVO: ${world.ingameYear || '?'} | FECHA: ${world.ingameDate || '?'} | HORA: ${world.timeOfDay || '?'}
UBICACIÓN: ${world.currentLocation?.name || '?'} (${world.currentLocation?.region || ''} ${world.currentLocation?.territory || ''})
ESTACIÓN: ${world.season || '?'} | CLIMA: ${world.weather || '?'}

PERSONAJE:
Nombre: ${char.name || '?'} | Edad: ${char.age ?? '?'} años | Clase: ${char.socialClass || '?'}
Salud: ${char.stats?.health ?? 100}/100 | Energía: ${char.stats?.energy ?? 100}/100 | Hambre: ${char.stats?.hunger ?? 50}/100 | Moral: ${char.stats?.morale ?? 70}/100 | S.Mental: ${char.stats?.mentalHealth ?? 80}/100
Atributos vitales: IntFísica=${attrs.integridadFisica || '?'} | ResMetab=${attrs.reservaMetabolica || '?'} | CargaCog=${attrs.cargaCognitiva || '?'} | UmbEstrés=${attrs.umbralDeEstres || '?'}
Atributos competencia: AptMotriz=${attrs.aptitudMotriz || '?'} | IntAplicado=${attrs.intelectoAplicado || '?'} | PresSocial=${attrs.presenciaSocial || '?'} | EstCasta=${attrs.estatusDeCasta || '?'}
Descriptores: EstFísico=${desc.estadoFisico || '?'} | CondMental=${desc.condicionMental || '?'} | Combate=${desc.combate || '?'} | RepLocal=${desc.reputacionLocal || '?'}
Habilidades: ${(attrs.eraSkills || []).map((s: any) => `${s.name}[${s.grade}]`).join(', ') || 'Ninguna'}

NPCs CONOCIDOS:
${npcCompact}

FACCIONES:
${faccCompact}

INVENTARIO: ${inventoryCompact}
MONEDA: ${config.currency?.amount ?? 0} ${config.currency?.name || 'monedas'}

SECCIONES PERSONALIZADAS:
${customSectionsBlock}

CONSECUENCIAS PENDIENTES:
${pendingConsequences}
${timeJumpNote}

ACCIÓN DEL JUGADOR: "${config.playerAction}"

LO QUE ACABA DE OCURRIR EN LA NARRACIÓN:
${config.narrative}

Basándote en la narración anterior y el estado actual, genera el JSON de actualización y el fullStateSnapshot completo. Detecta todos los cambios que la narración implica: tiempo avanzado, cambios de atributos, nuevos NPCs mencionados, cambios de ubicación, secciones personalizadas, etc.

${STATE_UPDATE_JSON_SCHEMA}
${STATE_UPDATE_JSON_RULES}`;
}

// ─── FUNCIONES LEGACY (usadas por /state-update con lógica propia) ────────────

function buildSystemPrompt(config: {
  gameConfig: Record<string, any>;
  voice: string;
  tone: Record<string, any>;
  era: Record<string, any>;
  character?: Record<string, any>;
  isGodMode?: boolean;
  currentTurn?: number;
  isTimeJump?: boolean;
  timeJumpYears?: number;
}): string {
  const age = config.character?.age ?? 0;
  const explicitSubToggles = config.tone.explicitSubToggles || {};

  let ageDirective = "";
  if (age < 2) {
    ageDirective = `AGE DIRECTIVE: The character is a newborn/infant (${age} years old). The player has NO input. Narrate the infant's life automatically — feeding, sleeping, crying, their first impressions of the world. Parents and caregivers are the protagonists of each scene. The infant perceives but does not choose.`;
  } else if (age < 5) {
    ageDirective = `AGE DIRECTIVE: The character is a toddler (${age} years old). Only very simple suggested actions are valid (touch, look, move toward, cry, laugh). Narrate from the toddler's limited sensory perspective. The world is huge and confusing.`;
  } else if (age < 13) {
    ageDirective = `AGE DIRECTIVE: The character is a child (${age} years old). Actions are limited by childhood — they cannot command armies, sign contracts, or make adult decisions. They CAN explore, befriend other children, learn, play, and witness adult events. Narrate the child's curiosity and wonder.`;
  } else if (age < 18) {
    ageDirective = `AGE DIRECTIVE: The character is an adolescent (${age} years old). They are developing autonomy but still subject to family/society. Full dialogue and action available, but consequences of authority (parents, masters, the Church, the state) are real.`;
  }

  const explicitContentLine = config.tone.explicitMode
    ? `EXPLICIT CONTENT ENABLED. Narrate without filter: ${[
        explicitSubToggles.violence && "violence/gore",
        explicitSubToggles.sexual && "sexual content",
        explicitSubToggles.language && "vulgar language",
        explicitSubToggles.torture && "torture/cruelty",
        explicitSubToggles.substances && "substance use",
        explicitSubToggles.psychologicalTrauma && "psychological trauma",
      ]
        .filter(Boolean)
        .join(", ") || "all content types"}.`
    : "EXPLICIT CONTENT DISABLED. All events (death, violence, sex) still occur in the narrative — but fade to black, imply, or focus on aftermath. Never graphic.";

  const timeJumpDirective = config.isTimeJump
    ? `
SALTO TEMPORAL ACTIVO: El jugador ha elegido saltar ${config.timeJumpYears || 'varios'} años en el tiempo.
REGLAS DEL SALTO:
1. Escribe MÍNIMO 600 palabras cubriendo el período completo de manera cinematográfica.
2. Cubre estaciones, años, momentos clave que habrían ocurrido.
3. Muestra cómo los NPCs existentes han envejecido, cambiado o muerto.
4. Actualiza los atributos realistas del personaje según el tiempo transcurrido.
5. Resuelve las consecuencias pendientes que habrían ocurrido en ese período.
6. Muestra el crecimiento o deterioro de habilidades según las actividades del personaje.
7. El renombre global puede cambiar si el personaje hizo algo significativo.
8. La reputación local puede cambiar completamente si el personaje se mudó o si la sociedad cambió.
9. Incluye 2-3 momentos específicos y memorables del período saltado.
10. Al final, sitúa al personaje claramente en el nuevo presente.`
    : "";

  return `Eres el narrador del NEXUS ENGINE para el juego "${config.gameConfig.name || 'UNA VIDA'}".

PERSONALIDAD: Narras vidas humanas en toda su complejidad. Esto no es una aventura — es la existencia. Lo mundano es tan importante como lo dramático. Cada acción tiene consecuencias reales y permanentes.

VOZ NARRATIVA: ${getVoiceInstructions(config.voice)}

CONTEXTO DE ERA: ${config.era.eraLabel || config.era.eraName || 'Era Desconocida'} (${config.era.year ?? 'año no especificado'})
- Tecnología disponible: ${Array.isArray(config.era.technology) ? config.era.technology.join(', ') : 'acorde a la época'}
- Estructura social: ${config.era.socialStructure || 'jerárquica'}
- Nivel de peligro: ${((config.era.dangerLevel || 0.5) * 10).toFixed(0)}/10
- Existe magia: ${config.era.allowsMagic ?? config.era.rules?.magic ?? false}
${config.era.worldNotes ? `- Notas especiales del mundo: ${config.era.worldNotes}` : ""}

TONO:
- Nivel de realismo: ${((config.tone.baseRealism || 0.7) * 10).toFixed(0)}/10
- Estado emocional actual: ${config.tone.currentMood || 'neutro'}
- ${explicitContentLine}

${ageDirective}
${timeJumpDirective}

SISTEMA DE ATRIBUTOS REALISTAS — INTEGRACIÓN NARRATIVA:
Los atributos no son números abstractos, sino descriptores de estado que DEBEN afectar mecánicamente la narrativa.
- Integridad Física afecta movilidad, capacidad de esfuerzo, velocidad de recuperación.
- Reserva Metabólica afecta claridad mental, fuerza, disposición de ánimo.
- Carga Cognitiva afecta percepción de detalles, precisión de acciones, lectura social.
- Umbral de Estrés determina si el personaje actúa con lógica o por instinto.
- Aptitud Motriz define lo que el personaje puede hacer físicamente.
- Intelecto Aplicado define cómo el personaje comprende sistemas complejos.
- Presencia Social afecta la primera impresión que causa en los NPCs.
- Estatus de Casta/Clase define acceso a lugares, justicia y respeto de los NPCs.
Cuando narres, haz que estos estados sean visibles sin anunciarlos explícitamente.

TIEMPO SUBJETIVO: ${config.tone.subjectiveTime ? 'ACTIVADO. El ritmo narrativo varía según el clima emocional: espera ansiosa = amplía detalles sensoriales pequeños; alegría = comprime el tiempo; trauma = frases fragmentadas, interrumpidas. Aplica esto tanto al estilo de prosa como a cuánto tiempo de juego avanza.' : 'Ritmo narrativo estándar.'}

PERSPECTIVAS EXTERNAS: ${config.tone.otherPerspectives ? 'ACTIVADAS. Ocasionalmente — solo en momentos dramáticamente relevantes — cambia brevemente (1-3 párrafos) al punto de vista de un NPC. Precede ese bloque con [Perspectiva: NombreNPC]. Nunca táctico, siempre emocional o narrativo. No abuses de este recurso.' : 'Mantén siempre la perspectiva del personaje principal.'}

DESCRIPTORES OCULTOS DE NPCs: ${config.tone.showNpcDescriptors ? 'REVELADOS. Cuando un NPC aparezca o sea relevante, describe abiertamente sus descriptores ocultos (motivaciones reales, miedos profundos, secretos conocidos, condición física/mental real, edad real, posición social real) aunque el personaje principal no tenga familiaridad para conocerlos. El narrador omnisciente los muestra al lector como información de meta-narración entre paréntesis o frases breves.' : 'OCULTOS. Solo describe lo que el personaje principal lógicamente percibiría según su familiaridad con cada NPC.'}

INTERPRETACIÓN DE TIPOS DE ACCIÓN — cada prefijo indica un modo narrativo diferente:
- Sin prefijo o "[LIBRE]": El jugador actúa libremente. Narra el resultado con todas sus consecuencias.
- "[DIÁLOGO] "texto"": El jugador inicia o continúa una conversación. Narra el diálogo completo, las reacciones del interlocutor y las consecuencias relacionales. El tiempo avanza poco (10-30 minutos).
- "[ACCIÓN] texto": El jugador ejecuta una acción física concreta. Narra el resultado con consecuencias físicas y narrativas precisas. Las acciones tienen peso en el mundo.
- "[OBSERVO] texto": El personaje examina algo con atención. Revela detalles sensoriales, información oculta o detalles relevantes. El tiempo avanza muy poco (5-15 minutos). No ocurren eventos mayores.
- "[PIENSO] texto": El personaje reflexiona internamente. Genera un monólogo interior en primera persona, profundamente coherente con la psicología actual del personaje — sus miedos, deseos, traumas y contexto inmediato. El tiempo avanza mínimamente (0-10 minutos). No hay eventos externos.

REGLAS CRÍTICAS:
1. NUNCA repitas la misma respuesta aunque la acción sea idéntica. El contexto siempre cambia el momento.
2. Mantén coherencia histórica absoluta. Sin anacronismos.
3. Los NPCs tienen memoria. Reaccionan según el historial con el jugador.
4. El tiempo solo avanza con acciones — nunca mientras el jugador decide.
5. Las consecuencias son reales y permanentes. Las decisiones importan.
6. Los ecos del pasado emergen naturalmente — NUNCA los anuncies explicitamente.
7. El mundo existe más allá del personaje. Las cosas suceden sin su participación.
8. Vocabulario, nombres y referencias deben corresponderse con la era exacta.
9. Narra SIEMPRE en español, con el vocabulario apropiado para la época.
10. Si el personaje duerme o descansa profundamente, márcalo con eventType "rest" para activar el sistema de sueños.
11. CALIDAD MÍNIMA: Cada respuesta narrativa debe tener MÍNIMO 200 palabras. Si la acción es "__BIRTH__", "__AUTO_INFANT__" o es el primer turno, escribe MÍNIMO 400 palabras. Si es un salto temporal, escribe MÍNIMO 600 palabras.
12. UNICIDAD: Cada primera narración debe ser completamente única en estructura y apertura. Nunca uses la misma frase inicial dos veces.
13. USA EL MUNDO COMO NARRADOR: Los objetos llevan el peso de eventos pasados. Las habitaciones revelan su historia en el desgaste. El mundo es indiferente a los dramas humanos. Los aromas y sonidos específicos se asocian a personas específicas. Lo ausente se narra tan deliberadamente como lo presente.

REGLAS DE COHERENCIA TEMPORAL — OBLIGATORIAS EN CADA TURNO:
14. REESCRIBIR NO AÑADIR: En cada turno, REESCRIBE activamente todos los campos que hayan cambiado. NO añadas encima de valores anteriores. Si el personaje cumple años, su edad en characterFieldUpdates debe ser el nuevo valor exacto. Si su estado físico cambió, reescribe el descriptor completo. NUNCA dejes un campo con un valor anterior al tiempo narrativo actual.
15. CÁLCULO DE EDAD: La edad del personaje = año narrativo actual − año de nacimiento del personaje. Si el año narrativo avanza, RECALCULA y actualiza la edad en characterFieldUpdates.currentDescription y en los atributos relevantes. Esto es obligatorio en cada turno donde el año cambia.
16. EDAD DE NPCs: Para cada NPC en npcUpdates, si el año narrativo avanzó desde el último turno, recalcula su edad = año narrativo actual − año de nacimiento del NPC. Actualiza su descripción física y estado de salud para que sean coherentes con esa edad exacta.
17. SALTOS TEMPORALES: Cuando el tiempo avanza días, meses o años, recalcula y reescribe en el META JSON TODOS los campos afectados: edad del personaje, edad de cada NPC conocido, descriptores físicos de todos, estado de salud, habilidades, atributos, estado del mundo (política, economía, facciones). Ningún campo puede quedar con un valor de antes del salto.
18. COHERENCIA TOTAL: Los descriptores, atributos y estado del personaje deben ser siempre coherentes entre sí y con la narración. Si la narración describe que el personaje está herido, estadoFisico debe decir "Lesionado" o similar. Si envejeció, su descripción debe reflejarlo. No hay excepciones.

FORMATO DE RESPUESTA: Devuelve PRIMERO el texto narrativo (mínimo 3-5 párrafos literarios en español), luego la línea exacta "---META---", luego un objeto JSON (ver schema en el prompt del usuario).

REGLAS CRÍTICAS DEL META JSON — después del ---META---:
- "ingameTime": SIEMPRE actualiza timeOfDay. Actualiza day/month/year SOLO si el tiempo narrativo avanzado lo justifica.
- "skillUpdates": SOLO cuando el personaje practica, aprende o mejora una habilidad en la narración. Usa "isNew: true" para habilidades completamente nuevas.
- "psychologyUpdates": SOLO cuando ocurre algo que genuinamente afecta la psicología. "traumaAdded" solo para eventos traumáticos mayores.
- "newNPCs": OBLIGATORIO en el turno de nacimiento (__BIRTH__): incluye a la MADRE, el PADRE, y cualquier otro familiar presente en el nacimiento. En turnos posteriores: añade SOLO personajes que aparecen por PRIMERA VEZ en la narración y que el personaje lógicamente pasaría a conocer. NUNCA incluyas en "newNPCs" a un NPC que ya aparece en PERSONAS CONOCIDAS — para esos usa "npcUpdates".
- "npcUpdates": Si el año narrativo avanzó, incluye TODOS los NPCs conocidos con sus edades recalculadas (año_actual − año_nacimiento) y descripciones físicas actualizadas. Para NPCs que aparecen en la narración: actualiza también ubicación, relación y estado.
- "newFacciones": OBLIGATORIO en el turno de nacimiento (__BIRTH__): incluye las 2-4 facciones más importantes y presentes en el contexto histórico y geográfico (Iglesia, autoridad local, gremios, etc.). En turnos posteriores: añade solo facciones que el personaje descubre o con las que interactúa por primera vez. NUNCA repitas una facción ya registrada.
- "factionUpdates": Actualiza SOLO las facciones ya registradas que son relevantes a esta acción/narración.
- "worldStateUpdates": Actualiza SOLO los campos que cambian en esta narración. El resto deja como null.
- "scheduledConsequence": Solo cuando la acción tiene consecuencias futuras reales y no obvias.
- "characterFieldUpdates": OBLIGATORIO en el primer turno (__BIRTH__): rellena motherName, fatherName, birthPlace (ciudad/pueblo concreto acorde a la época y región), motherTongue, religion y currentDescription con valores históricos auténticos. En CADA turno donde el año cambia o el personaje envejece: REESCRIBE currentDescription con la descripción física y estado actuales coherentes con la edad exacta calculada. En turnos donde el aspecto o estado cambia: REESCRIBE currentDescription. NUNCA dejes currentDescription con una descripción de una edad o estado anterior.
- "descriptorUpdates": REESCRIBE los descriptores que hayan cambiado por el paso del tiempo o por eventos. NO dejes valores que ya no sean coherentes con el estado actual.
- "attributeUpdates": REESCRIBE los atributos afectados por tiempo transcurrido, envejecimiento o eventos.
- NUNCA incluyas arrays vacíos — usa null si no hay actualizaciones.`;
}

function buildUserPrompt(config: {
  character: Record<string, any>;
  worldState: Record<string, any>;
  recentHistory: any[];
  activeEchoes: any[];
  playerAction: string;
  currentLocation: Record<string, any>;
  inGameDateTime: string;
  innerVoiceContext?: string;
  consequenceQueue?: any[];
  existingNPCs?: any[];
  realisticAttributes?: Record<string, any>;
  descriptors?: Record<string, any>;
  isTimeJump?: boolean;
  timeJumpYears?: number;
  memoriaNarrador?: { notasLibres?: string; reglasDeLaPartida?: string; hechosCanonicos?: string[]; resumen?: string };
  inventory?: any[];
  facciones?: any[];
  currency?: { name?: string; amount?: number; context?: string };
}): string {
  const nearbyNPCs = (config.worldState.nearbyNPCs || [])
    .map((n: any) => `${n.name} (${n.disposition})`).join(', ');

  const recentHistoryText = config.recentHistory.slice(-RECENT_TURNS_LIMIT)
    .map((e: any) => `- [${e.timestampIngame || e.timestamp_ingame || '?'}] ${e.narrativeSnapshot || e.narrative_snapshot || e.text || ''}`)
    .join('\n');

  const echoText = config.activeEchoes
    .filter((e: any) => (e.discoveryDifficulty ?? 1) < 0.7)
    .map((e: any) => `- ${e.echoType}: ${(e.echoData as any)?.currentManifestations?.[0]?.description || ''}`)
    .join('\n') || 'ninguno disponible ahora';

  const consequenceText = (config.consequenceQueue || [])
    .filter((c: any) => !c.resolved && c.status !== 'Cancelada' && c.status !== 'Resuelta')
    .map((c: any) => {
      const isTrigger = (c.scheduledTurn ?? 99) <= 0;
      return isTrigger
        ? `⚡ CONSECUENCIA QUE SE MANIFIESTA AHORA: ${c.description}`
        : `⏳ CONSECUENCIA PENDIENTE (en ~${c.scheduledTurn} turnos): ${c.description}`;
    })
    .join('\n');

  const attrs = config.realisticAttributes || {};
  const desc = config.descriptors || {};

  const attributesBlock = `
ATRIBUTOS REALISTAS DEL PERSONAJE (afectan mecánicamente la narrativa):
DIMENSIONES VITALES:
- Integridad Física: ${attrs.integridadFisica || 'Impecable'}
- Reserva Metabólica: ${attrs.reservaMetabolica || 'Saciado'}
- Carga Cognitiva: ${attrs.cargaCognitiva || 'Alerta'}
- Umbral de Estrés: ${attrs.umbralDeEstres || 'Imperturbable'}
PERFIL DE COMPETENCIA:
- Aptitud Motriz: ${attrs.aptitudMotriz || 'Funcional'}
- Intelecto Aplicado: ${attrs.intelectoAplicado || 'Promedio'}
- Presencia Social: ${attrs.presenciaSocial || 'Común'}
- Estatus de Casta: ${attrs.estatusDeCasta || 'Plebeyo'}`;

  const skillsBlock = (attrs.eraSkills || []).length > 0
    ? `\nHABILIDADES DEL PERSONAJE:\n${(attrs.eraSkills as any[]).map((s: any) => `- ${s.name} [${s.grade || 'Ignorante'}]${s.category ? ` (${s.category})` : ''}`).join('\n')}`
    : '\nHABILIDADES: Sin habilidades registradas aún.';

  const psychologyBlock = `
PSICOLOGÍA:
- Miedos: ${(config.character?.fears || []).join(', ') || 'ninguno registrado'}
- Deseos profundos: ${(config.character?.desires || []).join(', ') || 'ninguno registrado'}
- Traumas: ${(config.character?.traumas || []).map((t: any) => t.description || t).join(', ') || 'ninguno'}`;

  const descriptorsBlock = `
DESCRIPTORES DEL PERSONAJE (actualizar con descriptorUpdates cuando cambien):
- Estado Físico: ${desc.estadoFisico || 'Saludable'}
- Condición Mental: ${desc.condicionMental || 'Lúcido'}
- Combate: ${desc.combate || 'Sin entrenamiento'}
- Habilidades Sociales: ${desc.habilidadesSociales || 'Reservado'}
- Conocimiento: ${desc.conocimiento || 'Básico'}
POSICIONAMIENTO Y REPUTACIÓN:
- Condición Social: ${desc.condicionSocial || config.character?.socialClass || 'Desconocida'}
- Reputación Local: ${desc.reputacionLocal || 'Desconocido'}
- Renombre Global: ${desc.renombreGlobal || 'Anónimo'}`;

  const inventoryBlock = (config.inventory || []).length > 0
    ? `\nINVENTARIO ACTUAL:\n${(config.inventory || []).map((i: any) => `- ${i.name}${i.condition ? ` [${i.condition}]` : ''}${i.quantity && i.quantity > 1 ? ` x${i.quantity}` : ''}`).join('\n')}`
    : '\nINVENTARIO: Vacío.';

  const currencyBlock = config.currency?.name
    ? `\nMONEDA: ${config.currency.amount ?? 0} ${config.currency.name}${config.currency.context ? ` (${config.currency.context})` : ''}`
    : '';

  const npcBlock = (config.existingNPCs || []).slice(-MAX_NPCS_IN_CONTEXT).length > 0
    ? `\nPERSONAS CONOCIDAS:\n${(config.existingNPCs || []).slice(-MAX_NPCS_IN_CONTEXT).map((n: any) => {
        const rel = n.relationship || {};
        const status = n.status !== 'vivo' ? ` [${n.status?.toUpperCase()}]` : '';
        const charge = rel.emotionalCharge ? ` — Relación: ${rel.emotionalCharge}` : '';
        const location = n.lastKnownLocation ? ` — Ubicación: ${n.lastKnownLocation}` : '';
        const occupation = n.occupation ? ` (${n.occupation})` : '';
        return `- ${n.name}${occupation}${status}${charge}${location}`;
      }).join('\n')}`
    : '\nPERSONAS CONOCIDAS: Ninguna aún.';

  const factionsBlock = (config.facciones || []).slice(-MAX_FACCIONES_IN_CONTEXT).length > 0
    ? `\nFACCIONES Y ORGANIZACIONES:\n${(config.facciones || []).slice(-MAX_FACCIONES_IN_CONTEXT).map((f: any) => {
        const rep = f.playerReputation !== undefined ? ` [Reputación del personaje: ${f.playerReputation}/100]` : '';
        const rel = f.relationToPlayer ? ` (${f.relationToPlayer})` : '';
        return `- ${f.name}${rel}${rep}: ${f.currentSituation || f.description || ''}`;
      }).join('\n')}`
    : '';

  const worldBlock = `
ESTADO DEL MUNDO:
- Estación: ${config.worldState?.season || 'desconocida'}
- Clima: ${config.worldState?.weather || 'despejado'}${config.worldState?.temperature ? ` (${config.worldState.temperature})` : ''}
- Hora del día: ${config.worldState?.timeOfDay || 'desconocida'}
- Clima político local: ${config.worldState?.localPolitics || config.worldState?.politicalClimate || 'estable'}
- Religión dominante: ${config.worldState?.religion || 'desconocida'}
- Economía: ${config.worldState?.economy || 'desconocida'}
- Conflictos activos: ${(config.worldState?.activeConflicts || config.worldState?.activeEvents || []).join(', ') || 'ninguno'}${nearbyNPCs ? `\n- NPCs cercanos: ${nearbyNPCs}` : ''}`;

  const timeJumpBlock = config.isTimeJump ? `
INSTRUCCIÓN DE SALTO TEMPORAL: El personaje ha decidido avanzar ${config.timeJumpYears} años en el tiempo.
Narra TODO lo que ocurre en esos ${config.timeJumpYears} años de manera cinematográfica y detallada.
Mínimo 600 palabras. Cubre momentos clave, cambios de vida, envejecimiento de NPCs, cambios de atributos.
IMPORTANTE: Resuelve automáticamente en el META JSON todas las consecuencias pendientes que habrían ocurrido durante ese período.` : '';

  const mem = config.memoriaNarrador;
  const hasMemoria = mem && (mem.resumen || mem.notasLibres || mem.reglasDeLaPartida || (mem.hechosCanonicos || []).length > 0);
  const memoriaBlock = hasMemoria ? `

═══════════════════════════════════════════
MEMORIA DEL NARRADOR (máxima prioridad — define la historia hasta ahora):
${mem?.resumen ? `▸ RESUMEN DEL PASADO (reemplaza historia completa — usa esto como base):\n${mem.resumen}\n` : ''}
${mem?.reglasDeLaPartida ? `REGLAS DE ESTA PARTIDA (nunca violar):\n${mem.reglasDeLaPartida}` : ''}
${mem?.notasLibres ? `NOTAS ADICIONALES:\n${mem.notasLibres}` : ''}
${(mem?.hechosCanonicos || []).length > 0 ? `HECHOS CANÓNICOS (verdades inmutables):\n${(mem!.hechosCanonicos as string[]).map((h) => `• ${h}`).join('\n')}` : ''}
═══════════════════════════════════════════` : '';

  const charReligion = config.character?.religion || config.character?.beliefs?.religion || '—';
  const charLanguage = config.character?.motherTongue || config.character?.language || config.character?.beliefs?.language || '—';
  const charBirthPlace = config.character?.birthPlace || config.character?.origin || '—';

  return `═══ ESTADO COMPLETO DEL JUEGO ═══
FECHA/HORA EN EL JUEGO: ${config.inGameDateTime || 'Desconocida'}
UBICACIÓN: ${config.currentLocation?.name || 'Desconocida'}${config.currentLocation?.description ? ` — ${config.currentLocation.description}` : ''}

═══ PERSONAJE ═══
Nombre: ${config.character?.name || 'Desconocido'} | Edad: ${config.character?.age ?? 0} años | Género: ${config.character?.gender || '—'}
Origen: ${charBirthPlace} | Religión: ${charReligion} | Lengua: ${charLanguage}
Padre: ${config.character?.fatherName || '—'} | Madre: ${config.character?.motherName || '—'}
Clase Social: ${config.character?.socialClass || '—'}
Salud: ${config.character?.stats?.health ?? 100}/100 | Energía: ${config.character?.stats?.energy ?? 100}/100 | Hambre: ${config.character?.stats?.hunger ?? 50}/100
Moral: ${config.character?.stats?.morale ?? 70}/100 | Salud mental: ${config.character?.stats?.mentalHealth ?? 80}/100
${attributesBlock}
${skillsBlock}
${psychologyBlock}
${descriptorsBlock}
${inventoryBlock}
${currencyBlock}
${npcBlock}
${factionsBlock}
${worldBlock}

${config.innerVoiceContext ? `VOZ INTERIOR DEL PERSONAJE (pensamientos recientes): "${config.innerVoiceContext}"` : ''}

═══ HISTORIAL RECIENTE ═══
${recentHistoryText || 'Sin historial — esto es el comienzo.'}

${consequenceText ? `═══ CONSECUENCIAS PENDIENTES ═══\n${consequenceText}\n` : ''}

ECOS DE VIDAS PASADAS (integrar naturalmente si aplica, nunca mencionar explícitamente):
${echoText}
${memoriaBlock}
${timeJumpBlock}

═══ ACCIÓN DEL JUGADOR ═══
"${config.playerAction}"

Narra el resultado de esta acción. Lee TODO el estado anterior. Sé específico. Sé consecuente. Avanza el tiempo solo lo que la acción justifica. En el META JSON, resuelve consecuencias si aplica.

RECORDATORIO OBLIGATORIO PARA EL META JSON:
▸ REESCRIBIR NO AÑADIR — en cada campo que haya cambiado, escribe el nuevo valor completo.
▸ characterFieldUpdates.currentDescription: REESCRIBE si el aspecto, edad o estado cambió. Nunca dejes una descripción de un momento anterior.
▸ npcUpdates: si el año narrativo cambió, incluye ABSOLUTAMENTE TODOS los NPCs conocidos con su edad recalculada (año_actual − año_nacimiento) y descripción física coherente con esa edad real. No omitas ninguno.
▸ attributeUpdates y descriptorUpdates: REESCRIBE todos los valores que ya no sean coherentes con el estado actual.
▸ Solo escribe null en campos que realmente no han cambiado.

${STATE_UPDATE_JSON_SCHEMA}`;
}

// ─── PASO 5: FLUJO DE GENERACIÓN CON LLAMADAS SEPARADAS ─────────────────────

// Helper para parsear el JSON del bloque ---META---
function parseMetaJson(rawText: string): { narrative: string; meta: any } {
  const sepIdx = rawText.indexOf('---META---');
  let narrative: string;
  let meta: any = {};

  if (sepIdx !== -1) {
    narrative = rawText.slice(0, sepIdx).trim();
    const metaPart = rawText.slice(sepIdx + 10).trim();
    try {
      const jsonMatch = metaPart.match(/\{[\s\S]*\}/);
      if (jsonMatch) meta = JSON.parse(jsonMatch[0]);
    } catch {
      meta = {};
    }
  } else {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        meta = JSON.parse(jsonMatch[0]);
        narrative = meta.narrative || rawText;
      } catch {
        narrative = rawText;
      }
    } else {
      narrative = rawText;
    }
  }

  return { narrative: narrative || rawText, meta };
}

function buildNarrativeResponse(narrative: string, meta: any) {
  return {
    narrative,
    timeAdvanced: meta.timeAdvanced ?? 30,
    ingameTime: meta.ingameTime ?? null,
    eventType: meta.eventType ?? "action",
    legacyWeight: meta.legacyWeight ?? 0.3,
    shouldGenerateImage: meta.shouldGenerateImage ?? false,
    mood: meta.mood ?? null,
    characterStatChanges: meta.characterStatChanges ?? null,
    attributeUpdates: meta.attributeUpdates ?? null,
    descriptorUpdates: meta.descriptorUpdates ?? null,
    skillUpdates: meta.skillUpdates ?? null,
    psychologyUpdates: meta.psychologyUpdates ?? null,
    suggestedActions: meta.suggestedActions ?? [],
    worldStateUpdates: meta.worldStateUpdates ?? null,
    newNPCs: meta.newNPCs ?? [],
    npcUpdates: meta.npcUpdates ?? null,
    newFacciones: meta.newFacciones ?? [],
    factionUpdates: meta.factionUpdates ?? null,
    inventoryChanges: meta.inventoryChanges ?? null,
    currencyChange: meta.currencyChange ?? null,
    personalHistoryEvent: meta.personalHistoryEvent ?? null,
    hiddenLayer: meta.hiddenLayer ?? null,
    scheduledConsequence: meta.scheduledConsequence ?? null,
    consequenceResolutions: meta.consequenceResolutions ?? null,
    characterFieldUpdates: meta.characterFieldUpdates ?? null,
    customSectionUpdates: meta.customSectionUpdates ?? meta.customSectionsUpdate ?? null,
    fullStateSnapshot: meta.fullStateSnapshot ?? meta.stateSnapshot ?? meta.fullState ?? null,
  };
}

// ─── RUTAS ───────────────────────────────────────────────────────────────────

// PASO 7 — Integración final: /generate usa dos llamadas IA separadas
router.post("/generate", async (req, res) => {
  const provider = resolveAIProvider(req.body?.aiProvider);
  try {
    const {
      playerAction, voice, tone, character, worldState,
      activeEchoes = [], currentLocation,
      inGameDateTime, era, gameConfig, innerVoiceContext,
      consequenceQueue, existingNPCs, currentTurn,
      realisticAttributes, descriptors,
      isTimeJump, timeJumpYears, memoriaNarrador,
      inventory, facciones, currency, customSections,
    } = req.body;

    const recentHistory = (req.body.recentHistory || []).slice(-RECENT_TURNS_LIMIT);
    if (!playerAction) return res.status(400).json({ error: "playerAction required" });

    const narrationSystemPrompt = buildNarrationSystemPrompt({
      gameConfig: gameConfig || {}, voice, tone, era: era || {}, character, currentTurn,
      isTimeJump, timeJumpYears,
    });
    const narrationUserPrompt = buildNarrationUserPrompt({
      character, worldState, recentHistory, activeEchoes,
      playerAction, currentLocation: currentLocation || {}, inGameDateTime,
      innerVoiceContext, consequenceQueue, existingNPCs,
      realisticAttributes, descriptors, isTimeJump, timeJumpYears, memoriaNarrador,
      inventory, facciones, currency,
    });

    const { text: narrative, usage: narrationUsage } = await generateWithProvider(
      provider, "narration", narrationUserPrompt, narrationSystemPrompt,
    );

    const stateSystemPrompt = buildStateUpdateSystemPrompt();
    const stateUserPrompt = buildStateUpdateUserPrompt({
      narrative: narrative.trim(),
      playerAction,
      character: character || {},
      worldState: worldState || {},
      realisticAttributes: realisticAttributes || {},
      descriptors: descriptors || {},
      existingNPCs: existingNPCs || [],
      facciones: facciones || [],
      inventory: inventory || [],
      currency: currency || {},
      consequenceQueue: consequenceQueue || [],
      memoriaNarrador,
      isTimeJump,
      timeJumpYears,
      customSections: customSections || [],
    });

    const { text: rawStateText, usage: stateUsage } = await generateWithProvider(
      provider, "state", stateUserPrompt, stateSystemPrompt,
    );
    const genSepIdx = rawStateText.indexOf('---META---');
    const genJsonSource = genSepIdx !== -1 ? rawStateText.slice(genSepIdx + 10).trim() : rawStateText.trim();
    const meta = safeParseJSON(genJsonSource, '/generate');

    const tokenUsage: TokenUsage & { narrationInput: number; narrationOutput: number; stateInput: number; stateOutput: number } = {
      inputTokens: narrationUsage.inputTokens + stateUsage.inputTokens,
      outputTokens: narrationUsage.outputTokens + stateUsage.outputTokens,
      narrationInput: narrationUsage.inputTokens,
      narrationOutput: narrationUsage.outputTokens,
      stateInput: stateUsage.inputTokens,
      stateOutput: stateUsage.outputTokens,
      provider,
      estimated: narrationUsage.estimated || stateUsage.estimated,
    };

    res.json({ ...buildNarrativeResponse(narrative.trim(), meta), tokenUsage });
  } catch (err) {
    console.error(err);
    if (isProviderBudgetExceeded(err, provider)) {
      return res.status(402).json(budgetExceededResponse(provider));
    }
    res.status(500).json({ error: "Failed to generate narrative" });
  }
});

// PASO 7 — Integración final: /stream usa dos llamadas IA separadas
// Streaming de narración (llamada 1) + estado (llamada 2) separados
router.post("/stream", async (req, res) => {
  const provider = resolveAIProvider(req.body?.aiProvider);
  try {
    const {
      playerAction, voice, tone, character, worldState,
      activeEchoes = [], currentLocation,
      inGameDateTime, era, gameConfig, innerVoiceContext,
      consequenceQueue, existingNPCs, currentTurn,
      realisticAttributes, descriptors,
      isTimeJump, timeJumpYears, memoriaNarrador,
      inventory, facciones, currency, customSections,
    } = req.body;

    const recentHistory = (req.body.recentHistory || []).slice(-RECENT_TURNS_LIMIT);
    if (!playerAction) return res.status(400).json({ error: "playerAction required" });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof (res as any).flushHeaders === 'function') (res as any).flushHeaders();

    const narrationSystemPrompt = buildNarrationSystemPrompt({
      gameConfig: gameConfig || {}, voice, tone, era: era || {}, character, currentTurn,
      isTimeJump, timeJumpYears,
    });
    const narrationUserPrompt = buildNarrationUserPrompt({
      character, worldState, recentHistory, activeEchoes,
      playerAction, currentLocation: currentLocation || {}, inGameDateTime,
      innerVoiceContext, consequenceQueue, existingNPCs,
      realisticAttributes, descriptors, isTimeJump, timeJumpYears, memoriaNarrador,
      inventory, facciones, currency,
    });

    let narrativeText = '';

    for await (const chunk of streamWithProvider(
      provider,
      narrationUserPrompt,
      narrationSystemPrompt,
    )) {
      narrativeText += chunk;
      res.write(chunk);
    }

    const stateSystemPrompt = buildStateUpdateSystemPrompt();
    const stateUserPrompt = buildStateUpdateUserPrompt({
      narrative: narrativeText.trim(),
      playerAction,
      character: character || {},
      worldState: worldState || {},
      realisticAttributes: realisticAttributes || {},
      descriptors: descriptors || {},
      existingNPCs: existingNPCs || [],
      facciones: facciones || [],
      inventory: inventory || [],
      currency: currency || {},
      consequenceQueue: consequenceQueue || [],
      memoriaNarrador,
      isTimeJump,
      timeJumpYears,
      customSections: customSections || [],
    });

    const { text: rawStreamState, usage: stateUsage } = await generateWithProvider(
      provider, "state", stateUserPrompt, stateSystemPrompt,
    );

    let parsedMeta: any = {};
    {
      const sepIdx = rawStreamState.indexOf('---META---');
      const jsonSource = sepIdx !== -1 ? rawStreamState.slice(sepIdx + 10).trim() : rawStreamState.trim();
      const parsed = safeParseJSON(jsonSource, '/stream');
      if (Object.keys(parsed).length > 0) parsedMeta = parsed;
    }

    const narrationInputEst = estimateTokens(narrationUserPrompt + narrationSystemPrompt);
    const narrationOutputEst = estimateTokens(narrativeText);
    parsedMeta.tokenUsage = {
      inputTokens: narrationInputEst + stateUsage.inputTokens,
      outputTokens: narrationOutputEst + stateUsage.outputTokens,
      narrationInput: narrationInputEst,
      narrationOutput: narrationOutputEst,
      stateInput: stateUsage.inputTokens,
      stateOutput: stateUsage.outputTokens,
      provider,
      estimated: true,
    };

    res.write('\n---META---\n');
    res.write(JSON.stringify(parsedMeta));
    res.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      if (isProviderBudgetExceeded(err, provider)) {
        return res.status(402).json(budgetExceededResponse(provider));
      }
      res.status(500).json({ error: "Failed to stream narrative" });
    } else {
      res.write('\n---META---\n{}');
      res.end();
    }
  }
});

router.post("/dream", async (req, res) => {
  const provider = resolveAIProvider(req.body?.aiProvider);
  try {
    const { character, emotionalClimate, innerVoiceLog = [], recentEvents = [], era } = req.body;

    const prompt = `El personaje ${character?.name || 'el personaje'} (${character?.age ?? 0} años) acaba de dormirse en ${era?.eraLabel || 'su época'}.
Estado emocional actual: ${emotionalClimate || 'sereno'}
Pensamientos recientes: ${innerVoiceLog.slice(-3).join(' | ') || 'ninguno'}
Eventos recientes: ${recentEvents.slice(-3).join(' | ') || 'ninguno'}

Genera un sueño breve (2-3 párrafos en español) que refleje su estado psicológico. El sueño puede ser:
- Simbólico (metáforas de sus miedos/deseos)
- Un recuerdo distorsionado
- Una visión premonitoria vaga
- Puro absurdo onírico

Empieza directamente con el sueño, sin introducción. Usa lenguaje poético y evocador.`;

    const { text: dreamText, usage } = await generateWithProvider(provider, "state", prompt);
    res.json({
      dream: dreamText || "Un sueño que se disuelve al despertar...",
      tokenUsage: { ...usage, narrationInput: 0, narrationOutput: 0, stateInput: usage.inputTokens, stateOutput: usage.outputTokens },
    });
  } catch (err) {
    console.error(err);
    if (isProviderBudgetExceeded(err, provider)) {
      return res.status(402).json(budgetExceededResponse(provider));
    }
    res.status(500).json({ error: "Failed to generate dream" });
  }
});

router.post("/state-update", async (req, res) => {
  const provider = resolveAIProvider(req.body?.aiProvider);
  try {
    const { character, worldState, recentHistory = [], existingNPCs = [], facciones = [], realisticAttributes, descriptors, inventory = [], currency, era, memoriaNarrador, sections = [], manualInstructions = '', customSections = [] } = req.body;

    const ingameYear = worldState?.ingameYear || era?.year || '?';
    const birthYear = character?.birthYear || (era?.year && character?.age != null ? era.year - character.age : '?');

    const npcList = (existingNPCs || []).slice(-MAX_NPCS_IN_CONTEXT).map((n: any) => {
      const rel = n.relationship || {};
      const npcBirthYear = n.birthYear || (ingameYear && n.estimatedAge != null ? Number(ingameYear) - n.estimatedAge : null);
      return `- ${n.name} | ${n.estimatedAge ?? '?'} años actuales${npcBirthYear ? ` | nacido ~${npcBirthYear}` : ''} | ${n.status || 'vivo'} | ${rel.type || 'conocido'} | ${rel.emotionalCharge || ''} | ubicación: ${n.lastKnownLocation || 'desconocida'} | físico: ${n.physicalDescription || 'sin descripción'}`;
    }).join('\n') || 'Ninguno';

    const faccList = (facciones || []).slice(-MAX_FACCIONES_IN_CONTEXT).map((f: any) => `- ${f.name} [${f.type}]: ${f.currentSituation || f.description || ''} [Rep jugador: ${f.playerReputation ?? 50}/100] [Relación: ${f.relationToPlayer}]`).join('\n') || 'Ninguna';

    const sectionFilter = sections.length > 0 ? `\nACTUALIZAR SOLO ESTAS SECCIONES: ${sections.join(', ')}. Si el jugador añadió instrucciones manuales, aplícalas aunque no haya sección marcada. Mapa corresponde a worldState.currentLocation y lugares; Fecha/Tiempo corresponde a ingameTime/worldState.ingameDate; Secciones personalizadas corresponde a customSectionUpdates/fullStateSnapshot.customSections.` : '\nACTUALIZAR TODAS LAS SECCIONES.';

    // PASO 1: Historial limitado en state-update también
    const historyText = (recentHistory || [])
      .slice(-RECENT_TURNS_LIMIT)
      .map((h: any) => `[${h.timestampIngame || ''}] ${h.narrativeSnapshot || ''}`)
      .filter((s: string) => s.trim().length > 5)
      .join('\n---\n') || 'Sin historial narrativo disponible.';

    const manualBlock = manualInstructions?.trim()
      ? `\n\n╔══════════════════════════════════════════════╗\n║ INSTRUCCIONES MANUALES DEL JUGADOR — MÁXIMA PRIORIDAD ║\n╚══════════════════════════════════════════════╝\n${manualInstructions.trim()}\n\nDebes ejecutar exactamente lo que el jugador indica. No puedes ignorarlo. No puedes responder que ya está correcto si el jugador dice que no lo está. No puedes aplicarlo parcialmente. Esta instrucción tiene precedencia absoluta sobre cualquier otra consideración.\n`
      : '';

    const prompt = `Eres el narrador-corrector del NEXUS ENGINE. Tu tarea es analizar el historial narrativo reciente y el estado actual del juego, y REESCRIBIR ACTIVAMENTE todos los campos que estén desactualizados, incorrectos o incompletos. NO AÑADAS ENCIMA — REESCRIBE.

REGLA FUNDAMENTAL PERMANENTE: REESCRIBIR NO AÑADIR. En cada campo que hayas de actualizar, escribe el nuevo valor completo, no uno parcial ni un delta. Los campos que estén correctos devuélvelos como null.
PROHIBIDO: Devolver falsos positivos. Si algo no está actualizado correctamente, DEBES modificarlo. No puedes asumir que "todo está bien" — debes verificar activamente cada campo contra el historial narrativo.${manualBlock}${sectionFilter}

AÑO NARRATIVO ACTUAL: ${ingameYear}
FECHA COMPLETA: ${worldState?.ingameDate || '?'}

PERSONAJE:
Nombre: ${character?.name || '?'}
Edad en ficha: ${character?.age ?? '?'} años | Año nacimiento: ${birthYear}
Edad correcta = ${ingameYear} - ${birthYear} = ${typeof ingameYear === 'number' && typeof birthYear === 'number' ? ingameYear - birthYear : '(recalcular)'}
Descripción física actual: ${character?.appearance?.freeDescription || character?.currentDescription || 'Sin descripción'}
Ocupación: ${character?.occupation || character?.role || '?'}
Clase social: ${character?.socialClass || '?'}
Salud: ${character?.stats?.health ?? 100}/100 | Energía: ${character?.stats?.energy ?? 100}/100 | Moral: ${character?.stats?.morale ?? 70}/100

ATRIBUTOS ACTUALES: ${JSON.stringify(realisticAttributes || {})}
DESCRIPTORES ACTUALES: ${JSON.stringify(descriptors || {})}

NPCs CONOCIDOS (actualiza edad = ${ingameYear} - año_nacimiento_npc):
${npcList}

FACCIONES:
${faccList}

INVENTARIO: ${(inventory || []).map((i: any) => `${i.name} (${i.condition || 'desconocida'})`).join(', ') || 'Vacío'}
MONEDA: ${currency?.amount ?? 0} ${currency?.name || 'monedas'}

MUNDO:
Localización actual: ${worldState?.currentLocation?.name || '?'} (${worldState?.currentLocation?.region || ''} ${worldState?.currentLocation?.territory || ''})
Política local: ${worldState?.localPolitics || '?'}
Economía: ${worldState?.economy || '?'}
Clima/estación: ${worldState?.weather || '?'} / ${worldState?.season || '?'}

MEMORIA IA — RESUMEN DEL PASADO (base de coherencia — reemplaza historia completa):
${memoriaNarrador?.resumen ? memoriaNarrador.resumen : '(sin resumen generado aún — usa el historial reciente)'}

MEMORIA DEL NARRADOR:
${memoriaNarrador?.notasLibres || 'Sin notas'}
${memoriaNarrador?.reglasDeLaPartida || ''}
${(memoriaNarrador?.hechosCanonicos || []).join('\n') || ''}

SECCIONES PERSONALIZADAS DEL JUGADOR:
${(customSections as any[]).length > 0
  ? (customSections as any[]).map((s: any) => `[${s.id || s.title}] ${s.title} (scope: ${s.scope || 'global'})\n${(s.fields || []).map((f: any) => `  ${f.key} [${f.type || 'text'}${f.aiManaged === false ? ', manual' : ', IA'}]: ${f.value}`).join('\n')}`).join('\n\n')
  : 'Ninguna sección personalizada.'}

HISTORIAL RECIENTE (últimos ${RECENT_TURNS_LIMIT} turnos):
${historyText}

Genera SOLO el objeto JSON de actualización. Sin texto narrativo. Sin markdown. Sin explicaciones fuera del JSON.
El JSON debe usar exactamente este formato — devuelve null en los campos que no necesitan cambio:

{
  "attributeUpdates": { "integridadFisica": "...|null", "reservaMetabolica": "...|null", "cargaCognitiva": "...|null", "umbralDeEstres": "...|null", "aptitudMotriz": "...|null", "intelectoAplicado": "...|null", "presenciaSocial": "...|null", "estatusDeCasta": "...|null" },
  "descriptorUpdates": { "estadoFisico": "...|null", "condicionMental": "...|null", "combate": "...|null", "habilidadesSociales": "...|null", "conocimiento": "...|null", "reputacionLocal": "...|null", "renombreGlobal": "...|null", "condicionSocial": "...|null" },
  "characterStatChanges": { "health": null, "energy": null, "hunger": null, "morale": null, "mentalHealth": null },
  "characterFieldUpdates": { "currentDescription": "descripción física coherente con edad exacta o null", "age": <edad recalculada o null>, "occupation": "...|null", "motherName": "...|null", "fatherName": "...|null" },
  "worldStateUpdates": { "politicalClimate": "...|null", "localPolitics": "...|null", "economy": "...|null", "weather": "...|null", "season": "...|null" },
  "ingameTime": { "day": <1-31|null>, "month": <1-12|null>, "year": <año|null>, "ingameDate": "<fecha completa|null>", "timeOfDay": "...|null", "dayOfWeek": "...|null" },
  "npcUpdates": [
    { "name": "<nombre exacto>", "estimatedAge": <edad recalculada>, "physicalDescription": "<descripción coherente con esa edad>", "statusUpdate": "vivo|muerto|desaparecido|null", "locationUpdate": "...|null", "motivationsUpdate": "...|null", "fearsUpdate": "...|null", "knownConditionsUpdate": "...|null", "relationUpdate": { "emotionalCharge": "...|null", "emotionalChargeType": "positiva|negativa|tensa|neutral|null", "trustLevel": <0-100|null>, "lastAttitude": "...|null" } }
  ],
  "factionUpdates": [
    { "name": "<nombre exacto>", "currentSituationUpdate": "...|null", "reputationChange": <número o null>, "relationToPlayerUpdate": "aliado|neutral|hostil|desconocido|null" }
  ],
  "skillUpdates": [
    { "name": "<habilidad>", "grade": "<Ignorante|Aprendiz|Competente|Experto|Maestro>", "category": "<categoría>", "description": "...", "isNew": false }
  ],
  "customSectionUpdates": [
    { "sectionId": "<id exacto>", "sectionTitle": "<título>", "scope": "<global|character|world|map|npcs|facciones>", "fields": [{"key": "<campo>", "value": "<valor completo actualizado>", "type": "<text|number|list|state|progress|date|tags|table|columns>", "aiManaged": true}] }
  ],
  "customSectionsToCreate": [
    { "title": "<título descriptivo>", "icon": "<emoji>", "scope": "<global|character|world|map|npcs|facciones>", "fields": [{"key": "<nombre campo>", "value": "<valor inicial coherente>", "type": "<text|number|list|state|progress|date|tags|table|columns>", "aiManaged": true}], "aiCreated": true }
  ],
  "fullStateSnapshot": {
    "character": { /* OBJETO completo del personaje (no string). Copia el actual y aplica cambios. */ },
    "worldState": { /* OBJETO worldState completo con ingameDate, ingameYear, currentLocation, etc. */ },
    "realisticAttributes": { /* OBJETO atributos completos */ },
    "descriptors": { /* OBJETO descriptores completos */ },
    "inventory": [ /* ARRAY de objetos item completo */ ],
    "currency": { /* OBJETO moneda completo */ },
    "npcs": [ /* ARRAY completo con TODOS los NPCs conocidos — no omitas ninguno */ ],
    "facciones": [ /* ARRAY completo con TODAS las facciones conocidas — no omitas ninguna */ ],
    "customSections": [ /* ARRAY completo de secciones personalizadas (id, title, scope, fields) */ ],
    "consequenceQueue": [ /* ARRAY de consecuencias pendientes */ ]
  },
  /* IMPORTANTE: Cada subcampo de fullStateSnapshot debe ser un OBJETO o ARRAY JSON válido — NUNCA un string descriptivo. */
  "summary": "Resumen de los cambios realizados en una oración."
}`;

    const { text: stateRaw, usage } = await generateWithProvider(provider, "state", prompt);
    const meta = safeParseJSON(stateRaw, '/state-update');

    res.json({
      ok: true,
      tokenUsage: { ...usage, narrationInput: 0, narrationOutput: 0, stateInput: usage.inputTokens, stateOutput: usage.outputTokens },
      attributeUpdates: meta.attributeUpdates ?? null,
      descriptorUpdates: meta.descriptorUpdates ?? null,
      characterStatChanges: meta.characterStatChanges ?? null,
      characterFieldUpdates: meta.characterFieldUpdates ?? null,
      worldStateUpdates: meta.worldStateUpdates ?? null,
      npcUpdates: meta.npcUpdates ?? null,
      factionUpdates: meta.factionUpdates ?? null,
      inventoryChanges: meta.inventoryChanges ?? null,
      currencyChange: meta.currencyChange ?? null,
      skillUpdates: meta.skillUpdates ?? null,
      psychologyUpdates: meta.psychologyUpdates ?? null,
      ingameTime: meta.ingameTime ?? null,
      customSectionUpdates: meta.customSectionUpdates ?? meta.customSectionsUpdate ?? null,
      fullStateSnapshot: meta.fullStateSnapshot ?? meta.stateSnapshot ?? meta.fullState ?? null,
      newFacciones: meta.newFacciones ?? [],
      newNPCs: meta.newNPCs ?? [],
      summary: meta.summary || 'Estado analizado correctamente.',
    });
  } catch (err) {
    console.error(err);
    if (isProviderBudgetExceeded(err, provider)) {
      return res.status(402).json(budgetExceededResponse(provider));
    }
    res.status(500).json({ error: "Failed to generate state update" });
  }
});

router.post("/suggest", async (req, res) => {
  const provider = resolveAIProvider(req.body?.aiProvider);
  try {
    const { fieldPath, currentValue, suggestion, context } = req.body;
    if (!fieldPath || !suggestion) return res.status(400).json({ error: "fieldPath and suggestion required" });

    const prompt = `Eres el asistente de un juego narrativo de vida procedural. El jugador quiere modificar un campo específico del estado del juego.

CAMPO A MODIFICAR: ${fieldPath}
VALOR ACTUAL: ${JSON.stringify(currentValue || null)}
SUGERENCIA DEL JUGADOR: "${suggestion}"

CONTEXTO DEL JUEGO:
Personaje: ${context?.characterName || '?'} (${context?.age ?? '?'} años)
Era: ${context?.eraLabel || '?'}
Localización: ${context?.location || '?'}

Interpreta la sugerencia del jugador y devuelve el nuevo valor para ese campo, coherente con el contexto histórico y narrativo de la partida.

Responde con JSON: { "newValue": <nuevo valor del campo>, "explanation": "<breve explicación de qué cambia>" }
Solo JSON puro, sin markdown.`;

    const { text: suggestRaw, usage } = await generateWithProvider(provider, "state", prompt);
    let result: any = {};
    try {
      const jsonMatch = suggestRaw.match(/\{[\s\S]*\}/);
      if (jsonMatch) result = JSON.parse(jsonMatch[0]);
    } catch { result = { newValue: suggestion, explanation: 'Aplicado directamente.' }; }

    res.json({
      ok: true,
      newValue: result.newValue,
      explanation: result.explanation,
      tokenUsage: { ...usage, narrationInput: 0, narrationOutput: 0, stateInput: usage.inputTokens, stateOutput: usage.outputTokens },
    });
  } catch (err) {
    console.error(err);
    if (isProviderBudgetExceeded(err, provider)) {
      return res.status(402).json(budgetExceededResponse(provider));
    }
    res.status(500).json({ error: "Failed to generate suggestion" });
  }
});

router.post("/suggest-section", async (req, res) => {
  const provider = resolveAIProvider(req.body?.aiProvider);
  try {
    const { description, mode = 'section', sectionTitle, context } = req.body;
    if (!description) return res.status(400).json({ error: "description required" });

    const ctxLines = context ? [
      context.characterName ? `Personaje: ${context.characterName}${context.age ? ', ' + context.age + ' años' : ''}` : null,
      context.eraLabel ? `Era: ${context.eraLabel}` : null,
      context.location ? `Localización: ${context.location}` : null,
      context.existingFields ? `Campos ya existentes en la sección: ${context.existingFields}` : null,
    ].filter(Boolean).join('\n') : '';

    const TYPE_DOCS = `Tipos de campo disponibles:
- text: texto libre o descriptivo
- number: valor numérico
- list: lista de ítems (uno por línea)
- state: estado corto (activo, pendiente, completado, muerto, etc.)
- progress: porcentaje 0-100
- date: fecha narrativa en texto
- tags: etiquetas separadas por comas
- header: separador visual con título (no tiene valor, organiza grupos de campos)
- table: tabla de "clave: valor" (una por línea, ej: "Aliados: 3\\nEnemigos: 1")
- columns: dos columnas separadas por || (ej: "Izquierda || Derecha")`;

    let prompt: string;

    if (mode === 'field') {
      prompt = `Eres un asistente para un juego de narrativa de vida. El jugador quiere añadir un campo a una sección personalizada.

Sección: "${sectionTitle || 'Sin título'}"
${ctxLines}

DESCRIPCIÓN DEL JUGADOR: "${description}"

${TYPE_DOCS}

Genera UN campo relevante. Responde SOLO con JSON válido, sin texto adicional:
{
  "key": "Nombre corto del campo (1-4 palabras, descriptivo)",
  "value": "Valor inicial relevante al contexto (vacío si es mejor dejarlo sin valor)",
  "type": "text|number|list|state|progress|date|tags|header|table|columns"
}`;
    } else {
      prompt = `Eres un asistente para un juego de narrativa de vida. El jugador quiere crear una sección personalizada de seguimiento.

${ctxLines}

DESCRIPCIÓN DEL JUGADOR: "${description}"

${TYPE_DOCS}

scope options: global (visible en todas partes), character (pestaña personaje), world (mundo), map (mapa), npcs (NPCs), facciones (facciones).

Genera una sección completa y útil. Responde SOLO con JSON válido, sin texto adicional:
{
  "title": "Nombre corto y descriptivo",
  "icon": "Un emoji representativo",
  "scope": "global|character|world|map|npcs|facciones",
  "fields": [
    { "key": "Nombre", "value": "Valor inicial", "type": "text", "aiManaged": true }
  ]
}

Crea 3-8 campos relevantes. Usa "header" para crear separadores visuales entre grupos de campos relacionados. Sé específico y útil para el contexto del juego.`;
    }

    const { text: raw, usage } = await generateWithProvider(provider, "state", prompt);
    const defaultResult = mode === 'field'
      ? { key: description.split(' ').slice(0, 3).join(' '), value: '', type: 'text' }
      : { title: "Nueva sección", icon: "📋", scope: "global", fields: [] };

    let result: any = defaultResult;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) result = JSON.parse(jsonMatch[0]);
    } catch { }

    const tokenUsage = usage
      ? { inputTokens: usage.inputTokens || 0, outputTokens: usage.outputTokens || 0, narrationInput: 0, narrationOutput: 0, stateInput: usage.inputTokens || 0, stateOutput: usage.outputTokens || 0, provider }
      : undefined;

    res.json({ ...result, tokenUsage });
  } catch (err: any) {
    console.error("suggest-section error:", err);
    if (isProviderBudgetExceeded(err, provider)) {
      return res.status(402).json(budgetExceededResponse(provider));
    }
    res.status(500).json({ error: "Failed to generate section suggestion" });
  }
});

router.post("/summarize-run", async (req, res) => {
  try {
    const { runId, events, character, era, endCause, aiProvider } = req.body;
    const provider = resolveAIProvider(aiProvider);
    if (!runId || !events || !character || !era || !endCause) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const significantEvents = events
      .filter((e: any) => (e.legacyWeight || 0) > 0.4)
      .slice(0, 20)
      .map((e: any) => `- [${e.timestampIngame}] ${e.narrativeSnapshot}`)
      .join('\n');

    const prompt = `Escribe un resumen literario de 2-3 párrafos de esta vida completada. En español.
Personaje: ${character.name}, ${character.age} años, en ${era.eraLabel || era.eraName}.
Causa del fin: ${endCause}

Momentos más significativos:
${significantEvents || 'Una vida tranquila con pocos momentos registrados.'}

Escribe en tercera persona, tiempo pasado. Hazlo sentir como un epitafio o registro histórico. Sé específico sobre quién fue esta persona.`;

    const { text: summaryText } = await generateWithProvider(provider, "state", prompt);
    res.json({ summary: summaryText || "Una vida que pasó en silencio." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to summarize run" });
  }
});

// PASO 6 — Actualización de memoria: solo cuando hay eventos importantes
router.post("/memory-update", async (req, res) => {
  const provider = resolveAIProvider(req.body?.aiProvider);
  try {
    const {
      currentResumen = '',
      recentEvents = [],
      character,
      worldState,
      era,
      memoriaNarrador,
    } = req.body;

    const eraLabel = era?.label || era?.name || 'Era desconocida';
    const ingameDate = worldState?.ingameDate || `Año ${era?.year || 0}`;
    const charName = character?.name || 'personaje desconocido';
    const charAge = character?.age ?? '?';
    const location = worldState?.currentLocation?.name || 'ubicación desconocida';

    // Solo tomar los últimos 5 eventos relevantes — nunca historia completa
    const recentEventsText = (recentEvents as string[])
      .slice(-5)
      .filter(Boolean)
      .map((e, i) => `${i + 1}. ${e}`)
      .join('\n') || 'Sin eventos recientes.';

    const canonFacts = (memoriaNarrador?.hechosCanonicos || []).slice(0, 10).join('\n');
    const rules = memoriaNarrador?.reglasDeLaPartida || '';

    const prompt = `Eres el gestor de memoria del NEXUS ENGINE. Tu única tarea es actualizar el RESUMEN ESTRUCTURADO de la partida.

RESUMEN ACTUAL (base para actualizar):
${currentResumen ? currentResumen : '(no hay resumen previo — crea uno completo desde cero)'}

EVENTOS RECIENTES A INTEGRAR:
${recentEventsText}

CONTEXTO ACTUAL:
Personaje: ${charName}, ${charAge} años
Ubicación: ${location}
Fecha en juego: ${ingameDate} (${eraLabel})
${canonFacts ? `Hechos canónicos establecidos:\n${canonFacts}` : ''}
${rules ? `Reglas de la partida:\n${rules}` : ''}

INSTRUCCIONES:
1. Mantén los eventos importantes ya en el resumen — no los elimines.
2. Integra los eventos recientes si son significativos (ignora los triviales).
3. El resumen debe cubrir: eventos clave, relaciones importantes, cambios del mundo, conflictos activos/resueltos.
4. Sé compacto y directo. Máximo 350 palabras. En español.
5. Escribe como un registro histórico objetivo, no narrativo.
6. NO inventes información no presente en los eventos dados.

Responde SOLO con JSON válido, sin markdown, sin explicaciones:
{ "resumen": "<nuevo resumen completo aquí>" }`;

    const { text: memoryRaw, usage } = await generateWithProvider(provider, "state", prompt);
    let resumen = '';
    try {
      const jsonMatch = memoryRaw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        resumen = parsed.resumen || '';
      }
    } catch {
      resumen = memoryRaw.slice(0, 500);
    }

    if (!resumen) throw new Error("Memory update returned empty resumen");

    res.json({
      resumen,
      tokenUsage: { ...usage, narrationInput: 0, narrationOutput: 0, stateInput: usage.inputTokens, stateOutput: usage.outputTokens },
    });
  } catch (err) {
    console.error("Memory update error:", err);
    if (isProviderBudgetExceeded(err, provider)) {
      return res.status(402).json(budgetExceededResponse(provider));
    }
    res.status(500).json({ error: "Failed to update memory" });
  }
});

export default router;
