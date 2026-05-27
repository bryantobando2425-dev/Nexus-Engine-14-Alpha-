import type { GameConfig } from '../engine/types';

export const unaVida: GameConfig = {
  id: 'una-vida',
  name: 'UNA VIDA',
  tagline: 'Vive cualquier vida, en cualquier época, en la Tierra. Sin objetivos. Simplemente existe.',
  description: 'Elige una época, un lugar, un ser. El motor hará el resto. No hay metas, no hay victoria, no hay derrota. Solo una vida vivida turno a turno, en toda su complejidad.',
  status: 'playable',
  backgroundGradient: 'from-slate-900 via-zinc-900 to-stone-950',
  accentColor: '#3d8eff',
  narrativePersonality: 'You are narrating a human life in all its complexity. This is not an adventure — it is existence. The mundane is as important as the dramatic. Births, deaths, love, boredom, hunger, joy, betrayal, kindness — all carry equal narrative weight. Nothing is too small to notice. Nothing is too large to survive.',
  defaultVoice: 'third_person',
  allowsGodMode: true,
};
