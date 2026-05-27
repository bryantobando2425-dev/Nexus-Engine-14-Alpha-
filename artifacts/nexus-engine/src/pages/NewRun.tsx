import React, { useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ChevronRight, Sparkles, X, Plus, Info } from 'lucide-react';
import { useEngineStore } from '@/store/engine-store';
import { aiAssist } from '@/lib/api';
import type { ActiveRun, WorldBuilderConfig } from '@/engine/types';
import { deriveInitialAttributes } from '@/engine/types';

const STEPS_HUMANO = ['Modo', 'Introducción', 'Era y Mundo', 'Identidad', 'Apariencia', 'Personalidad', 'Habilidades', 'Creencias', 'Revisión'];

function getEraLabel(year: number): string {
  if (year < -3000) return 'Era Prehistórica';
  if (year < -500) return 'Antigüedad';
  if (year < 500) return 'Época Clásica';
  if (year < 1300) return 'Alta Edad Media';
  if (year < 1500) return 'Baja Edad Media';
  if (year < 1700) return 'Renacimiento';
  if (year < 1800) return 'Ilustración';
  if (year < 1900) return 'Era Industrial';
  if (year < 1950) return 'Principios del Siglo XX';
  if (year < 2000) return 'Era Moderna';
  return 'Era Contemporánea';
}

function getSocialClasses(year: number): string[] {
  if (year < 500) return ['Esclavo', 'Campesino libre', 'Artesano', 'Mercader', 'Soldado', 'Filósofo', 'Sacerdote', 'Patricio', 'Aristócrata', 'Gobernante'];
  if (year < 1300) return ['Siervo', 'Campesino', 'Artesano', 'Mercader', 'Caballero', 'Clérigo', 'Noble', 'Rey'];
  if (year < 1500) return ['Siervo', 'Campesino', 'Artesano', 'Mercader', 'Burgués', 'Caballero', 'Clérigo', 'Noble'];
  if (year < 1800) return ['Campesino', 'Artesano', 'Comerciante', 'Burgués', 'Clérigo', 'Militar', 'Noble'];
  if (year < 1920) return ['Campesino', 'Obrero', 'Artesano', 'Burgués', 'Clérigo', 'Noble', 'Marginado', 'Intelectual'];
  return ['Trabajador', 'Clase media', 'Profesional', 'Empresario', 'Artista', 'Intelectual', 'Marginado', 'Élite'];
}

function getEraSkills(year: number): string[] {
  const universal = ['Agricultura', 'Herrería', 'Carpintería', 'Costura', 'Caza', 'Pesca', 'Comercio', 'Curandería', 'Cocina', 'Combate cuerpo a cuerpo', 'Arco', 'Música', 'Oratoria', 'Diplomacia', 'Liderazgo', 'Rastreo', 'Escalada', 'Natación', 'Primeros auxilios', 'Albañilería', 'Minería', 'Jardinería'];
  if (year < 0) return [...universal, 'Filosofía', 'Astronomía', 'Retórica', 'Escultura', 'Equitación'];
  if (year < 1500) return [...universal, 'Equitación', 'Lectura', 'Escritura', 'Alquimia', 'Espionaje', 'Navegación', 'Táctica militar', 'Pintura'];
  if (year < 1800) return [...universal, 'Lectura', 'Escritura', 'Aritmética', 'Equitación', 'Navegación estelar', 'Medicina', 'Pintura', 'Escultura', 'Espionaje'];
  if (year < 1920) return [...universal, 'Lectura', 'Escritura', 'Aritmética', 'Mecánica', 'Fotografía', 'Telegrafía', 'Operación de maquinaria', 'Medicina', 'Abogacía'];
  return [...universal, 'Conducción', 'Programación', 'Medicina moderna', 'Derecho', 'Psicología', 'Tecnología', 'Idiomas', 'Fotografía', 'Periodismo'];
}

function getEraRules(year: number): { id: string; label: string }[] {
  const base = [
    { id: 'naturalDisasters', label: 'Desastres naturales' },
    { id: 'war', label: 'Guerra' },
    { id: 'disease', label: 'Enfermedad' },
  ];
  if (year < 500) return [...base, { id: 'slavery', label: 'Esclavitud' }, { id: 'gladiators', label: 'Gladiadores' }];
  if (year < 1300) return [...base, { id: 'serfdom', label: 'Servidumbre' }, { id: 'crusades', label: 'Cruzadas' }];
  if (year < 1800) return [...base, { id: 'inquisition', label: 'Inquisición' }, { id: 'piracy', label: 'Piratería' }];
  if (year < 1920) return [...base, { id: 'childLabor', label: 'Trabajo infantil' }, { id: 'revolution', label: 'Revoluciones' }];
  return [...base, { id: 'advancedWeapons', label: 'Armas de fuego avanzadas' }, { id: 'globalConflict', label: 'Conflictos globales' }];
}

