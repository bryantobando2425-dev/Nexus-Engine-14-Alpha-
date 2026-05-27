export type ActionComplexity = 'simple' | 'complex';
export type ActionCategory = 'travel' | 'wait' | 'observe' | 'dialogue' | 'action' | 'think' | 'event' | 'system';

const SIMPLE_TRAVEL = [
  'camino', 'voy a', 'me dirijo', 'regreso', 'vuelvo a', 'sigo hacia',
  'avanzo', 'retrocedo', 'me acerco', 'me alejo', 'cruzo', 'subo',
  'bajo', 'entro a', 'salgo de', 'continúo', 'me muevo',
];

const SIMPLE_WAIT = [
  'espero', 'descans', 'me quedo', 'permanezco', 'aguardo',
  'me siento a', 'me recuesto', 'me tumbo', 'me siento tranquil',
  'paso el rato', 'me relajo', 'duermo', 'me duermo',
];

const SIMPLE_OBSERVE = [
  'miro', 'observo el', 'observo la', 'observo los', 'observo las',
  'contemplo', 'veo el', 'veo la', 'echo un vistazo', 'miro alrededor',
  'miro a mi alrededor', 'miro el cielo', 'miro el paisaje',
];

const COMPLEX_PATTERNS = [
  '[diálogo]', '[acción]', '[pienso]', '[observo]',
  'le digo', 'le pregunto', 'le respondo', 'hablo con', 'le hablo',
  'le cuento', 'le confieso', 'le pido', 'le ofrezco',
  'ataco', 'golpeo', 'peleo', 'lucho', 'me defiendo',
  'huyo', 'escapo', 'me escondo', 'me oculto',
  'robo', 'hurto', 'tomo sin', 'agarro', 'cojo sin',
  'busco cuidadosamente', 'investigo', 'examino', 'reviso',
  'negocio', 'regateo', 'compro', 'vendo', 'intercambio',
  'me emociono', 'lloro', 'lloro de', 'grito', 'me enojo',
  'me asusto', 'tiemblo', 'me arrodillo', 'rezo',
  'pienso en', 'recuerdo', 'decido', 'elijo',
  'confieso', 'declaro', 'anuncio', 'prometo',
  'abrazo', 'beso', 'golpeo', 'empujo',
  'escribo', 'dibujo', 'fabrico', 'construyo', 'reparo',
  'cocino', 'preparo', 'mezclo', 'combino',
  'reclamo', 'exijo', 'protesto', 'me quejo',
];

export function classifyAction(
  action: string,
  inputType: string,
  turnCount: number,
): { complexity: ActionComplexity; category: ActionCategory } {
  if (!action) return { complexity: 'complex', category: 'system' };

  const raw = action.toLowerCase().trim();

  if (raw.startsWith('__')) return { complexity: 'complex', category: 'system' };
  if (inputType === 'speak') return { complexity: 'complex', category: 'dialogue' };
  if (inputType === 'think') return { complexity: 'complex', category: 'think' };

  if (COMPLEX_PATTERNS.some((p) => raw.includes(p))) {
    return { complexity: 'complex', category: 'action' };
  }

  const isTravel = SIMPLE_TRAVEL.some((p) => raw.startsWith(p) || raw.includes(' ' + p));
  if (isTravel) return { complexity: 'simple', category: 'travel' };

  const isWait = SIMPLE_WAIT.some((p) => raw.startsWith(p) || raw.includes(' ' + p));
  if (isWait) return { complexity: 'simple', category: 'wait' };

  const isObserve = SIMPLE_OBSERVE.some((p) => raw.startsWith(p) || raw.includes(p));
  if (isObserve) return { complexity: 'simple', category: 'observe' };

  return { complexity: 'complex', category: 'action' };
}
