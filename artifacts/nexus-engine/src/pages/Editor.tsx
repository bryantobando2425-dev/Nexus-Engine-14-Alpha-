import React, { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Save, X, Plus } from 'lucide-react';
import { useEngineStore } from '@/store/engine-store';

const TABS = [
  { id: 'narrative', label: 'NARRATIVA' },
  { id: 'world', label: 'MUNDO' },
  { id: 'character', label: 'PERSONAJE' },
  { id: 'npcs', label: 'NPCs' },
  { id: 'legacy', label: 'LEGADO' },
];

export default function Editor() {
  const { runId } = useParams<{ runId: string }>();
  const [, setLocation] = useLocation();
  const { activeRun, settings, updateSettings, narrativeVoice, setNarrativeVoice, updateActiveRun } = useEngineStore();
  const [activeTab, setActiveTab] = useState('narrative');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#0a0c0f] text-[#eef2f8]">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <button
            onClick={() => activeRun ? setLocation(`/game/${activeRun.runId}`) : setLocation('/')}
            className="flex items-center gap-2 text-[#5a6478] hover:text-[#eef2f8] font-mono text-sm mb-8 transition-colors"
          >
            <ArrowLeft size={16} /> Volver al juego
          </button>

          <div className="flex justify-between items-start mb-8">
            <div>
              <h1 className="font-display font-bold text-4xl mb-1">Editor</h1>
              <p className="font-mono text-xs text-[#5a6478] tracking-widest">PARTIDA: {runId || activeRun?.runId || '—'}</p>
            </div>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-mono text-sm border transition-all active:scale-95"
              style={{ borderColor: saved ? '#00d4a850' : '#1e2530', color: saved ? '#00d4a8' : '#5a6478', background: saved ? '#00d4a810' : 'transparent' }}
            >
              <Save size={14} /> {saved ? 'Guardado' : 'Guardar'}
            </button>
          </div>

          <div className="flex border-b border-[#1e2530] mb-8 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-3 font-mono text-xs tracking-widest whitespace-nowrap transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'border-[#f5a623] text-[#f5a623] bg-[#f5a623]/5'
                    : 'border-transparent text-[#5a6478] hover:text-[#c8d0dc]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-[#0f1218] border border-[#1e2530] rounded-2xl p-8"
            >
              {activeTab === 'narrative' && <NarrativeTab settings={settings} updateSettings={updateSettings} narrativeVoice={narrativeVoice} setNarrativeVoice={setNarrativeVoice} />}
              {activeTab === 'world' && <WorldTab run={activeRun} updateRun={updateActiveRun} />}
              {activeTab === 'character' && <CharacterTab run={activeRun} updateRun={updateActiveRun} />}
              {activeTab === 'npcs' && <NPCsTab run={activeRun} updateRun={updateActiveRun} />}
              {activeTab === 'legacy' && <LegacyTab run={activeRun} />}
            </motion.div>
          </AnimatePresence>

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={() => activeRun ? setLocation(`/game/${activeRun.runId}`) : setLocation('/')}
              className="px-5 py-2.5 rounded-xl font-mono text-sm border border-[#1e2530] text-[#5a6478] hover:text-[#eef2f8] transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2.5 rounded-xl font-mono text-sm border border-[#f5a623]/30 text-[#f5a623] hover:bg-[#f5a623]/10 transition-all active:scale-95"
            >
              Aplicar cambios
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="font-serif text-lg text-[#eef2f8] mb-4 border-b border-[#1e2530] pb-2">{children}</h3>;
}

