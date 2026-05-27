import React, { useState, useEffect } from 'react';
import { useLocation, useParams } from 'wouter';
import { motion } from 'framer-motion';
import { ArrowLeft, Plus, X, Sparkles, Save, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useEngineStore } from '@/store/engine-store';
import type { WorldBuilderConfig } from '@/engine/types';
import { aiAssist } from '@/lib/api';

const TECH_LEVELS = ['Prehistórico', 'Antiguo', 'Medieval', 'Industrial', 'Moderno', 'Futurista'];
const POLITICAL_SYSTEMS = ['Tribal', 'Feudal', 'Imperial', 'República', 'Teocracia', 'Anarquía', 'Dictadura', 'Democracia', 'Monarquía constitucional', 'Oligarquía'];

function generateId() {
  return 'world-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}

function emptyWorld(): WorldBuilderConfig {
  return {
    id: generateId(),
    name: '',
    eraLabel: '',
    yearRange: [800, 1200],
    geography: '',
    techLevel: '',
    politicalSystem: '',
    religion: '',
    economy: '',
    languages: '',
    fauna: '',
    specialRules: { magic: false, magicType: '', uniqueDiseases: [], customRules: [] },
    dangerLevel: 3,
    predefinedEvents: [],
    freeNotes: '',
    currency: { name: '', type: '' },
    moneyInequalityLevel: 5,
    createdAt: Date.now(),
  };
}

export default function WorldBuilder() {
  const { worldId } = useParams<{ worldId?: string }>();
  const [, setLocation] = useLocation();
  const { savedWorlds, saveWorld, deleteWorld, settings } = useEngineStore();

  const [world, setWorld] = useState<WorldBuilderConfig>(() => {
    if (worldId) {
      return savedWorlds.find((w) => w.id === worldId) || emptyWorld();
    }
    return emptyWorld();
  });

  // showingList = true means we show the list/index; false means we show the creation/edit form
  const [showingList, setShowingList] = useState(!worldId);

  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newEvent, setNewEvent] = useState({ year: 0, description: '' });
  const [newDisease, setNewDisease] = useState({ name: '', description: '', transmission: '' });
  const [newCustomRule, setNewCustomRule] = useState('');
  const [showGeography, setShowGeography] = useState(true);

  const update = (partial: Partial<WorldBuilderConfig>) =>
    setWorld((w) => ({ ...w, ...partial }));

  const aiBtn = async (type: string, context: any, field: keyof WorldBuilderConfig | string) => {
    setLoading(field as string);
    setError(null);
    try {
      const result = await aiAssist(type, { ...context, worldName: world.name }, settings.aiProvider);
      const updates: Partial<WorldBuilderConfig> = {};
      if (result.geography) updates.geography = result.geography;
      if (result.fauna) updates.fauna = result.fauna;
      if (result.religion) updates.religion = result.religion;
      if (result.economy) updates.economy = result.economy;
      if (result.languages) updates.languages = result.languages;
      if (result.techLevel) updates.techLevel = result.techLevel;
      if (result.politicalSystem) updates.politicalSystem = result.politicalSystem;
      if (result.dangerLevel != null) updates.dangerLevel = result.dangerLevel;
      if (result.context) updates.freeNotes = world.freeNotes ? world.freeNotes + '\n\n' + result.context : result.context;
      if (result.freeNotes && !updates.freeNotes) updates.freeNotes = result.freeNotes;
      if (Object.keys(updates).length > 0) update(updates);
    } catch (e: any) {
      setError(e.message || 'Error al contactar AI');
    } finally {
      setLoading(null);
    }
  };

  const completeWorld = async () => {
    setLoading('complete');
    setError(null);
    try {
      const result = await aiAssist('complete_world', { world }, settings.aiProvider);
      if (result.geography && !world.geography) update({ geography: result.geography });
      if (result.techLevel && !world.techLevel) update({ techLevel: result.techLevel });
      if (result.politicalSystem && !world.politicalSystem) update({ politicalSystem: result.politicalSystem });
      if (result.religion && !world.religion) update({ religion: result.religion });
      if (result.economy && !world.economy) update({ economy: result.economy });
      if (result.languages && !world.languages) update({ languages: result.languages });
      if (result.fauna && !world.fauna) update({ fauna: result.fauna });
      if (result.freeNotes && !world.freeNotes) update({ freeNotes: result.freeNotes });
    } catch (e: any) {
      setError(e.message || 'Error al contactar AI');
    } finally {
      setLoading(null);
    }
  };

  const generateFullWorld = async () => {
    setLoading('full');
    setError(null);
    try {
      const result = await aiAssist('generate_full_world', { name: world.name, concept: world.freeNotes }, settings.aiProvider);
      update({
        geography: result.geography || world.geography,
        techLevel: result.techLevel || world.techLevel,
        politicalSystem: result.politicalSystem || world.politicalSystem,
        religion: result.religion || world.religion,
        economy: result.economy || world.economy,
        languages: result.languages || world.languages,
        fauna: result.fauna || world.fauna,
        specialRules: result.specialRules || world.specialRules,
        dangerLevel: result.dangerLevel || world.dangerLevel,
        predefinedEvents: result.predefinedEvents || world.predefinedEvents,
        freeNotes: result.freeNotes || world.freeNotes,
      });
    } catch (e: any) {
      setError(e.message || 'Error al contactar AI');
    } finally {
      setLoading(null);
    }
  };

  const handleSave = () => {
    const toSave = { ...world, createdAt: world.createdAt || Date.now() };
    saveWorld(toSave);
    setLocation('/world-builder');
  };

  const handleDelete = () => {
    deleteWorld(world.id);
    setLocation('/world-builder');
  };

  const addEvent = () => {
    if (!newEvent.description.trim()) return;
    update({ predefinedEvents: [...world.predefinedEvents, { ...newEvent }] });
    setNewEvent({ year: 0, description: '' });
  };

  const removeEvent = (i: number) => {
    update({ predefinedEvents: world.predefinedEvents.filter((_, idx) => idx !== i) });
  };

  const addDisease = () => {
    if (!newDisease.name.trim()) return;
    update({
      specialRules: {
        ...world.specialRules,
        uniqueDiseases: [...(world.specialRules.uniqueDiseases || []), { ...newDisease }],
      },
    });
    setNewDisease({ name: '', description: '', transmission: '' });
  };

  const addCustomRule = () => {
    if (!newCustomRule.trim()) return;
    update({
      specialRules: {
        ...world.specialRules,
        customRules: [...(world.specialRules.customRules || []), newCustomRule],
      },
    });
    setNewCustomRule('');
  };

  if (showingList) {
    return (
      <div className="min-h-screen bg-[#0a0c0f] text-[#eef2f8]">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <button onClick={() => setLocation('/')} className="flex items-center gap-2 text-[#5a6478] hover:text-[#eef2f8] font-mono text-sm mb-8 transition-colors">
              <ArrowLeft size={16} /> Volver
            </button>
            <div className="flex justify-between items-center mb-8">
              <div>
                <h1 className="font-display font-bold text-4xl mb-1">Mundos</h1>
                <p className="font-mono text-xs text-[#5a6478] tracking-widest">CONSTRUCTOR DE MUNDOS</p>
              </div>
              <button
                onClick={() => { setWorld(emptyWorld()); setShowingList(false); }}
                className="flex items-center gap-2 px-5 py-3 rounded-xl font-mono text-sm border border-[#3d8eff]/30 text-[#3d8eff] hover:bg-[#3d8eff]/10 transition-all active:scale-95"
              >
                <Plus size={16} /> Nuevo Mundo
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {savedWorlds.map((w) => (
                <button
                  key={w.id}
                  onClick={() => setLocation(`/world-builder/${w.id}`)}
                  className="text-left p-6 rounded-xl border border-[#1e2530] bg-[#0f1218] hover:border-[#3d8eff]/30 hover:bg-[#141820] transition-all group"
                >
                  <h3 className="font-display font-bold text-xl mb-1 group-hover:text-[#3d8eff] transition-colors">{w.name || 'Sin nombre'}</h3>
                  <div className="font-mono text-xs text-[#5a6478] mb-3">{w.techLevel} · Peligro {w.dangerLevel}/10</div>
                  <p className="font-serif italic text-sm text-[#5a6478] line-clamp-2">{w.geography || w.freeNotes || 'Sin descripción'}</p>
                </button>
              ))}
            </div>
            {savedWorlds.length === 0 && (
              <div className="text-center py-20 border border-dashed border-[#1e2530] rounded-xl">
                <div className="font-mono text-[#5a6478] text-sm mb-2">Sin mundos guardados</div>
                <p className="font-serif italic text-xs text-[#5a6478] mb-4">
                  Crea un mundo personalizado para usar en tus partidas.
                </p>
                <button
                  onClick={() => { setWorld(emptyWorld()); setShowingList(false); }}
                  className="font-mono text-sm text-[#3d8eff] hover:underline"
                >
                  Crear el primero →
                </button>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0c0f] text-[#eef2f8]">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <button
            onClick={() => worldId ? setLocation('/world-builder') : setShowingList(true)}
            className="flex items-center gap-2 text-[#5a6478] hover:text-[#eef2f8] font-mono text-sm mb-8 transition-colors"
          >
            <ArrowLeft size={16} /> Mundos
          </button>

          <div className="flex justify-between items-start mb-12">
            <div>
              <h1 className="font-display font-bold text-4xl mb-1">
                {world.name || 'Nuevo Mundo'}
              </h1>
              <p className="font-mono text-xs text-[#5a6478] tracking-widest">CONFIGURACIÓN DEL MUNDO</p>
            </div>
            <div className="flex gap-2">
              <AIButton
                loading={loading === 'complete'}
                onClick={completeWorld}
                label="✦ Completar mundo"
              />
              <AIButton
                loading={loading === 'full'}
                onClick={generateFullWorld}
                label="✦ Generar mundo completo"
              />
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-lg border border-[#ff4444]/30 bg-[#ff4444]/10 font-mono text-sm text-[#ff4444]">
              {error}
            </div>
          )}

          <div className="space-y-8">
            <FormSection title="Nombre e Identidad">
              <Label>Nombre del mundo</Label>
              <input
                className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-serif text-lg text-[#eef2f8] focus:outline-none focus:border-[#3d8eff] transition-colors"
                value={world.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="Nombre del mundo o civilización"
              />
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <Label>Etiqueta de era</Label>
                  <input
                    className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-mono text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff] transition-colors"
                    value={world.eraLabel}
                    onChange={(e) => update({ eraLabel: e.target.value })}
                    placeholder="Ej: Era Medieval, Época Dorada..."
                  />
                </div>
                <div>
                  <Label>Años disponibles</Label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      className="flex-1 bg-[#141820] border border-[#1e2530] rounded-lg px-3 py-3 font-mono text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff] transition-colors"
                      value={world.yearRange[0]}
                      onChange={(e) => update({ yearRange: [parseInt(e.target.value) || 0, world.yearRange[1]] })}
                      placeholder="Desde"
                    />
                    <input
                      type="number"
                      className="flex-1 bg-[#141820] border border-[#1e2530] rounded-lg px-3 py-3 font-mono text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff] transition-colors"
                      value={world.yearRange[1]}
                      onChange={(e) => update({ yearRange: [world.yearRange[0], parseInt(e.target.value) || 0] })}
                      placeholder="Hasta"
                    />
                  </div>
                </div>
              </div>
            </FormSection>

            <FormSection title="Geografía">
              <div className="flex justify-between items-center mb-2">
                <Label>Descripción geográfica</Label>
                <AIButton
                  loading={loading === 'geography'}
                  onClick={() => aiBtn('suggest_geography', { worldName: world.name, concept: world.freeNotes }, 'geography')}
                  label="✦ Generar geografía"
                  small
                />
              </div>
              <textarea
                rows={4}
                className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-serif text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff] transition-colors resize-none"
                value={world.geography}
                onChange={(e) => update({ geography: e.target.value })}
                placeholder="Describe continentes, biomas, zonas climáticas, características geográficas notables..."
              />
            </FormSection>

            <FormSection title="Nivel Tecnológico">
              <div className="flex flex-wrap gap-2 mb-3">
                {TECH_LEVELS.map((t) => (
                  <Chip
                    key={t}
                    label={t}
                    active={world.techLevel === t}
                    onClick={() => update({ techLevel: t })}
                  />
                ))}
              </div>
              <input
                className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-mono text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff] transition-colors"
                value={TECH_LEVELS.includes(world.techLevel) ? '' : world.techLevel}
                onChange={(e) => update({ techLevel: e.target.value })}
                placeholder="O escribe un nivel personalizado..."
              />
            </FormSection>

            <FormSection title="Sistema Político">
              <div className="flex flex-wrap gap-2 mb-3">
                {POLITICAL_SYSTEMS.map((p) => (
                  <Chip
                    key={p}
                    label={p}
                    active={world.politicalSystem === p}
                    onClick={() => update({ politicalSystem: p })}
                  />
                ))}
              </div>
              <input
                className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-mono text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff] transition-colors"
                value={POLITICAL_SYSTEMS.includes(world.politicalSystem) ? '' : world.politicalSystem}
                onChange={(e) => update({ politicalSystem: e.target.value })}
                placeholder="O describe el sistema político..."
              />
            </FormSection>

            <FormSection title="Religión y Creencias">
              <div className="flex justify-between items-center mb-2">
                <Label>Sistema religioso dominante</Label>
                <AIButton
                  loading={loading === 'religion'}
                  onClick={() => aiBtn('suggest_religion', { politicalSystem: world.politicalSystem, techLevel: world.techLevel }, 'religion')}
                  label="✦ Sugerir"
                  small
                />
              </div>
              <textarea
                rows={3}
                className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-serif text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff] transition-colors resize-none"
                value={world.religion}
                onChange={(e) => update({ religion: e.target.value })}
                placeholder="Panteons, doctrinas, instituciones religiosas, normas de fe..."
              />
            </FormSection>

            <FormSection title="Moneda y Economía">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <Label>Nombre de la moneda</Label>
                  <input
                    className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-mono text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff] transition-colors"
                    value={world.currency?.name || ''}
                    onChange={(e) => update({ currency: { ...world.currency, name: e.target.value, type: world.currency?.type || '' } })}
                    placeholder="Ducados, marcos, conchas..."
                  />
                </div>
                <div>
                  <Label>Tipo de comercio</Label>
                  <input
                    className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-mono text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff] transition-colors"
                    value={world.currency?.type || ''}
                    onChange={(e) => update({ currency: { ...world.currency, type: e.target.value, name: world.currency?.name || '' } })}
                    placeholder="Trueque, mercantil, feudal..."
                  />
                </div>
              </div>
              <Label>Desigualdad económica</Label>
              <div className="flex items-center gap-4">
                <span className="font-mono text-xs text-[#5a6478]">Baja</span>
                <input
                  type="range" min={1} max={10}
                  value={world.moneyInequalityLevel || 5}
                  onChange={(e) => update({ moneyInequalityLevel: parseInt(e.target.value) })}
                  className="flex-1 accent-[#3d8eff]"
                />
                <span className="font-mono text-xs text-[#5a6478]">Extrema</span>
                <span className="font-mono text-sm text-[#3d8eff] w-6">{world.moneyInequalityLevel || 5}</span>
              </div>
              <div className="mt-4">
                <Label>Sistema económico (descripción libre)</Label>
                <textarea
                  rows={2}
                  className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-serif text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff] transition-colors resize-none"
                  value={world.economy}
                  onChange={(e) => update({ economy: e.target.value })}
                  placeholder="Sistema de comercio, rutas comerciales, riquezas del mundo..."
                />
              </div>
            </FormSection>

            <FormSection title="Idiomas y Cultura">
              <textarea
                rows={3}
                className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-serif text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff] transition-colors resize-none"
                value={world.languages}
                onChange={(e) => update({ languages: e.target.value })}
                placeholder="Idiomas hablados, normas culturales, tabúes, costumbres, modales sociales..."
              />
            </FormSection>

            <FormSection title="Fauna y Flora">
              <div className="flex justify-between items-center mb-2">
                <Label>Criaturas y plantas del mundo</Label>
                <AIButton
                  loading={loading === 'fauna'}
                  onClick={() => aiBtn('suggest_fauna', { techLevel: world.techLevel }, 'fauna')}
                  label="✦ Sugerir"
                  small
                />
              </div>
              <textarea
                rows={3}
                className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-serif text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff] transition-colors resize-none"
                value={world.fauna}
                onChange={(e) => update({ fauna: e.target.value })}
                placeholder="Animales, plantas, criaturas únicas, seres míticos de este mundo..."
              />
            </FormSection>

            <FormSection title="Reglas Especiales">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg border border-[#1e2530] bg-[#141820]">
                  <div>
                    <div className="font-mono text-sm text-[#eef2f8]">Magia</div>
                    <div className="font-serif text-xs italic text-[#5a6478]">Existe magia en este mundo</div>
                  </div>
                  <button
                    onClick={() => update({ specialRules: { ...world.specialRules, magic: !world.specialRules.magic } })}
                    className="w-12 h-6 rounded-full flex items-center transition-all"
                    style={{ background: world.specialRules.magic ? '#3d8eff40' : '#1e2530', border: `1px solid ${world.specialRules.magic ? '#3d8eff' : '#1e2530'}` }}
                  >
                    <div className="w-4 h-4 rounded-full mx-1 transition-all"
                      style={{ background: world.specialRules.magic ? '#3d8eff' : '#5a6478', transform: world.specialRules.magic ? 'translateX(24px)' : 'translateX(0)' }} />
                  </button>
                </div>
                {world.specialRules.magic && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <input
                      className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-mono text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff] transition-colors"
                      value={world.specialRules.magicType || ''}
                      onChange={(e) => update({ specialRules: { ...world.specialRules, magicType: e.target.value } })}
                      placeholder="Tipo de magia, quién puede usarla, reglas y costos..."
                    />
                  </motion.div>
                )}

                <div>
                  <Label>Enfermedades únicas</Label>
                  <div className="space-y-2 mb-3">
                    {(world.specialRules.uniqueDiseases || []).map((d, i) => (
                      <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-[#141820] border border-[#1e2530]">
                        <div className="flex-1 text-sm">
                          <div className="font-mono text-[#eef2f8]">{d.name}</div>
                          <div className="font-serif text-xs text-[#5a6478] mt-1">{d.description}</div>
                        </div>
                        <button onClick={() => update({ specialRules: { ...world.specialRules, uniqueDiseases: (world.specialRules.uniqueDiseases || []).filter((_, idx) => idx !== i) } })} className="text-[#5a6478] hover:text-[#ff4444]">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <input className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-3 py-2 font-mono text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]" value={newDisease.name} onChange={(e) => setNewDisease({ ...newDisease, name: e.target.value })} placeholder="Nombre de la enfermedad" />
                    <input className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-3 py-2 font-serif text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]" value={newDisease.description} onChange={(e) => setNewDisease({ ...newDisease, description: e.target.value })} placeholder="Descripción y síntomas" />
                    <input className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-3 py-2 font-serif text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]" value={newDisease.transmission} onChange={(e) => setNewDisease({ ...newDisease, transmission: e.target.value })} placeholder="Modo de transmisión" />
                    <button onClick={addDisease} className="w-full py-2 rounded-lg border border-[#1e2530] font-mono text-xs text-[#5a6478] hover:text-[#eef2f8] hover:border-[#3d8eff]/40 transition-all">
                      <Plus size={12} className="inline mr-1" /> Agregar enfermedad
                    </button>
                  </div>
                </div>

                <div>
                  <Label>Otras reglas especiales</Label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {(world.specialRules.customRules || []).map((r, i) => (
                      <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#141820] border border-[#1e2530] font-mono text-xs text-[#c8d0dc]">
                        {r}
                        <button onClick={() => update({ specialRules: { ...world.specialRules, customRules: (world.specialRules.customRules || []).filter((_, idx) => idx !== i) } })} className="text-[#5a6478] hover:text-[#ff4444]">
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input className="flex-1 bg-[#141820] border border-[#1e2530] rounded-lg px-3 py-2 font-mono text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]" value={newCustomRule} onChange={(e) => setNewCustomRule(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { addCustomRule(); } }} placeholder="Nueva regla especial..." />
                    <button onClick={addCustomRule} className="px-4 py-2 rounded-lg border border-[#1e2530] font-mono text-xs text-[#5a6478] hover:text-[#eef2f8] hover:border-[#3d8eff]/40 transition-all">
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </FormSection>

            <FormSection title="Nivel de Peligro">
              <div className="flex items-center gap-4">
                <span className="font-mono text-xs text-[#00d4a8]">PACÍFICO</span>
                <input
                  type="range" min={1} max={10}
                  value={world.dangerLevel}
                  onChange={(e) => update({ dangerLevel: parseInt(e.target.value) })}
                  className="flex-1 accent-[#ff4444]"
                />
                <span className="font-mono text-xs text-[#ff4444]">BRUTAL</span>
                <span className="font-mono text-sm font-bold w-6" style={{ color: world.dangerLevel > 7 ? '#ff4444' : world.dangerLevel > 4 ? '#f5a623' : '#00d4a8' }}>
                  {world.dangerLevel}
                </span>
              </div>
              <div className="mt-2 text-center font-mono text-xs text-[#5a6478]">MODO REALISMO</div>
            </FormSection>

            <FormSection title="Eventos Históricos Predefinidos">
              <p className="font-serif text-xs italic text-[#5a6478] mb-4">Hasta 20 eventos que ocurrirán en años específicos.</p>
              <div className="space-y-2 mb-4">
                {world.predefinedEvents.map((ev, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-[#141820] border border-[#1e2530]">
                    <span className="font-mono text-xs text-[#3d8eff] flex-shrink-0 pt-0.5">Año {ev.year}</span>
                    <span className="font-serif text-sm text-[#c8d0dc] flex-1">{ev.description}</span>
                    <button onClick={() => removeEvent(i)} className="text-[#5a6478] hover:text-[#ff4444] flex-shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
              {world.predefinedEvents.length < 20 && (
                <div className="flex gap-2">
                  <input
                    type="number"
                    className="w-28 bg-[#141820] border border-[#1e2530] rounded-lg px-3 py-2 font-mono text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]"
                    value={newEvent.year}
                    onChange={(e) => setNewEvent({ ...newEvent, year: parseInt(e.target.value) || 0 })}
                    placeholder="Año"
                  />
                  <input
                    className="flex-1 bg-[#141820] border border-[#1e2530] rounded-lg px-3 py-2 font-serif text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff]"
                    value={newEvent.description}
                    onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') addEvent(); }}
                    placeholder="Descripción del evento..."
                  />
                  <button onClick={addEvent} className="px-4 py-2 rounded-lg border border-[#1e2530] font-mono text-xs text-[#5a6478] hover:text-[#eef2f8] hover:border-[#3d8eff]/40 transition-all">
                    <Plus size={14} />
                  </button>
                </div>
              )}
            </FormSection>

            <FormSection title="Notas Libres">
              <textarea
                rows={4}
                className="w-full bg-[#141820] border border-[#1e2530] rounded-lg px-4 py-3 font-serif text-sm text-[#eef2f8] focus:outline-none focus:border-[#3d8eff] transition-colors resize-none"
                value={world.freeNotes}
                onChange={(e) => update({ freeNotes: e.target.value })}
                placeholder="Todo lo que no encaje en las secciones anteriores..."
              />
            </FormSection>
          </div>

          <div className="mt-12 flex gap-3">
            <button
              onClick={handleSave}
              className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl font-mono text-sm font-bold border border-[#00d4a8]/30 text-[#00d4a8] hover:bg-[#00d4a8]/10 transition-all active:scale-95"
            >
              <Save size={16} /> Guardar mundo
            </button>
            {worldId && (
              <button
                onClick={handleDelete}
                className="px-6 py-4 rounded-xl font-mono text-sm border border-[#ff4444]/30 text-[#ff4444] hover:bg-[#ff4444]/10 transition-all active:scale-95"
              >
                <Trash2 size={16} />
              </button>
            )}
            <button
              onClick={() => setLocation('/world-builder')}
              className="px-6 py-4 rounded-xl font-mono text-sm border border-[#1e2530] text-[#5a6478] hover:text-[#eef2f8] transition-all"
            >
              Cancelar
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="font-display font-bold text-base text-[#eef2f8] border-b border-[#1e2530] pb-2">{title}</h3>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block font-mono text-xs text-[#5a6478] tracking-widest mb-1.5">{children}</label>;
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 rounded-lg font-mono text-xs transition-all active:scale-95"
      style={{
        background: active ? '#3d8eff20' : '#14182050',
        color: active ? '#3d8eff' : '#5a6478',
        border: `1px solid ${active ? '#3d8eff50' : '#1e2530'}`,
      }}
    >
      {label}
    </button>
  );
}

function AIButton({ loading, onClick, label, small }: { loading: boolean; onClick: () => void; label: string; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-1.5 rounded-lg font-mono border transition-all active:scale-95 disabled:opacity-50 ${small ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm'}`}
      style={{ borderColor: '#f5a62330', color: '#f5a623', background: loading ? '#f5a62310' : 'transparent' }}
    >
      {loading ? <span className="animate-pulse">⟳</span> : <Sparkles size={small ? 10 : 12} />}
      {loading ? 'Generando...' : label}
    </button>
  );
}
