import type { ActionCategory } from './actionClassifier';

interface TemplateContext {
  characterName: string;
  gender: string;
  age: number;
  location: string;
  locationDesc?: string;
  timeOfDay: string;
  weather: string;
  season: string;
  action: string;
  emotionalClimate: string;
}

interface TemplateResult {
  narrative: string;
  timeAdvanced: number;
  eventType: string;
  legacyWeight: number;
}

const GREET: Record<string, string> = {
  mañana: 'La mañana',
  mediodía: 'El mediodía',
  tarde: 'La tarde',
  noche: 'La noche',
  madrugada: 'La madrugada',
};

const WEATHER_DESC: Record<string, string[]> = {
  despejado: ['el cielo está despejado', 'brilla el sol con claridad', 'la luz del día cae limpia'],
  nublado: ['nubes grises cubren el cielo', 'el cielo está encapotado', 'las nubes pesan sobre el horizonte'],
  lluvia: ['cae una lluvia persistente', 'la lluvia golpea el suelo', 'el agua cae sin pausa'],
  tormenta: ['el trueno retumba a lo lejos', 'una tormenta se cierne', 'el viento azota con fuerza'],
  niebla: ['la niebla envuelve el entorno', 'una neblina baja cubre el camino', 'la bruma difumina los contornos'],
  nieve: ['la nieve cubre el suelo', 'los copos caen en silencio', 'el frío muerde con la blancura del invierno'],
  viento: ['el viento sopla con constancia', 'una brisa recorre el lugar', 'el aire se mueve inquieto'],
};

function weatherDesc(weather: string): string {
  const w = weather.toLowerCase();
  for (const [key, arr] of Object.entries(WEATHER_DESC)) {
    if (w.includes(key)) return arr[Math.floor(Math.random() * arr.length)];
  }
  return 'el tiempo sigue su curso habitual';
}

function pronoun(gender: string): { s: string; p: string; refl: string } {
  const g = gender.toLowerCase();
  if (g.includes('mujer') || g.includes('femen') || g.includes('niña')) {
    return { s: 'ella', p: 'su', refl: 'se' };
  }
  return { s: 'él', p: 'su', refl: 'se' };
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateTravel(ctx: TemplateContext): string {
  const pro = pronoun(ctx.gender);
  const time = GREET[ctx.timeOfDay] || 'El día';
  const wd = weatherDesc(ctx.weather);
  const loc = ctx.location || 'el camino';

  const openings = [
    `${ctx.characterName} pone un pie delante del otro`,
    `${ctx.characterName} retoma el paso`,
    `${ctx.characterName} avanza por ${loc}`,
    `${time} acompaña a ${ctx.characterName} mientras camina`,
  ];

  const middles = [
    `${wd.charAt(0).toUpperCase() + wd.slice(1)}.`,
    `El entorno no cambia de inmediato.`,
    `Los sonidos del lugar marcan el ritmo de ${pro.p} caminar.`,
    `El mundo continúa su marcha indiferente.`,
  ];

  const closings = [
    `El desplazamiento transcurre sin incidentes.`,
    `Nada interrumpe el trayecto.`,
    `El camino se extiende ante ${pro.s} sin sorpresas.`,
    `El tiempo avanza junto con ${pro.p} paso.`,
  ];

  return `${pick(openings)}. ${pick(middles)} ${pick(closings)}`;
}

function generateWait(ctx: TemplateContext): string {
  const pro = pronoun(ctx.gender);
  const wd = weatherDesc(ctx.weather);
  const loc = ctx.location || 'el lugar';

  const phrases = [
    `${ctx.characterName} espera en ${loc}. ${wd.charAt(0).toUpperCase() + wd.slice(1)}. El tiempo pasa lentamente; nada urgente interrumpe el silencio.`,
    `Un momento de pausa en ${loc}. ${ctx.characterName} deja que el entorno siga ${pro.p} curso. ${wd.charAt(0).toUpperCase() + wd.slice(1)}.`,
    `${ctx.characterName} permanece donde está. ${wd.charAt(0).toUpperCase() + wd.slice(1)}. No ocurre nada que exija atención inmediata.`,
    `El descanso es breve. ${ctx.characterName} observa ${loc} sin prisa. ${wd.charAt(0).toUpperCase() + wd.slice(1)}, y el lugar mantiene su ritmo habitual.`,
  ];

  return pick(phrases);
}

function generateObserve(ctx: TemplateContext): string {
  const pro = pronoun(ctx.gender);
  const wd = weatherDesc(ctx.weather);
  const loc = ctx.location || 'los alrededores';

  const phrases = [
    `${ctx.characterName} dirige la vista hacia ${loc}. ${wd.charAt(0).toUpperCase() + wd.slice(1)}. No hay nada que no ${pro.s} ya conociera; el entorno se comporta como de costumbre.`,
    `Una mirada atenta sobre ${loc}. ${wd.charAt(0).toUpperCase() + wd.slice(1)}. Todo parece seguir su curso normal.`,
    `${ctx.characterName} observa el entorno. ${loc.charAt(0).toUpperCase() + loc.slice(1)} se muestra sin novedades evidentes. ${wd.charAt(0).toUpperCase() + wd.slice(1)}.`,
    `Los ojos de ${ctx.characterName} recorren ${loc}. ${wd.charAt(0).toUpperCase() + wd.slice(1)}. Nada fuera de lo ordinario llama ${pro.p} atención.`,
  ];

  return pick(phrases);
}

export function generateTemplateResponse(
  category: ActionCategory,
  ctx: TemplateContext,
): TemplateResult {
  let narrative: string;
  let timeAdvanced = 15;
  let eventType = 'action';
  let legacyWeight = 0.1;

  switch (category) {
    case 'travel':
      narrative = generateTravel(ctx);
      timeAdvanced = pick([20, 30, 45, 60]);
      eventType = 'travel';
      legacyWeight = 0.05;
      break;
    case 'wait':
      narrative = generateWait(ctx);
      timeAdvanced = pick([15, 30, 60]);
      eventType = 'action';
      legacyWeight = 0.05;
      break;
    case 'observe':
      narrative = generateObserve(ctx);
      timeAdvanced = 10;
      eventType = 'action';
      legacyWeight = 0.05;
      break;
    default:
      narrative = generateWait(ctx);
      timeAdvanced = 15;
      eventType = 'action';
      legacyWeight = 0.1;
  }

  return { narrative, timeAdvanced, eventType, legacyWeight };
}