function ToggleRow({ label, desc, checked, onChange, accent = '#3d8eff' }: {
  label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void; accent?: string;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[#1e2530]/50">
      <div>
        <div className="font-mono text-sm text-[#eef2f8]">{label}</div>
        {desc && <div className="font-serif text-xs italic text-[#5a6478] mt-0.5">{desc}</div>}
      </div>
      <button onClick={() => onChange(!checked)} className="w-12 h-6 rounded-full flex items-center transition-all flex-shrink-0 ml-4"
        style={{ background: checked ? accent + '40' : '#1e2530', border: `1px solid ${checked ? accent : '#1e2530'}` }}>
        <div className="w-4 h-4 rounded-full mx-1 transition-all"
          style={{ background: checked ? accent : '#5a6478', transform: checked ? 'translateX(24px)' : 'translateX(0)' }} />
      </button>
    </div>
  );
}

function NarrativeTab({ settings, updateSettings, narrativeVoice, setNarrativeVoice }: any) {
  const toggleSub = (key: string) => {
    updateSettings({ explicitSubToggles: { ...settings.explicitSubToggles, [key]: !settings.explicitSubToggles[key] } });
  };

  return (
    <div className="space-y-8">
      <div>
        <SectionTitle>Proveedor de IA</SectionTitle>
        <AIProviderSelector value={settings.aiProvider} onChange={(aiProvider) => updateSettings({ aiProvider })} />
      </div>

      <div>
        <SectionTitle>Voz narrativa</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { id: 'third_person', label: 'Narrador externo', desc: 'Tercera persona. Autor omnisciente.' },
            { id: 'first_person', label: 'Primera persona', desc: 'Segunda persona. Inmersión total.' },
            { id: 'world_speaks', label: 'El mundo habla', desc: 'Diarios, cartas, voces ambientales.' },
          ].map((v) => (
            <button key={v.id} onClick={() => setNarrativeVoice(v.id)} className="text-left p-4 rounded-xl border transition-all"
              style={{ borderColor: narrativeVoice === v.id ? '#3d8eff' : '#1e2530', background: narrativeVoice === v.id ? '#3d8eff10' : '#141820' }}>
              <div className="font-mono text-sm mb-1" style={{ color: narrativeVoice === v.id ? '#3d8eff' : '#eef2f8' }}>{v.label}</div>
              <div className="font-serif text-xs italic text-[#5a6478]">{v.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle>Modo explícito</SectionTitle>
        <ToggleRow label="Master — Modo Explícito" desc="Activa el control de contenido adulto" checked={settings.explicitMode} onChange={(v) => updateSettings({ explicitMode: v })} accent="#f5a623" />
        {settings.explicitMode && (
          <div className="mt-4 ml-4 pl-4 border-l-2 border-[#f5a623]/20 space-y-1">
            {[
              { key: 'violence', label: 'Violencia y gore', desc: 'Narración sin filtros de conflictos físicos' },
              { key: 'language', label: 'Lenguaje vulgar', desc: 'Groserías y lenguaje explícito' },
              { key: 'sexual', label: 'Contenido sexual', desc: 'Escenas íntimas narradas explícitamente' },
              { key: 'torture', label: 'Tortura y crueldad extrema', desc: 'Situaciones de extrema crueldad' },
              { key: 'substances', label: 'Consumo de sustancias', desc: 'Descripción detallada de uso de drogas/alcohol' },
              { key: 'psychologicalTrauma', label: 'Trauma psicológico', desc: 'Representación explícita de trauma mental' },
            ].map(({ key, label, desc }) => (
              <ToggleRow key={key} label={label} desc={desc} checked={settings.explicitSubToggles[key]} onChange={() => toggleSub(key)} accent="#f5a623" />
            ))}
          </div>
        )}
      </div>

      <div>
        <SectionTitle>Otros ajustes</SectionTitle>
        <ToggleRow label="Perspectivas externas" desc="El narrador cambia brevemente al punto de vista de NPCs" checked={settings.otherPerspectives} onChange={(v) => updateSettings({ otherPerspectives: v })} />
        <ToggleRow label="Tiempo subjetivo" desc="Narración con dilatación temporal" checked={settings.subjectiveTime} onChange={(v) => updateSettings({ subjectiveTime: v })} />
      </div>
    </div>
  );
}

function AIProviderSelector({ value, onChange }: { value: 'gemini' | 'anthropic'; onChange: (value: 'gemini' | 'anthropic') => void }) {
  const providers = [
    { id: 'gemini' as const, label: 'Gemini', desc: 'Cuota independiente de Gemini.' },
    { id: 'anthropic' as const, label: 'Claude (Anthropic)', desc: 'Cuota independiente de Anthropic.' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {providers.map((provider) => (
        <button
          key={provider.id}
          onClick={() => onChange(provider.id)}
          className="text-left p-4 rounded-xl border transition-all"
          style={{
            borderColor: value === provider.id ? '#00d4a8' : '#1e2530',
            background: value === provider.id ? '#00d4a810' : '#141820',
            color: value === provider.id ? '#00d4a8' : '#5a6478',
          }}
        >
          <div className="font-mono text-sm mb-1">{provider.label}</div>
          <div className="font-serif text-xs italic opacity-70">{provider.desc}</div>
        </button>
      ))}
    </div>
  );
}

function WorldTab({ run, updateRun }: { run: any; updateRun: (p: any) => void }) {
  const era = run?.eraConfig || {};
  const world = run?.worldState || {};

  const updateEra = (partial: any) => updateRun({ eraConfig: { ...era, ...partial } });
  const updateWorld = (partial: any) => updateRun({ worldState: { ...world, ...partial } });

  const [newConflict, setNewConflict] = useState('');
  const [newEvent, setNewEvent] = useState({ year: 0, description: '' });

  return (
    <div className="space-y-6">
      <SectionTitle>Estado del mundo</SectionTitle>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-mono text-xs text-[#5a6478] mb-1.5 tracking-widest">AÑO ACTUAL</label>
          <input type="number" className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-mono text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]"
            value={era.year || ''} onChange={(e) => updateEra({ year: parseInt(e.target.value) })} />
        </div>
        <div>
          <label className="block font-mono text-xs text-[#5a6478] mb-1.5 tracking-widest">ESTACIÓN</label>
          <select className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-mono text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]"
            value={world.season || ''} onChange={(e) => updateWorld({ season: e.target.value })}>
            {['Primavera', 'Verano', 'Otoño', 'Invierno'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block font-mono text-xs text-[#5a6478] mb-1.5 tracking-widest">CLIMA</label>
          <input className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-mono text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]"
            value={world.weather || ''} onChange={(e) => updateWorld({ weather: e.target.value })} placeholder="Despejado, lluvioso..." />
        </div>
        <div>
          <label className="block font-mono text-xs text-[#5a6478] mb-1.5 tracking-widest">CLIMA POLÍTICO</label>
          <input className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-mono text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]"
            value={world.politicalClimate || ''} onChange={(e) => updateWorld({ politicalClimate: e.target.value })} placeholder="Estable, tenso..." />
        </div>
      </div>

      <div>
        <label className="block font-mono text-xs text-[#5a6478] mb-1.5 tracking-widest">GEOGRAFÍA</label>
        <textarea rows={3} className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-serif text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff] resize-none"
          value={era.worldNotes || ''} onChange={(e) => updateEra({ worldNotes: e.target.value })} placeholder="Notas geográficas del mundo..." />
      </div>

      <div>
        <label className="block font-mono text-xs text-[#5a6478] mb-2 tracking-widest">CONFLICTOS ACTIVOS</label>
        <div className="space-y-2 mb-2">
          {(world.activeConflicts || []).map((c: string, i: number) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-[#141820] border border-[#1e2530]">
              <span className="flex-1 font-serif text-xs text-[#c8d0dc]">{c}</span>
              <button onClick={() => updateWorld({ activeConflicts: world.activeConflicts.filter((_: any, idx: number) => idx !== i) })} className="text-[#5a6478] hover:text-[#ff4444]"><X size={12} /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="flex-1 bg-[#141820] border border-[#1e2530] rounded-lg px-3 py-2 font-serif text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]"
            value={newConflict} onChange={(e) => setNewConflict(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && newConflict.trim()) { updateWorld({ activeConflicts: [...(world.activeConflicts || []), newConflict] }); setNewConflict(''); } }}
            placeholder="Nuevo conflicto..." />
          <button onClick={() => { if (newConflict.trim()) { updateWorld({ activeConflicts: [...(world.activeConflicts || []), newConflict] }); setNewConflict(''); } }}
            className="px-3 py-2 rounded-lg border border-[#1e2530] text-[#5a6478] hover:text-[#eef2f8] transition-all">
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div>
        <label className="block font-mono text-xs text-[#5a6478] mb-2 tracking-widest">EVENTOS FUTUROS PROGRAMADOS</label>
        <div className="space-y-2 mb-3">
          {(era.futureEvents || []).map((ev: any, i: number) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-[#141820] border border-[#1e2530]">
              <span className="font-mono text-xs text-[#3d8eff] flex-shrink-0 pt-0.5">Año {ev.year}</span>
              <span className="font-serif text-sm text-[#c8d0dc] flex-1">{ev.description}</span>
              <button onClick={() => updateEra({ futureEvents: (era.futureEvents || []).filter((_: any, idx: number) => idx !== i) })} className="text-[#5a6478] hover:text-[#ff4444]"><X size={12} /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input type="number" className="w-24 bg-[#141820] border border-[#1e2530] rounded-lg px-3 py-2 font-mono text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]"
            value={newEvent.year} onChange={(e) => setNewEvent({ ...newEvent, year: parseInt(e.target.value) || 0 })} placeholder="Año" />
          <input className="flex-1 bg-[#141820] border border-[#1e2530] rounded-lg px-3 py-2 font-serif text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]"
            value={newEvent.description} onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter' && newEvent.description.trim()) { updateEra({ futureEvents: [...(era.futureEvents || []), newEvent] }); setNewEvent({ year: 0, description: '' }); } }}
            placeholder="Descripción del evento..." />
          <button onClick={() => { if (newEvent.description.trim()) { updateEra({ futureEvents: [...(era.futureEvents || []), newEvent] }); setNewEvent({ year: 0, description: '' }); } }}
            className="px-3 py-2 rounded-lg border border-[#1e2530] text-[#5a6478] hover:text-[#eef2f8] transition-all">
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function CharacterTab({ run, updateRun }: { run: any; updateRun: (p: any) => void }) {
  const char = run?.character || {};
  const updateChar = (partial: any) => updateRun({ character: { ...char, ...partial } });

  return (
    <div className="space-y-6">
      <SectionTitle>Datos del personaje</SectionTitle>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-mono text-xs text-[#5a6478] mb-1.5 tracking-widest">NOMBRE</label>
          <input className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-serif text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]"
            value={char.name || ''} onChange={(e) => updateChar({ name: e.target.value })} />
        </div>
        <div>
          <label className="block font-mono text-xs text-[#5a6478] mb-1.5 tracking-widest">EDAD</label>
          <input type="number" className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-mono text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]"
            value={char.age || ''} onChange={(e) => updateChar({ age: parseInt(e.target.value) })} />
        </div>
        <div>
          <label className="block font-mono text-xs text-[#5a6478] mb-1.5 tracking-widest">CLASE SOCIAL</label>
          <input className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-mono text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]"
            value={char.socialClass || ''} onChange={(e) => updateChar({ socialClass: e.target.value })} />
        </div>
        <div>
          <label className="block font-mono text-xs text-[#5a6478] mb-1.5 tracking-widest">LOCALIZACIÓN</label>
          <input className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-serif text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]"
            value={run?.worldState?.currentLocation?.name || ''} onChange={(e) => updateRun({ worldState: { ...run?.worldState, currentLocation: { ...run?.worldState?.currentLocation, name: e.target.value } } })} />
        </div>
      </div>

      <div>
        <label className="block font-mono text-xs text-[#5a6478] mb-1.5 tracking-widest">DESCRIPCIÓN FÍSICA</label>
        <textarea rows={3} className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-serif text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff] resize-none"
          value={char.appearance?.freeDescription || ''} onChange={(e) => updateChar({ appearance: { ...char.appearance, freeDescription: e.target.value } })} placeholder="Descripción física..." />
      </div>

      <div>
        <label className="block font-mono text-xs text-[#5a6478] mb-1.5 tracking-widest">MOTIVACIÓN</label>
        <textarea rows={2} className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-serif text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff] resize-none"
          value={char.personality?.motivation || ''} onChange={(e) => updateChar({ personality: { ...char.personality, motivation: e.target.value } })} placeholder="¿Qué impulsa a este personaje?" />
      </div>

      <div>
        <SectionTitle>Inventario</SectionTitle>
        <p className="font-serif italic text-[#5a6478] text-sm">El inventario se gestiona desde el panel del juego.</p>
      </div>
    </div>
  );
}

function NPCsTab({ run, updateRun }: { run: any; updateRun: (p: any) => void }) {
  const npcs = run?.npcs || [];
  const [editingNPC, setEditingNPC] = useState<string | null>(null);

  const updateNPC = (id: string, partial: any) => {
    updateRun({ npcs: npcs.map((n: any) => n.id === id ? { ...n, ...partial } : n) });
  };

  const addNPC = () => {
    const newNPC = {
      id: 'npc-' + Date.now(),
      name: 'Nuevo NPC',
      status: 'vivo',
      relationship: { type: 'Desconocido', emotionalCharge: 'Neutral', keyMoments: [] },
    };
    updateRun({ npcs: [...npcs, newNPC] });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <SectionTitle>Personajes conocidos</SectionTitle>
        <button onClick={addNPC} className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-mono text-xs border border-[#1e2530] text-[#5a6478] hover:text-[#eef2f8] transition-all">
          <Plus size={12} /> Crear NPC
        </button>
      </div>

      {npcs.length === 0 ? (
        <p className="font-serif italic text-[#5a6478] text-sm">Sin NPCs registrados.</p>
      ) : (
        npcs.map((npc: any) => (
          <div key={npc.id} className="border border-[#1e2530] rounded-xl overflow-hidden">
            <button
              onClick={() => setEditingNPC(editingNPC === npc.id ? null : npc.id)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-[#141820] transition-colors"
            >
              <div>
                <div className="font-serif text-sm text-[#eef2f8]">{npc.name || 'Desconocido'}</div>
                <div className="font-mono text-[10px] text-[#5a6478]">{npc.occupation || ''} · {npc.relationship?.type || ''}</div>
              </div>
              <span className="font-mono text-[10px]" style={{ color: npc.status === 'muerto' ? '#ff4444' : '#00d4a8' }}>{npc.status}</span>
            </button>
            <AnimatePresence>
              {editingNPC === npc.id && (
                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                  <div className="p-4 border-t border-[#1e2530] space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-mono text-[10px] text-[#5a6478] mb-1 tracking-widest">NOMBRE</label>
                        <input className="w-full bg-[#0f1218] border border-[#1e2530] rounded-lg px-3 py-2 font-serif text-xs text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]"
                          value={npc.name || ''} onChange={(e) => updateNPC(npc.id, { name: e.target.value })} />
                      </div>
                      <div>
                        <label className="block font-mono text-[10px] text-[#5a6478] mb-1 tracking-widest">ESTADO</label>
                        <select className="w-full bg-[#0f1218] border border-[#1e2530] rounded-lg px-3 py-2 font-mono text-xs text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]"
                          value={npc.status} onChange={(e) => updateNPC(npc.id, { status: e.target.value })}>
                          <option value="vivo">Vivo</option>
                          <option value="muerto">Muerto</option>
                          <option value="desaparecido">Desaparecido</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block font-mono text-[10px] text-[#5a6478] mb-1 tracking-widest">OCUPACIÓN</label>
                      <input className="w-full bg-[#0f1218] border border-[#1e2530] rounded-lg px-3 py-2 font-serif text-xs text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]"
                        value={npc.occupation || ''} onChange={(e) => updateNPC(npc.id, { occupation: e.target.value })} placeholder="Herrero, mercader..." />
                    </div>
                    <div>
                      <label className="block font-mono text-[10px] text-[#5a6478] mb-1 tracking-widest">TIPO DE RELACIÓN</label>
                      <input className="w-full bg-[#0f1218] border border-[#1e2530] rounded-lg px-3 py-2 font-mono text-xs text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]"
                        value={npc.relationship?.type || ''} onChange={(e) => updateNPC(npc.id, { relationship: { ...npc.relationship, type: e.target.value } })} placeholder="Aliado, rival..." />
                    </div>
                    <div>
                      <label className="block font-mono text-[10px] text-[#5a6478] mb-1 tracking-widest">MOTIVACIONES CONOCIDAS</label>
                      <textarea rows={2} className="w-full bg-[#0f1218] border border-[#1e2530] rounded-lg px-3 py-2 font-serif text-xs text-[#eef2f8] focus:outline-none focus:border-[#3d8eff] resize-none"
                        value={npc.knownMotivations || ''} onChange={(e) => updateNPC(npc.id, { knownMotivations: e.target.value })} placeholder="¿Qué sabes de sus objetivos?" />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))
      )}
    </div>
  );
}

function LegacyTab({ run }: { run: any }) {
  return (
    <div className="space-y-6">
      <SectionTitle>Legado y ecos</SectionTitle>
      <div>
        <div className="font-mono text-xs text-[#5a6478] tracking-widest mb-3">COLA DE CONSECUENCIAS</div>
        {(run?.consequenceQueue || []).length === 0 ? (
          <p className="font-serif italic text-[#5a6478] text-sm">Sin consecuencias pendientes.</p>
        ) : (
          <div className="space-y-2">
            {(run.consequenceQueue as any[]).map((c: any, i: number) => (
              <div key={i} className="p-4 rounded-xl border border-[#1e2530] bg-[#141820]">
                <div className="font-serif text-sm text-[#c8d0dc]">{c.description}</div>
                <div className="font-mono text-[10px] text-[#5a6478] mt-1">Turno programado: {c.scheduledTurn}</div>
                {c.sourceAction && <div className="font-mono text-[10px] text-[#5a6478]">Origen: {c.sourceAction}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <div className="font-mono text-xs text-[#5a6478] tracking-widest mb-3">MOMENTOS DE ALTO LEGADO</div>
        {(run?.narrativeHistory || []).filter((t: any) => t.legacyWeight && t.legacyWeight > 0.6).length === 0 ? (
          <p className="font-serif italic text-[#5a6478] text-sm">Los momentos significativos se registran aquí cuando ocurren.</p>
        ) : (
          <div className="space-y-2">
            {(run.narrativeHistory as any[]).filter((t: any) => t.legacyWeight && t.legacyWeight > 0.6).slice(-10).map((t: any) => (
              <div key={t.id} className="p-3 rounded-lg border border-[#f5a623]/20 bg-[#f5a623]/5">
                <p className="font-serif text-xs text-[#c8d0dc] line-clamp-2">{t.text}</p>
                <div className="font-mono text-[10px] text-[#f5a623] mt-1">Peso: {(t.legacyWeight * 100).toFixed(0)}%</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