const POSITIVE_TRAITS = ['Valiente', 'Curioso', 'Compasivo', 'Leal', 'Alegre', 'Honesto', 'Creativo', 'Paciente', 'Generoso', 'Empático', 'Resiliente', 'Carismático', 'Íntegro', 'Prudente', 'Optimista', 'Disciplinado', 'Humilde', 'Protector', 'Ingenioso', 'Sereno'];
const NEGATIVE_TRAITS = ['Impulsivo', 'Desconfiado', 'Melancólico', 'Obstinado', 'Ambicioso', 'Cobarde', 'Envidioso', 'Manipulador', 'Irascible', 'Arrogante', 'Perezoso', 'Rencoroso', 'Mentiroso', 'Celoso', 'Vengativo', 'Ansioso', 'Indeciso', 'Egocéntrico', 'Avaricioso', 'Cruel'];
const VALUES = ['Familia', 'Libertad', 'Honor', 'Fe', 'Conocimiento', 'Poder', 'Justicia', 'Supervivencia', 'Tradición', 'Amor', 'Riqueza', 'Lealtad', 'Fama', 'Paz', 'Naturaleza', 'Arte', 'Comunidad', 'Independencia', 'Verdad', 'Orden'];
const FEARS = ['Muerte', 'Abandono', 'Fracaso', 'Oscuridad', 'Enfermedad', 'Pobreza', 'Soledad', 'El más allá', 'Traición', 'Pérdida de un ser querido', 'Deshonra', 'Locura', 'Dolor', 'Pérdida de control', 'Ser olvidado', 'Las alturas', 'El mar', 'Los animales', 'El fuego', 'La guerra', 'Ser encarcelado', 'Perder la fe', 'El hambre', 'La vejez'];
const LIMITATIONS = ['Cojera', 'Miopía', 'Sordera parcial', 'Tartamudeo', 'Fobia social', 'Analfabetismo', 'Deuda impagable', 'Enemistad notable', 'Enfermedad crónica', 'Adicción', 'Memoria frágil', 'Físico débil', 'Miedo paralizante', 'Reputación dañada', 'Secreto peligroso', 'Trauma de guerra', 'Discapacidad visual', 'Alergia grave', 'Dependencia emocional'];
const PHILOSOPHIES = [
  { name: 'Estoicismo', desc: 'La virtud es el único bien. Acepta lo que no puedes controlar.' },
  { name: 'Epicureísmo', desc: 'El placer simple y la ausencia de dolor son el mayor bien.' },
  { name: 'Fatalismo', desc: 'Todo está predeterminado. El libre albedrío es ilusión.' },
  { name: 'Pragmatismo', desc: 'Solo importa lo que funciona. La verdad se mide en resultados.' },
  { name: 'Idealismo', desc: 'Las ideas y los principios son más reales que la materia.' },
  { name: 'Nihilismo', desc: 'Nada tiene significado inherente. Todo es vacío.' },
  { name: 'Humanismo', desc: 'El ser humano es la medida de todas las cosas.' },
  { name: 'Existencialismo', desc: 'La existencia precede a la esencia. Tú creas tu propio significado.' },
  { name: 'Utilitarismo', desc: 'Lo correcto es lo que produce mayor felicidad para el mayor número.' },
  { name: 'Hedonismo', desc: 'El placer es el único bien verdadero.' },
  { name: 'Cinismo', desc: 'La virtud es la única riqueza. Todo lo demás es vanidad.' },
  { name: 'Budismo filosófico', desc: 'El sufrimiento nace del apego. El desapego es liberación.' },
  { name: 'Confucianismo', desc: 'La armonía social y la jerarquía son la base del orden.' },
  { name: 'Taoísmo', desc: 'Fluye con la naturaleza. No fuerces nada.' },
  { name: 'Escepticismo', desc: 'Nada puede conocerse con certeza.' },
  { name: 'Empirismo', desc: 'Solo el conocimiento derivado de la experiencia es válido.' },
  { name: 'Racionalismo', desc: 'La razón es la fuente primaria del conocimiento.' },
  { name: 'Romanticismo', desc: 'La emoción y la intuición superan a la razón fría.' },
  { name: 'Positivismo', desc: 'Solo lo que puede observarse y medirse es verdadero.' },
  { name: 'Anarquismo filosófico', desc: 'Toda autoridad es ilegítima. La libertad absoluta es el ideal.' },
];
const POLITICAL_VIEWS = ['Monárquico', 'Republicano', 'Anarquista', 'Conservador', 'Liberal', 'Revolucionario', 'Apático', 'Teocrático', 'Imperialista', 'Pacifista', 'Nacionalista', 'Socialista', 'Feudalista'];
const RELATIONSHIP_TYPES = ['Madre', 'Padre', 'Hermano/a', 'Hijo/a', 'Abuelo/a', 'Tío/a', 'Primo/a', 'Amigo íntimo', 'Amigo de infancia', 'Rival', 'Mentor', 'Aprendiz', 'Amor', 'Amor no correspondido', 'Enemigo', 'Aliado', 'Capellán', 'Empleador', 'Empleado', 'Vecino', 'Protector', 'Deudor'];
const DISTINCTIVE_FEATURES = ['Cicatriz', 'Lunar', 'Tatuaje', 'Pecas', 'Cojera', 'Ojos llamativos', 'Voz ronca', 'Manos grandes', 'Calvicie', 'Nariz prominente', 'Mandíbula marcada', 'Piel curtida', 'Manos callosas', 'Dientes rotos', 'Labio partido', 'Quemaduras', 'Marcas de viruela', 'Joroba', 'Mirada penetrante'];

function generateRunId(): string {
  return 'run-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}

interface FormData {
  playMode: 'HUMANO' | 'DIOS';
  worldType: 'random' | 'saved';
  selectedWorldId: string;
  year: number;
  birthDay: number;
  birthMonth: number;
  worldRules: Record<string, boolean>;
  realismoLevel: number;
  worldNotes: string;
  worldContext: string;
  name: string;
  gender: 'Hombre' | 'Mujer';
  socialClass: string;
  wealthLevel: number;
  height: string;
  build: string;
  skin: string;
  hair: string;
  eyes: string;
  features: string[];
  freeDescription: string;
  positiveTraits: string[];
  negativeTraits: string[];
  values: string[];
  fears: string[];
  motivation: string;
  quirks: string;
  skills: string[];
  limitations: string[];
  originStory: string;
  relationships: Array<{ name: string; type: string; description: string }>;
  religion: string;
  philosophy: string;
  politicalView: string;
  presentationNarrative: string;
}

function defaultForm(): FormData {
  return {
    playMode: 'HUMANO', worldType: 'random', selectedWorldId: '', year: 1450,
    birthDay: 1, birthMonth: 1, worldRules: {}, realismoLevel: 5, worldNotes: '',
    worldContext: '', name: '', gender: 'Hombre', socialClass: '', wealthLevel: 2,
    height: '', build: '', skin: '', hair: '', eyes: '', features: [], freeDescription: '',
    positiveTraits: [], negativeTraits: [], values: [], fears: [], motivation: '',
    quirks: '', skills: [], limitations: [], originStory: '', relationships: [],
    religion: '', philosophy: '', politicalView: '', presentationNarrative: '',
  };
}

export default function NewRun() {
  const [, setLocation] = useLocation();
  const { setActiveRun, savedWorlds, settings } = useEngineStore();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(defaultForm());
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nameSuggestions, setNameSuggestions] = useState<string[]>([]);
  const [showConfirmExit, setShowConfirmExit] = useState(false);
  const [philosophyTooltip, setPhilosophyTooltip] = useState<string | null>(null);

  const f = form;
  const update = (partial: Partial<FormData>) => setForm((prev) => ({ ...prev, ...partial }));

  const eraLabel = getEraLabel(f.year);
  const socialClasses = getSocialClasses(f.year);
  const eraSkills = getEraSkills(f.year);
  const eraRules = getEraRules(f.year);
  const totalSteps = STEPS_HUMANO.length;

  const aiContext = useCallback(() => ({
    year: f.year,
    eraLabel,
    gender: f.gender,
    socialClass: f.socialClass,
    name: f.name,
    positiveTraits: f.positiveTraits,
    negativeTraits: f.negativeTraits,
    skills: f.skills,
    values: f.values,
  }), [f, eraLabel]);

  const callAI = async (type: string, extra: Record<string, any> = {}, cb: (result: any) => void) => {
    setLoading(type);
    setError(null);
    try {
      const result = await aiAssist(type, { ...aiContext(), ...extra }, settings.aiProvider);
      cb(result);
    } catch (e: any) {
      setError(e.message || 'Error al contactar AI');
    } finally {
      setLoading(null);
    }
  };

  const canGoNext = (): boolean => {
    if (step === 0) return true;
    if (step === 3) return !!f.gender && !!f.socialClass;
    if (step === 5) return f.positiveTraits.length >= 1 && f.negativeTraits.length >= 1 && f.values.length >= 1 && f.fears.length >= 1;
    if (step === 6) return f.skills.length >= 1 && f.limitations.length >= 1;
    return true;
  };

  const handleStart = () => {
    const runId = generateRunId();
    const character = {
      name: f.name || 'Desconocido',
      gender: f.gender,
      socialClass: f.socialClass,
      birthYear: f.year,
      birthDay: f.birthDay,
      birthMonth: f.birthMonth,
      age: 0,
      wealthLevel: f.wealthLevel,
      appearance: { height: f.height, build: f.build, skin: f.skin, hair: f.hair, eyes: f.eyes, features: f.features, freeDescription: f.freeDescription },
      personality: { positive: f.positiveTraits, negative: f.negativeTraits, values: f.values, fears: f.fears, motivation: f.motivation, quirks: f.quirks },
      skills: f.skills,
      limitations: f.limitations,
      originStory: f.originStory,
      initialRelationships: f.relationships,
      beliefs: { religion: f.religion, philosophy: f.philosophy, politicalView: f.politicalView },
      stats: { health: 100, energy: 100, hunger: 50, morale: 70, mentalHealth: 80 },
    };
    const eraConfig = {
      year: f.year, eraLabel, worldType: f.worldType, selectedWorldId: f.selectedWorldId,
      rules: f.worldRules, realismoLevel: f.realismoLevel, worldNotes: f.worldNotes,
    };
    const run: ActiveRun = {
      runId,
      gameId: 'una-vida',
      aiProvider: settings.aiProvider,
      playMode: f.playMode,
      character,
      eraConfig,
      worldState: {
        currentLocation: { name: 'Lugar de nacimiento', description: '' },
        season: 'Primavera', weather: 'Despejado', timeOfDay: 'Mañana',
        ingameYear: f.year, ingameDate: `Día ${f.birthDay}, Mes ${f.birthMonth}`, ingameAge: 0,
      },
      descriptors: {
        estadoFisico: 'Saludable', condicionMental: 'Lúcido', combate: 'Sin entrenamiento',
        habilidadesSociales: 'Reservado', conocimiento: 'Letrado', condicionSocial: f.socialClass,
        reputacionLocal: 'Desconocido', renombreGlobal: 'Anónimo', relacionesActivas: [],
      },
      realisticAttributes: deriveInitialAttributes(f.socialClass),
      narrativeHistory: [],
      innerVoiceLog: [],
      emotionalClimate: 'sereno',
      suggestedActions: [],
      secretsQueue: [],
      consequenceQueue: [],
      turnCount: 0,
      totalMinutesElapsed: 0,
      npcs: [],
      inventory: [],
      currency: { amount: 0, name: 'Monedas', context: '' },
      personalHistory: [],
      moments: [],
      facciones: [],
      memoriaNarrador: { notasLibres: '', reglasDeLaPartida: '', hechosCanonicos: [] },
      exploredLocations: [],
    };
    setActiveRun(run);
    setLocation(`/game/${runId}`);
  };

  return (
    <div className="min-h-screen bg-[#0a0c0f] text-[#eef2f8] flex flex-col">
      <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-12 flex flex-col">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => { if (step === 0) setLocation('/'); else setShowConfirmExit(true); }}
              className="flex items-center gap-2 text-[#5a6478] hover:text-[#eef2f8] font-mono text-sm transition-colors"
            >
              <ArrowLeft size={16} /> {step === 0 ? 'Inicio' : 'Salir'}
            </button>
            {step > 0 && (
              <div className="flex items-center gap-1.5">
                {STEPS_HUMANO.slice(1).map((_, i) => (
                  <div
                    key={i}
                    className="h-1.5 rounded-full transition-all"
                    style={{
                      width: i + 1 === step ? '24px' : '8px',
                      background: i + 1 < step ? '#3d8eff' : i + 1 === step ? '#00d4a8' : '#1e2530',
                    }}
                  />
                ))}
              </div>
            )}
            <div className="font-mono text-xs text-[#5a6478]">
              {step > 0 ? `${step}/${totalSteps - 1}` : ''}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg border border-[#ff4444]/30 bg-[#ff4444]/10 font-mono text-xs text-[#ff4444] flex justify-between">
            {error}
            <button onClick={() => setError(null)}><X size={12} /></button>
          </div>
        )}

        <div className="flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              {step === 0 && <StepMode form={f} update={update} />}
              {step === 1 && <StepIntro year={f.year} />}
              {step === 2 && <StepWorld form={f} update={update} eraLabel={eraLabel} eraRules={eraRules} savedWorlds={savedWorlds} loading={loading} callAI={callAI} />}
              {step === 3 && <StepIdentity form={f} update={update} socialClasses={socialClasses} eraLabel={eraLabel} loading={loading} nameSuggestions={nameSuggestions} setNameSuggestions={setNameSuggestions} callAI={callAI} />}
              {step === 4 && <StepAppearance form={f} update={update} eraLabel={eraLabel} loading={loading} callAI={callAI} />}
              {step === 5 && <StepPersonality form={f} update={update} loading={loading} callAI={callAI} />}
              {step === 6 && <StepSkills form={f} update={update} eraSkills={eraSkills} loading={loading} callAI={callAI} />}
              {step === 7 && <StepBeliefs form={f} update={update} loading={loading} callAI={callAI} philosophyTooltip={philosophyTooltip} setPhilosophyTooltip={setPhilosophyTooltip} />}
              {step === 8 && <StepReview form={f} eraLabel={eraLabel} loading={loading} callAI={callAI} onJumpTo={setStep} />}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-8 pt-6 border-t border-[#1e2530] flex justify-between items-center">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="flex items-center gap-2 px-5 py-3 rounded-xl font-mono text-sm border border-[#1e2530] text-[#5a6478] hover:text-[#eef2f8] hover:border-[#eef2f8]/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ArrowLeft size={14} /> Atrás
          </button>
          {step < totalSteps - 1 ? (
            <button
              onClick={() => { if (canGoNext()) setStep((s) => s + 1); }}
              disabled={!canGoNext()}
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-mono text-sm font-bold border transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ borderColor: '#3d8eff50', color: '#3d8eff', background: canGoNext() ? '#3d8eff10' : 'transparent' }}
            >
              Siguiente <ChevronRight size={14} />
            </button>
          ) : (
            <button
              onClick={handleStart}
              className="flex items-center gap-2 px-8 py-3 rounded-xl font-mono text-sm font-bold border border-[#00d4a8]/40 text-[#00d4a8] bg-[#00d4a8]/10 hover:bg-[#00d4a8]/20 transition-all active:scale-95"
            >
              COMIENZA LA EXISTENCIA
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showConfirmExit && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setShowConfirmExit(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-[#0f1218] border border-[#1e2530] rounded-2xl p-8 max-w-sm w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-display font-bold text-xl mb-3">¿Pausar y salir?</h3>
              <p className="font-serif italic text-[#5a6478] mb-6">Tu progreso en la creación se perderá.</p>
              <div className="flex gap-3">
                <button onClick={() => setLocation('/')} className="flex-1 py-3 rounded-xl font-mono text-sm border border-[#ff4444]/30 text-[#ff4444] hover:bg-[#ff4444]/10 transition-all">
                  Salir
                </button>
                <button onClick={() => setShowConfirmExit(false)} className="flex-1 py-3 rounded-xl font-mono text-sm border border-[#1e2530] text-[#5a6478] hover:text-[#eef2f8] transition-all">
                  Continuar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display font-bold text-2xl text-[#eef2f8] mb-2">{children}</h2>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block font-mono text-xs text-[#5a6478] tracking-widest mb-2">{children}</label>;
}

function ChipGroup({ options, selected, onToggle, max, accent = '#3d8eff', customInput }: {
  options: string[]; selected: string[]; onToggle: (v: string) => void;
  max?: number; accent?: string; customInput?: boolean;
}) {
  const [custom, setCustom] = useState('');
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const isActive = selected.includes(o);
          const disabled = !isActive && max !== undefined && selected.length >= max;
          return (
            <button
              key={o}
              onClick={() => !disabled && onToggle(o)}
              className="px-3 py-1.5 rounded-full text-xs font-mono transition-all active:scale-95"
              style={{
                background: isActive ? accent + '20' : '#14182050',
                color: isActive ? accent : disabled ? '#2a3040' : '#5a6478',
                border: `1px solid ${isActive ? accent + '50' : '#1e2530'}`,
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              {o}
              {isActive && <X size={10} className="inline ml-1" />}
            </button>
          );
        })}
      </div>
      {customInput && (
        <div className="flex gap-2 mt-2">
          <input
            className="flex-1 bg-[#141820] border border-[#1e2530] rounded-lg px-3 py-2 font-mono text-xs text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && custom.trim() && (!max || selected.length < max)) { onToggle(custom.trim()); setCustom(''); } }}
            placeholder="Añadir personalizado..."
          />
          <button
            onClick={() => { if (custom.trim() && (!max || selected.length < max)) { onToggle(custom.trim()); setCustom(''); } }}
            className="px-3 py-2 rounded-lg border border-[#1e2530] text-[#5a6478] hover:text-[#eef2f8] font-mono text-xs transition-all"
          >
            <Plus size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

function AIBtn({ loading, id, currentLoading, onClick, label, small }: {
  loading: string | null; id: string; currentLoading: string | null; onClick: () => void; label: string; small?: boolean;
}) {
  const isLoading = currentLoading === id;
  return (
    <button
      onClick={onClick}
      disabled={!!loading}
      className={`flex items-center gap-1.5 rounded-lg font-mono border transition-all active:scale-95 disabled:opacity-50 ${small ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'}`}
      style={{ borderColor: '#f5a62330', color: '#f5a623', background: isLoading ? '#f5a62310' : 'transparent' }}
    >
      {isLoading ? <span className="animate-spin">⟳</span> : <Sparkles size={small ? 10 : 12} />}
      {isLoading ? 'Generando...' : label}
    </button>
  );
}

function StepMode({ form, update }: { form: FormData; update: (p: Partial<FormData>) => void }) {
  return (
    <div className="space-y-6">
      <SectionTitle>¿Cómo quieres jugar?</SectionTitle>
      <p className="font-serif italic text-[#5a6478]">Elige tu modo de existencia.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { id: 'HUMANO', title: 'MODO HUMANO', desc: 'Eres un personaje viviendo en el mundo. Tu perspectiva es la de un ser humano con limitaciones reales.' },
          { id: 'DIOS', title: 'MODO DIOS', desc: 'Eres una entidad omnisciente. Observas, intervenes, y controlas el mundo desde fuera.', note: '(próximamente completo)' },
        ].map((m) => (
          <button
            key={m.id}
            onClick={() => update({ playMode: m.id as 'HUMANO' | 'DIOS' })}
            className="text-left p-6 rounded-2xl border transition-all"
            style={{
              borderColor: form.playMode === m.id ? '#3d8eff' : '#1e2530',
              background: form.playMode === m.id ? '#3d8eff10' : '#0f1218',
            }}
          >
            <h3 className="font-display font-bold text-xl mb-3" style={{ color: form.playMode === m.id ? '#3d8eff' : '#eef2f8' }}>{m.title}</h3>
            <p className="font-serif italic text-sm text-[#c8d0dc] leading-relaxed">{m.desc}</p>
            {m.note && <p className="font-mono text-xs text-[#5a6478] mt-2">{m.note}</p>}
          </button>
        ))}
      </div>
    </div>
  );
}

function StepIntro({ year }: { year: number }) {
  return (
    <div className="space-y-8">
      <div>
        <div className="font-mono text-xs text-[#3d8eff] tracking-widest mb-2">UNA VIDA</div>
        <SectionTitle>La Simulación de la Existencia</SectionTitle>
      </div>
      <div className="p-8 rounded-2xl border border-[#1e2530] bg-[#0f1218]">
        <p className="font-serif italic text-lg text-[#c8d0dc] leading-relaxed">
          "No hay objetivos. No hay victoria. No hay derrota. Solo una vida vivida turno a turno, en toda su complejidad."
        </p>
      </div>
      <div className="space-y-4 font-serif text-[#c8d0dc] leading-relaxed">
        <p>En UNA VIDA, el motor crea una existencia completa para ti — desde el nacimiento hasta la muerte — narrada por una IA que recuerda cada momento, cada decisión, cada consecuencia.</p>
        <p>El mundo existe independientemente de ti. Los NPCs tienen sus propias vidas. Las guerras estallan. Las cosechas fallan. La historia avanza sin pedirte permiso.</p>
        <p>Elige una época. Define quién eres. Después... simplemente existe.</p>
      </div>
    </div>
  );
}

function StepWorld({ form, update, eraLabel, eraRules, savedWorlds, loading, callAI }: {
  form: FormData; update: (p: Partial<FormData>) => void; eraLabel: string;
  eraRules: { id: string; label: string }[]; savedWorlds: WorldBuilderConfig[];
  loading: string | null; callAI: (type: string, extra: any, cb: (r: any) => void) => void;
}) {
  return (
    <div className="space-y-8">
      <SectionTitle>Era y Mundo</SectionTitle>

      <div>
        <Label>Tipo de mundo</Label>
        <div className="flex gap-3">
          <button onClick={() => update({ worldType: 'random' })} className="flex-1 py-3 rounded-xl font-mono text-sm border transition-all" style={{ borderColor: form.worldType === 'random' ? '#3d8eff' : '#1e2530', color: form.worldType === 'random' ? '#3d8eff' : '#5a6478', background: form.worldType === 'random' ? '#3d8eff10' : '#0f1218' }}>
            Mundo aleatorio
          </button>
          <button onClick={() => update({ worldType: 'saved' })} className="flex-1 py-3 rounded-xl font-mono text-sm border transition-all" style={{ borderColor: form.worldType === 'saved' ? '#3d8eff' : '#1e2530', color: form.worldType === 'saved' ? '#3d8eff' : '#5a6478', background: form.worldType === 'saved' ? '#3d8eff10' : '#0f1218' }}>
            Mundo guardado
          </button>
        </div>
        {form.worldType === 'saved' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 space-y-2">
            {savedWorlds.length === 0 ? (
              <p className="font-serif italic text-[#5a6478] text-sm">Sin mundos guardados. Crea uno en el Constructor de Mundos.</p>
            ) : (
              savedWorlds.map((w) => (
                <button key={w.id} onClick={() => update({ selectedWorldId: w.id })} className="w-full text-left p-4 rounded-lg border transition-all" style={{ borderColor: form.selectedWorldId === w.id ? '#3d8eff' : '#1e2530', background: form.selectedWorldId === w.id ? '#3d8eff10' : '#0f1218' }}>
                  <div className="font-mono text-sm text-[#eef2f8]">{w.name}</div>
                  <div className="font-serif text-xs text-[#5a6478] mt-1">{w.techLevel} · Peligro {w.dangerLevel}/10</div>
                </button>
              ))
            )}
          </motion.div>
        )}
      </div>

      <div>
        <Label>Año de nacimiento</Label>
        <div className="flex items-center gap-4">
          <button onClick={() => update({ year: form.year - 10 })} className="w-10 h-10 rounded-lg border border-[#1e2530] font-mono text-lg text-[#5a6478] hover:text-[#eef2f8] hover:border-[#3d8eff]/30 transition-all">−</button>
          <div className="flex-1 text-center">
            <div className="font-display font-bold text-4xl text-[#eef2f8]">{form.year}</div>
            <div className="font-mono text-xs text-[#3d8eff] mt-1">{eraLabel}</div>
          </div>
          <button onClick={() => update({ year: form.year + 10 })} className="w-10 h-10 rounded-lg border border-[#1e2530] font-mono text-lg text-[#5a6478] hover:text-[#eef2f8] hover:border-[#3d8eff]/30 transition-all">+</button>
        </div>
        <input type="range" min={-3000} max={2100} value={form.year} onChange={(e) => update({ year: parseInt(e.target.value) })} className="w-full mt-3 accent-[#3d8eff]" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Día de nacimiento</Label>
          <select value={form.birthDay} onChange={(e) => update({ birthDay: parseInt(e.target.value) })} className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-3 py-3 font-mono text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]">
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <Label>Mes de nacimiento</Label>
          <select value={form.birthMonth} onChange={(e) => update({ birthMonth: parseInt(e.target.value) })} className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-3 py-3 font-mono text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]">
            {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
      </div>

      <div>
        <Label>Reglas del mundo</Label>
        <div className="flex flex-wrap gap-2">
          {eraRules.map((r) => (
            <button
              key={r.id}
              onClick={() => update({ worldRules: { ...form.worldRules, [r.id]: !form.worldRules[r.id] } })}
              className="px-3 py-1.5 rounded-full text-xs font-mono transition-all"
              style={{
                background: form.worldRules[r.id] ? '#f5a62320' : '#14182050',
                color: form.worldRules[r.id] ? '#f5a623' : '#5a6478',
                border: `1px solid ${form.worldRules[r.id] ? '#f5a62350' : '#1e2530'}`,
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>MODO REALISMO</Label>
        <div className="flex items-center gap-4">
          <span className="font-mono text-xs text-[#00d4a8]">PACÍFICO</span>
          <input type="range" min={1} max={10} value={form.realismoLevel} onChange={(e) => update({ realismoLevel: parseInt(e.target.value) })} className="flex-1 accent-[#ff4444]" />
          <span className="font-mono text-xs text-[#ff4444]">BRUTAL</span>
          <span className="font-mono text-sm font-bold w-6" style={{ color: form.realismoLevel > 7 ? '#ff4444' : form.realismoLevel > 4 ? '#f5a623' : '#00d4a8' }}>{form.realismoLevel}</span>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <Label>Notas adicionales del mundo</Label>
          <AIBtn loading={loading} id="world_context" currentLoading={loading} onClick={() => callAI('generate_world_context', { worldRules: form.worldRules }, (r) => update({ worldContext: r.context || '' }))} label="✦ Generar contexto" small />
        </div>
        <textarea rows={3} className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-serif text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff] resize-none" value={form.worldNotes} onChange={(e) => update({ worldNotes: e.target.value })} placeholder="Notas libres sobre el mundo..." />
        {form.worldContext && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 p-4 rounded-lg bg-[#0f1218] border border-[#3d8eff]/20">
            <p className="font-serif italic text-sm text-[#c8d0dc] leading-relaxed">{form.worldContext}</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function StepIdentity({ form, update, socialClasses, eraLabel, loading, nameSuggestions, setNameSuggestions, callAI }: {
  form: FormData; update: (p: Partial<FormData>) => void; socialClasses: string[];
  eraLabel: string; loading: string | null;
  nameSuggestions: string[]; setNameSuggestions: (s: string[]) => void;
  callAI: (type: string, extra: any, cb: (r: any) => void) => void;
}) {
  const wealthLabels = ['Miseria', 'Pobreza', 'Clase Media', 'Riqueza', 'Opulencia'];
  return (
    <div className="space-y-8">
      <SectionTitle>Identidad</SectionTitle>

      <div>
        <div className="flex justify-between items-center mb-2">
          <Label>Nombre</Label>
          <AIBtn loading={loading} id="suggest_names" currentLoading={loading} onClick={() => callAI('suggest_names', {}, (r) => setNameSuggestions(r.names || []))} label="✦ Sugerir nombre" small />
        </div>
        <input className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-serif text-lg text-[#eef2f8] focus:outline-none focus:border-[#3d8eff] transition-colors" value={form.name} onChange={(e) => update({ name: e.target.value })} placeholder="Déjalo vacío para generación automática" />
        {nameSuggestions.length > 0 && (
          <div className="flex gap-2 mt-2 flex-wrap">
            {nameSuggestions.map((n) => (
              <button key={n} onClick={() => { update({ name: n }); setNameSuggestions([]); }}
                className="px-4 py-2 rounded-lg font-serif text-sm border border-[#3d8eff]/30 text-[#3d8eff] bg-[#3d8eff]/10 hover:bg-[#3d8eff]/20 transition-all">
                {n}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <Label>Género</Label>
        <div className="grid grid-cols-2 gap-3">
          {(['Hombre', 'Mujer'] as const).map((g) => (
            <button key={g} onClick={() => update({ gender: g })} className="py-4 rounded-xl font-mono text-sm font-bold border transition-all active:scale-95"
              style={{ borderColor: form.gender === g ? '#3d8eff' : '#1e2530', color: form.gender === g ? '#3d8eff' : '#5a6478', background: form.gender === g ? '#3d8eff10' : '#0f1218' }}>
              {g}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>Clase social ({eraLabel})</Label>
        <div className="flex flex-wrap gap-2">
          {socialClasses.map((c) => (
            <button key={c} onClick={() => update({ socialClass: c })} className="px-4 py-2 rounded-lg font-mono text-sm border transition-all active:scale-95"
              style={{ borderColor: form.socialClass === c ? '#3d8eff' : '#1e2530', color: form.socialClass === c ? '#3d8eff' : '#5a6478', background: form.socialClass === c ? '#3d8eff10' : '#0f1218' }}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>Riqueza inicial — {wealthLabels[form.wealthLevel - 1]}</Label>
        <input type="range" min={1} max={5} value={form.wealthLevel} onChange={(e) => update({ wealthLevel: parseInt(e.target.value) })} className="w-full accent-[#f5a623]" />
        <div className="flex justify-between font-mono text-[10px] text-[#5a6478] mt-1">
          {wealthLabels.map((l) => <span key={l}>{l}</span>)}
        </div>
      </div>
    </div>
  );
}

function StepAppearance({ form, update, eraLabel, loading, callAI }: {
  form: FormData; update: (p: Partial<FormData>) => void; eraLabel: string; loading: string | null;
  callAI: (type: string, extra: any, cb: (r: any) => void) => void;
}) {
  const toggleFeature = (f: string) => update({ features: form.features.includes(f) ? form.features.filter((x) => x !== f) : [...form.features, f] });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <SectionTitle>Apariencia</SectionTitle>
        <AIBtn loading={loading} id="generate_appearance" currentLoading={loading} onClick={() => callAI('generate_appearance', {}, (r) => {
          update({ height: r.height || form.height, build: r.build || form.build, skin: r.skin || form.skin, hair: r.hair || form.hair, eyes: r.eyes || form.eyes, features: r.features || form.features, freeDescription: r.description || form.freeDescription });
        })} label="✦ Generar completa" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Altura</Label>
          <select value={form.height} onChange={(e) => update({ height: e.target.value })} className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-3 py-3 font-mono text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]">
            <option value="">Seleccionar...</option>
            {['Muy bajo', 'Bajo', 'Promedio', 'Alto', 'Muy alto'].map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
        <div>
          <Label>Complexión</Label>
          <select value={form.build} onChange={(e) => update({ build: e.target.value })} className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-3 py-3 font-mono text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]">
            <option value="">Seleccionar...</option>
            {['Delgado', 'Esbelto', 'Atlético', 'Promedio', 'Robusto', 'Corpulento', 'Obeso'].map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <Label>Tez</Label>
          <select value={form.skin} onChange={(e) => update({ skin: e.target.value })} className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-3 py-3 font-mono text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]">
            <option value="">Seleccionar...</option>
            {['Clara', 'Rosada', 'Olivácea', 'Morena clara', 'Morena', 'Morena oscura', 'Negra', 'Cobriza', 'Amarilla'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <Label>Ojos</Label>
          <select value={form.eyes} onChange={(e) => update({ eyes: e.target.value })} className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-3 py-3 font-mono text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]">
            <option value="">Seleccionar...</option>
            {['Negros', 'Marrones', 'Avellana', 'Verdes', 'Azules', 'Grises', 'Violáceos', 'Heterocromía'].map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <Label>Cabello</Label>
          <AIBtn loading={loading} id="suggest_hair" currentLoading={loading} onClick={() => callAI('suggest_hair', {}, (r) => update({ hair: r.hair || form.hair }))} label="✦ Sugerir" small />
        </div>
        <input className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-mono text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]" value={form.hair} onChange={(e) => update({ hair: e.target.value })} placeholder="Color, longitud, estilo..." />
      </div>

      <div>
        <Label>Rasgos distintivos (sin límite)</Label>
        <ChipGroup options={DISTINCTIVE_FEATURES} selected={form.features} onToggle={toggleFeature} accent="#00d4a8" customInput />
      </div>

      <div>
        <Label>Descripción libre (opcional)</Label>
        <textarea rows={3} className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-serif text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff] resize-none" value={form.freeDescription} onChange={(e) => update({ freeDescription: e.target.value })} placeholder="Cualquier detalle adicional de apariencia..." />
      </div>
    </div>
  );
}

function StepPersonality({ form, update, loading, callAI }: {
  form: FormData; update: (p: Partial<FormData>) => void; loading: string | null;
  callAI: (type: string, extra: any, cb: (r: any) => void) => void;
}) {
  const toggleTrait = (key: 'positiveTraits' | 'negativeTraits' | 'values' | 'fears', val: string, max: number) => {
    const arr = form[key] as string[];
    update({ [key]: arr.includes(val) ? arr.filter((x) => x !== val) : arr.length < max ? [...arr, val] : arr });
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <SectionTitle>Personalidad</SectionTitle>
        <AIBtn loading={loading} id="generate_personality" currentLoading={loading} onClick={() => callAI('generate_personality', {}, (r) => {
          if (r.positive) update({ positiveTraits: r.positive.slice(0, 5) });
          if (r.negative) update({ negativeTraits: r.negative.slice(0, 5) });
          if (r.values) update({ values: r.values.slice(0, 3) });
          if (r.fears) update({ fears: r.fears.slice(0, 5) });
          if (r.motivation) update({ motivation: r.motivation });
          if (r.quirks) update({ quirks: r.quirks });
        })} label="✦ Generar personalidad" />
      </div>

      <div>
        <Label>Rasgos positivos (mín. 1, máx. 5) — {form.positiveTraits.length}/5</Label>
        <ChipGroup options={POSITIVE_TRAITS} selected={form.positiveTraits} onToggle={(v) => toggleTrait('positiveTraits', v, 5)} max={5} accent="#00d4a8" customInput />
      </div>

      <div>
        <Label>Rasgos negativos (mín. 1, máx. 5) — {form.negativeTraits.length}/5</Label>
        <ChipGroup options={NEGATIVE_TRAITS} selected={form.negativeTraits} onToggle={(v) => toggleTrait('negativeTraits', v, 5)} max={5} accent="#ff4444" customInput />
      </div>

      <div>
        <Label>Valores (mín. 1, máx. 3) — {form.values.length}/3</Label>
        <ChipGroup options={VALUES} selected={form.values} onToggle={(v) => toggleTrait('values', v, 3)} max={3} accent="#f5a623" customInput />
      </div>

      <div>
        <Label>Miedos (mín. 1, máx. 5) — {form.fears.length}/5</Label>
        <ChipGroup options={FEARS} selected={form.fears} onToggle={(v) => toggleTrait('fears', v, 5)} max={5} accent="#5a6478" customInput />
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <Label>Motivaciones</Label>
          <AIBtn loading={loading} id="suggest_motivation" currentLoading={loading} onClick={() => callAI('suggest_motivation', { traits: [...form.positiveTraits, ...form.negativeTraits] }, (r) => update({ motivation: r.motivation || form.motivation }))} label="✦ Sugerir" small />
        </div>
        <textarea rows={2} className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-serif text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff] resize-none" value={form.motivation} onChange={(e) => update({ motivation: e.target.value })} placeholder="¿Qué impulsa a este personaje?" />
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <Label>Peculiaridades</Label>
          <AIBtn loading={loading} id="suggest_quirks" currentLoading={loading} onClick={() => callAI('suggest_quirks', { traits: [...form.positiveTraits, ...form.negativeTraits] }, (r) => update({ quirks: r.quirks || form.quirks }))} label="✦ Sugerir" small />
        </div>
        <textarea rows={2} className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-serif text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff] resize-none" value={form.quirks} onChange={(e) => update({ quirks: e.target.value })} placeholder="Gestos, manías, hábitos..." />
      </div>
    </div>
  );
}

function StepSkills({ form, update, eraSkills, loading, callAI }: {
  form: FormData; update: (p: Partial<FormData>) => void; eraSkills: string[];
  loading: string | null; callAI: (type: string, extra: any, cb: (r: any) => void) => void;
}) {
  const toggleSkill = (s: string) => {
    const arr = form.skills;
    update({ skills: arr.includes(s) ? arr.filter((x) => x !== s) : arr.length < 7 ? [...arr, s] : arr });
  };
  const toggleLimit = (s: string) => {
    const arr = form.limitations;
    update({ limitations: arr.includes(s) ? arr.filter((x) => x !== s) : arr.length < 5 ? [...arr, s] : arr });
  };

  return (
    <div className="space-y-8">
      <SectionTitle>Habilidades e Historia</SectionTitle>

      <div>
        <Label>Habilidades (mín. 1, máx. 7) — {form.skills.length}/7</Label>
        <ChipGroup options={eraSkills} selected={form.skills} onToggle={toggleSkill} max={7} accent="#3d8eff" customInput />
      </div>

      <div>
        <Label>Limitaciones (mín. 1, máx. 5) — {form.limitations.length}/5</Label>
        <ChipGroup options={LIMITATIONS} selected={form.limitations} onToggle={toggleLimit} max={5} accent="#ff4444" customInput />
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <Label>Historia de origen</Label>
          <AIBtn loading={loading} id="generate_origin_story" currentLoading={loading} onClick={() => callAI('generate_origin_story', { skills: form.skills, traits: [...form.positiveTraits, ...form.negativeTraits] }, (r) => update({ originStory: r.story || form.originStory }))} label="✦ Generar historia de origen" small />
        </div>
        <textarea rows={5} className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-serif text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff] resize-none" value={form.originStory} onChange={(e) => update({ originStory: e.target.value })} placeholder="Los primeros años..." />
      </div>

      <div>
        <div className="flex justify-between items-center mb-3">
          <Label>Relaciones iniciales (hasta 5)</Label>
          {form.relationships.length < 5 && (
            <button onClick={() => update({ relationships: [...form.relationships, { name: '', type: 'Madre', description: '' }] })} className="flex items-center gap-1.5 font-mono text-xs text-[#3d8eff] hover:text-[#eef2f8] transition-colors">
              <Plus size={12} /> Agregar relación
            </button>
          )}
        </div>
        <div className="space-y-3">
          {form.relationships.map((rel, i) => (
            <div key={i} className="p-4 rounded-xl border border-[#1e2530] bg-[#0f1218] space-y-3">
              <div className="flex items-center gap-2 justify-between">
                <div className="flex gap-2 flex-1">
                  <input className="flex-1 bg-[#141820] border border-[#1e2530] rounded-lg px-3 py-2 font-serif text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]" value={rel.name} onChange={(e) => { const r = [...form.relationships]; r[i] = { ...r[i], name: e.target.value }; update({ relationships: r }); }} placeholder="Nombre" />
                  <select className="bg-[#141820] border border-[#1e2530] rounded-lg px-3 py-2 font-mono text-xs text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]" value={rel.type} onChange={(e) => { const r = [...form.relationships]; r[i] = { ...r[i], type: e.target.value }; update({ relationships: r }); }}>
                    {RELATIONSHIP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <button onClick={() => update({ relationships: form.relationships.filter((_, idx) => idx !== i) })} className="text-[#5a6478] hover:text-[#ff4444] transition-colors"><X size={14} /></button>
              </div>
              <input className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-3 py-2 font-serif text-xs text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]" value={rel.description} onChange={(e) => { const r = [...form.relationships]; r[i] = { ...r[i], description: e.target.value }; update({ relationships: r }); }} placeholder="Breve descripción de la relación..." />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepBeliefs({ form, update, loading, callAI, philosophyTooltip, setPhilosophyTooltip }: {
  form: FormData; update: (p: Partial<FormData>) => void; loading: string | null;
  callAI: (type: string, extra: any, cb: (r: any) => void) => void;
  philosophyTooltip: string | null; setPhilosophyTooltip: (s: string | null) => void;
}) {
  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <SectionTitle>Creencias</SectionTitle>
        <AIBtn loading={loading} id="suggest_beliefs" currentLoading={loading} onClick={() => callAI('suggest_beliefs', {}, (r) => {
          if (r.religion) update({ religion: r.religion });
          if (r.philosophy) update({ philosophy: r.philosophy });
          if (r.politics) update({ politicalView: r.politics });
        })} label="✦ Sugerir creencias de la época" small />
      </div>

      <div>
        <Label>Religión / Fe</Label>
        <input className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-mono text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]" value={form.religion} onChange={(e) => update({ religion: e.target.value })} placeholder="Catolicismo, Islam, Panteísmo, Ateísmo..." />
      </div>

      <div>
        <Label>Filosofía de vida</Label>
        <div className="flex flex-wrap gap-2">
          {PHILOSOPHIES.map((p) => (
            <div key={p.name} className="relative">
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => update({ philosophy: form.philosophy === p.name ? '' : p.name })}
                  className="px-3 py-1.5 rounded-l-full text-xs font-mono transition-all"
                  style={{
                    background: form.philosophy === p.name ? '#3d8eff20' : '#14182050',
                    color: form.philosophy === p.name ? '#3d8eff' : '#5a6478',
                    border: `1px solid ${form.philosophy === p.name ? '#3d8eff50' : '#1e2530'}`,
                    borderRight: 'none',
                  }}
                >
                  {p.name}
                </button>
                <button
                  onClick={() => setPhilosophyTooltip(philosophyTooltip === p.name ? null : p.name)}
                  className="px-2 py-1.5 rounded-r-full text-xs font-mono transition-all flex-shrink-0"
                  style={{
                    background: form.philosophy === p.name ? '#3d8eff20' : '#14182050',
                    color: form.philosophy === p.name ? '#3d8eff' : '#5a6478',
                    border: `1px solid ${form.philosophy === p.name ? '#3d8eff50' : '#1e2530'}`,
                    borderLeft: 'none',
                  }}
                >
                  <Info size={9} />
                </button>
              </div>
              <AnimatePresence>
                {philosophyTooltip === p.name && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="absolute z-20 top-full mt-1 left-0 w-56 p-3 rounded-lg bg-[#141820] border border-[#1e2530] shadow-xl"
                  >
                    <p className="font-serif text-xs italic text-[#c8d0dc]">{p.desc}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
        <input className="mt-3 w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-mono text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]" value={PHILOSOPHIES.some((p) => p.name === form.philosophy) ? '' : form.philosophy} onChange={(e) => update({ philosophy: e.target.value })} placeholder="O describe la tuya..." />
      </div>

      <div>
        <Label>Visión política</Label>
        <div className="flex flex-wrap gap-2 mb-3">
          {POLITICAL_VIEWS.map((p) => (
            <button key={p} onClick={() => update({ politicalView: form.politicalView === p ? '' : p })} className="px-3 py-1.5 rounded-full text-xs font-mono transition-all"
              style={{ background: form.politicalView === p ? '#f5a62320' : '#14182050', color: form.politicalView === p ? '#f5a623' : '#5a6478', border: `1px solid ${form.politicalView === p ? '#f5a62350' : '#1e2530'}` }}>
              {p}
            </button>
          ))}
        </div>
        <input className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-mono text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]" value={POLITICAL_VIEWS.includes(form.politicalView) ? '' : form.politicalView} onChange={(e) => update({ politicalView: e.target.value })} placeholder="O describe tu visión política..." />
      </div>
    </div>
  );
}

function StepReview({ form, eraLabel, loading, callAI, onJumpTo }: {
  form: FormData; eraLabel: string; loading: string | null;
  callAI: (type: string, extra: any, cb: (r: any) => void) => void;
  onJumpTo: (step: number) => void;
}) {
  const [narrativeText, setNarrativeText] = React.useState(form.presentationNarrative || '');
  const sections = [
    { step: 2, label: 'Era y Mundo', value: `${form.year} — ${eraLabel}` },
    { step: 3, label: 'Identidad', value: `${form.name || '(generado)'} · ${form.gender} · ${form.socialClass}` },
    { step: 4, label: 'Apariencia', value: [form.height, form.build, form.skin, form.eyes].filter(Boolean).join(' · ') || '(no definida)' },
    { step: 5, label: 'Personalidad', value: [...form.positiveTraits, ...form.negativeTraits].join(', ') || '(no definida)' },
    { step: 6, label: 'Habilidades', value: form.skills.join(', ') || '(no definidas)' },
    { step: 7, label: 'Creencias', value: [form.religion, form.philosophy, form.politicalView].filter(Boolean).join(' · ') || '(no definidas)' },
  ];

  const errors: string[] = [];
  if (!form.gender) errors.push('Género requerido');
  if (!form.socialClass) errors.push('Clase social requerida');
  if (form.positiveTraits.length < 1) errors.push('Al menos 1 rasgo positivo');
  if (form.negativeTraits.length < 1) errors.push('Al menos 1 rasgo negativo');
  if (form.values.length < 1) errors.push('Al menos 1 valor');
  if (form.fears.length < 1) errors.push('Al menos 1 miedo');
  if (form.skills.length < 1) errors.push('Al menos 1 habilidad');
  if (form.limitations.length < 1) errors.push('Al menos 1 limitación');

  return (
    <div className="space-y-8">
      <SectionTitle>Revisión Final</SectionTitle>

      {errors.length > 0 && (
        <div className="p-4 rounded-xl border border-[#ff4444]/30 bg-[#ff4444]/10">
          <div className="font-mono text-xs text-[#ff4444] font-bold mb-2">CAMPOS REQUERIDOS:</div>
          <ul className="space-y-1">
            {errors.map((e) => <li key={e} className="font-mono text-xs text-[#ff4444]">• {e}</li>)}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        {sections.map((s) => (
          <button key={s.step} onClick={() => onJumpTo(s.step)} className="w-full text-left p-4 rounded-xl border border-[#1e2530] bg-[#0f1218] hover:bg-[#141820] hover:border-[#3d8eff]/30 transition-all group">
            <div className="flex justify-between items-start">
              <div className="font-mono text-xs text-[#5a6478] mb-1 group-hover:text-[#3d8eff] transition-colors">{s.label.toUpperCase()}</div>
              <ChevronRight size={14} className="text-[#5a6478] group-hover:text-[#3d8eff] transition-colors mt-0.5" />
            </div>
            <div className="font-serif text-sm text-[#c8d0dc] truncate">{s.value}</div>
          </button>
        ))}
      </div>

      <div>
        <div className="flex justify-between items-center mb-3">
          <Label>Narrativa de presentación</Label>
          <AIBtn loading={loading} id="generate_presentation" currentLoading={loading} onClick={() => callAI('generate_presentation', { character: { name: form.name }, traits: { positive: form.positiveTraits, negative: form.negativeTraits }, worldContext: form.worldContext }, (r) => { if (r.presentation) setNarrativeText(r.presentation); })} label="✦ Generar narrativa de presentación" small />
        </div>
        <textarea
          rows={5}
          className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-serif text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff] resize-none italic"
          value={narrativeText}
          onChange={(e) => setNarrativeText(e.target.value)}
          placeholder="La IA narrará una introducción cinematográfica de tu personaje y su mundo..."
        />
      </div>

      {errors.length === 0 && (
        <div className="p-6 rounded-xl border border-[#00d4a8]/20 bg-[#00d4a8]/5 text-center">
          <div className="font-serif italic text-[#c8d0dc] mb-2">Todo está listo.</div>
          <div className="font-mono text-xs text-[#5a6478]">Pulsa "COMIENZA LA EXISTENCIA" para nacer en el año {form.year}.</div>
        </div>
      )}
    </div>
  );
}
