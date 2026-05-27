import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, User, Globe, Settings, Lock, ChevronRight, X,
  Upload, FolderOpen, Trash2, Download, AlertTriangle,
  CheckCircle, Clock, BookOpen, Sword, Calendar,
} from 'lucide-react';
import { useEngineStore } from '@/store/engine-store';
import { migrateRun, validateRunData } from '@/engine/migration';
import type { ActiveRun } from '@/engine/types';

const SCHEMA_VERSION = '4.9';

export default function Home() {
  const [, setLocation] = useLocation();
  const { activeRun, savedGames, saveRunToLibrary, deleteSavedGame, setActiveRun } = useEngineStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showExodusInfo, setShowExodusInfo] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Starfield animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const particles: { x: number; y: number; vx: number; vy: number; alpha: number; size: number }[] = [];
    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        alpha: Math.random() * 0.5 + 0.1,
        size: Math.random() * 2 + 0.5,
      });
    }
    let animId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(61,142,255,${p.alpha})`;
        ctx.fill();
      });
      animId = requestAnimationFrame(animate);
    };
    animate();
    const handleResize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    window.addEventListener('resize', handleResize);
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', handleResize); };
  }, []);

  const handleLoadGame = (run: ActiveRun) => {
    setActiveRun(run);
    setShowLoadModal(false);
    setLocation(`/game/${run.runId}`);
  };

  // All saves including the active run (deduped)
  const allSaves = React.useMemo(() => {
    const saved = [...savedGames];
    if (activeRun) {
      const idx = saved.findIndex(g => g.runId === activeRun.runId);
      if (idx >= 0) saved[idx] = activeRun;
      else saved.unshift(activeRun);
    }
    return saved.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
  }, [savedGames, activeRun]);

  return (
    <div className="relative min-h-screen flex flex-col bg-background overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-0" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-transparent to-background/80 z-0 pointer-events-none" />

      <div className="relative z-10 flex flex-col min-h-screen">
        <div className="flex-1 flex flex-col items-center justify-center px-4 pt-16 pb-8">

          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center mb-16"
          >
            <div className="font-mono text-xs tracking-[0.4em] text-[#3d8eff]/60 mb-3 uppercase">Sistema de Simulación de Vidas</div>
            <h1 className="font-display font-extrabold text-6xl md:text-8xl tracking-tighter text-[#eef2f8] drop-shadow-[0_0_40px_rgba(61,142,255,0.15)]">
              NEXUS
            </h1>
            <h2 className="font-display font-bold text-4xl md:text-5xl tracking-tight text-[#3d8eff]/80 -mt-2">
              ENGINE
            </h2>
          </motion.div>

          {/* Game cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl mb-8"
          >
            <GameCard
              id="una-vida"
              name="UNA VIDA"
              tagline="Vive cualquier vida, en cualquier época, en la Tierra. Sin objetivos. Simplemente existe."
              status="DISPONIBLE"
              gradient="from-[#0a2040] via-[#0a1a30] to-[#051020]"
              accentColor="#3d8eff"
              accentTeal="#00d4a8"
              hasActiveRun={activeRun?.gameId === 'una-vida'}
              activeRunId={activeRun?.runId}
              onPlay={() => setLocation('/new-run')}
              onContinue={() => activeRun && setLocation(`/game/${activeRun.runId}`)}
            />
            <GameCard
              id="exodus"
              name="EXODUS"
              tagline="La Tierra ya no existe. Encuentra un nuevo hogar."
              status="PRÓXIMAMENTE"
              gradient="from-[#080a14] via-[#060810] to-[#030508]"
              accentColor="#5a6478"
              accentTeal="#5a6478"
              locked
              onPlay={() => setShowExodusInfo(true)}
            />
          </motion.div>

          {/* Primary actions: Importar + Cargar */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.5 }}
            className="flex items-center gap-3 mb-6"
          >
            <ActionButton
              icon={<Upload size={14} />}
              label="Importar Partida"
              onClick={() => setShowImportModal(true)}
              accent="#3d8eff"
            />
            <ActionButton
              icon={<FolderOpen size={14} />}
              label={`Cargar Partida${allSaves.length > 0 ? ` (${allSaves.length})` : ''}`}
              onClick={() => setShowLoadModal(true)}
              accent="#00d4a8"
              disabled={allSaves.length === 0}
            />
          </motion.div>

          {/* Nav */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55, duration: 0.5 }}
            className="flex items-center gap-4"
          >
            <NavButton icon={<User size={14} />} label="Perfil" onClick={() => setLocation('/profile')} />
            <NavButton icon={<Globe size={14} />} label="Mundos" onClick={() => setLocation('/world-builder')} />
            <NavButton icon={<Settings size={14} />} label="Configuración" onClick={() => setLocation('/settings')} />
          </motion.div>
        </div>
      </div>

      {/* Exodus info modal */}
      <AnimatePresence>
        {showExodusInfo && (
          <Modal onClose={() => setShowExodusInfo(false)}>
            <div className="flex justify-between items-start mb-6">
              <div>
                <div className="font-mono text-xs text-[#5a6478] tracking-widest mb-1">PRÓXIMAMENTE</div>
                <h2 className="font-display font-bold text-3xl text-[#eef2f8]">EXODUS</h2>
              </div>
              <button onClick={() => setShowExodusInfo(false)} className="text-[#5a6478] hover:text-[#eef2f8] transition-colors">
                <X size={20} />
              </button>
            </div>
            <p className="font-serif italic text-[#c8d0dc] text-lg mb-6 leading-relaxed">
              "La Tierra ya no existe. Encuentra un nuevo hogar."
            </p>
            <p className="text-[#5a6478] font-serif leading-relaxed">
              EXODUS lleva la simulación al espacio. Sin la Tierra como ancla, la humanidad dispersa construye nuevas civilizaciones en mundos desconocidos. Cada decisión es un acto de fundación. Cada error, una extinción posible.
            </p>
            <div className="mt-8 pt-6 border-t border-[#1e2530] flex justify-end">
              <button onClick={() => setShowExodusInfo(false)} className="font-mono text-sm text-[#5a6478] hover:text-[#eef2f8] transition-colors">
                Cerrar
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Load game modal */}
      <AnimatePresence>
        {showLoadModal && (
          <LoadGameModal
            saves={allSaves}
            activeRunId={activeRun?.runId}
            onLoad={handleLoadGame}
            onDelete={(runId) => {
              deleteSavedGame(runId);
              // If deleting the active run, also clear it
              if (activeRun?.runId === runId) setActiveRun(null);
            }}
            onExport={(run) => exportRunToFile(run)}
            onClose={() => setShowLoadModal(false)}
          />
        )}
      </AnimatePresence>

      {/* Import game modal */}
      <AnimatePresence>
        {showImportModal && (
          <ImportGameModal
            existingRunIds={allSaves.map(s => s.runId)}
            onImport={(run) => {
              saveRunToLibrary(run);
              setShowImportModal(false);
            }}
            onClose={() => setShowImportModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── EXPORT HELPER ────────────────────────────────────────────────────────────

function exportRunToFile(run: ActiveRun) {
  const exportData = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    run,
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const charName = (run.character?.name || 'partida').replace(/\s+/g, '_');
  a.download = `nexus_${charName}_v${SCHEMA_VERSION}_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── LOAD GAME MODAL ─────────────────────────────────────────────────────────

function LoadGameModal({
  saves, activeRunId, onLoad, onDelete, onExport, onClose,
}: {
  saves: ActiveRun[];
  activeRunId?: string;
  onLoad: (run: ActiveRun) => void;
  onDelete: (runId: string) => void;
  onExport: (run: ActiveRun) => void;
  onClose: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <Modal onClose={onClose} wide>
      <div className="flex justify-between items-center mb-6">
        <div>
          <div className="font-mono text-xs text-[#3d8eff]/70 tracking-widest mb-1">SISTEMA DE PARTIDAS</div>
          <h2 className="font-display font-bold text-2xl text-[#eef2f8]">Cargar Partida</h2>
        </div>
        <button onClick={onClose} className="text-[#5a6478] hover:text-[#eef2f8] transition-colors">
          <X size={20} />
        </button>
      </div>

      {saves.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen size={40} className="mx-auto mb-4 text-[#2a3040]" />
          <p className="font-mono text-[#5a6478] text-sm">No hay partidas guardadas</p>
          <p className="text-[#3a4050] text-xs mt-2">Las partidas se guardan automáticamente durante el juego.</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {saves.map((run) => (
            <SaveEntry
              key={run.runId}
              run={run}
              isActive={run.runId === activeRunId}
              confirmingDelete={confirmDelete === run.runId}
              onLoad={() => onLoad(run)}
              onExport={() => onExport(run)}
              onAskDelete={() => setConfirmDelete(run.runId)}
              onCancelDelete={() => setConfirmDelete(null)}
              onConfirmDelete={() => { onDelete(run.runId); setConfirmDelete(null); }}
            />
          ))}
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-[#1e2530] flex justify-end">
        <button
          onClick={onClose}
          className="font-mono text-sm text-[#5a6478] hover:text-[#eef2f8] transition-colors"
        >
          Cerrar
        </button>
      </div>
    </Modal>
  );
}

function SaveEntry({
  run, isActive, confirmingDelete,
  onLoad, onExport, onAskDelete, onCancelDelete, onConfirmDelete,
}: {
  run: ActiveRun;
  isActive: boolean;
  confirmingDelete: boolean;
  onLoad: () => void;
  onExport: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const char = run.character || {};
  const era = run.eraConfig || {};
  const lastTurn = run.narrativeHistory?.slice(-1)[0];
  const savedDate = run.savedAt
    ? new Date(run.savedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
    : '—';
  const eraLabel = era.eraLabel || era.eraName || era.name || 'Era desconocida';
  const snippet = lastTurn?.text
    ? lastTurn.text.slice(0, 100) + (lastTurn.text.length > 100 ? '...' : '')
    : 'Sin historial narrativo.';

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="rounded-xl border p-4 transition-colors"
      style={{
        borderColor: isActive ? '#00d4a840' : '#1e2530',
        background: isActive ? '#00d4a808' : '#0a0e14',
      }}
    >
      {isActive && (
        <div className="text-[10px] font-mono font-bold tracking-widest text-[#00d4a8] mb-2">
          ▶ PARTIDA ACTIVA
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-display font-bold text-[#eef2f8] text-lg truncate">
              {char.name || 'Personaje sin nombre'}
            </span>
            <span className="font-mono text-xs text-[#5a6478] shrink-0">
              {char.age != null ? `${char.age} años` : ''}
            </span>
          </div>

          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <span className="flex items-center gap-1 font-mono text-[10px] text-[#3d8eff]/70">
              <Sword size={10} /> {eraLabel}
            </span>
            <span className="flex items-center gap-1 font-mono text-[10px] text-[#5a6478]">
              <BookOpen size={10} /> {run.turnCount ?? 0} turnos
            </span>
            <span className="flex items-center gap-1 font-mono text-[10px] text-[#5a6478]">
              <Clock size={10} /> {savedDate}
            </span>
            {run.worldState?.currentLocation?.name && (
              <span className="font-mono text-[10px] text-[#5a6478] truncate max-w-[120px]">
                📍 {run.worldState.currentLocation.name}
              </span>
            )}
          </div>

          <p className="font-serif text-xs text-[#5a6478] italic leading-relaxed line-clamp-2">
            {snippet}
          </p>
        </div>
      </div>

      {confirmingDelete ? (
        <div className="mt-3 flex items-center gap-2 pt-3 border-t border-[#1e2530]">
          <AlertTriangle size={13} className="text-red-400 shrink-0" />
          <span className="font-mono text-xs text-red-400 flex-1">¿Eliminar esta partida permanentemente?</span>
          <button
            onClick={onConfirmDelete}
            className="px-3 py-1 rounded text-xs font-mono bg-red-900/40 text-red-400 hover:bg-red-900/70 border border-red-900/60 transition-colors"
          >
            Eliminar
          </button>
          <button
            onClick={onCancelDelete}
            className="px-3 py-1 rounded text-xs font-mono text-[#5a6478] hover:text-[#eef2f8] border border-[#1e2530] transition-colors"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 pt-3 border-t border-[#1e2530]">
          <button
            onClick={onLoad}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg font-mono text-xs font-bold transition-all active:scale-95"
            style={{ background: isActive ? '#00d4a820' : '#3d8eff20', color: isActive ? '#00d4a8' : '#3d8eff', border: `1px solid ${isActive ? '#00d4a840' : '#3d8eff40'}` }}
          >
            <Play size={11} /> {isActive ? 'Continuar' : 'Cargar'}
          </button>
          <button
            onClick={onExport}
            title="Exportar como archivo JSON"
            className="p-2 rounded-lg border border-[#1e2530] text-[#5a6478] hover:text-[#eef2f8] hover:border-[#3d8eff]/30 transition-colors"
          >
            <Download size={13} />
          </button>
          <button
            onClick={onAskDelete}
            title="Eliminar partida"
            className="p-2 rounded-lg border border-[#1e2530] text-[#5a6478] hover:text-red-400 hover:border-red-900/40 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </motion.div>
  );
}

// ─── IMPORT GAME MODAL ────────────────────────────────────────────────────────

type ImportState =
  | { stage: 'idle' }
  | { stage: 'error'; message: string }
  | { stage: 'preview'; run: ActiveRun; isDuplicate: boolean }
  | { stage: 'success'; charName: string };

function ImportGameModal({
  existingRunIds,
  onImport,
  onClose,
}: {
  existingRunIds: string[];
  onImport: (run: ActiveRun) => void;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ImportState>({ stage: 'idle' });

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.json')) {
      setState({ stage: 'error', message: 'El archivo debe ser de tipo JSON (.json).' });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string);

        // Support both direct ActiveRun and wrapped { run: ActiveRun } exports
        const runData = raw.run ?? raw;

        const validation = validateRunData(runData);
        if (!validation.valid) {
          setState({ stage: 'error', message: validation.reason! });
          return;
        }

        const migrated = migrateRun(runData);
        const isDuplicate = existingRunIds.includes(migrated.runId);
        setState({ stage: 'preview', run: migrated, isDuplicate });
      } catch {
        setState({ stage: 'error', message: 'Error al leer el archivo. Asegúrate de que es un JSON válido.' });
      }
    };
    reader.onerror = () => setState({ stage: 'error', message: 'No se pudo leer el archivo.' });
    reader.readAsText(file);
    // Reset input to allow re-selecting same file
    e.target.value = '';
  }, [existingRunIds]);

  const handleConfirmImport = (run: ActiveRun, asNew: boolean) => {
    const finalRun = asNew
      ? { ...run, runId: `imported-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }
      : run;
    onImport(finalRun);
    setState({ stage: 'success', charName: finalRun.character?.name || 'Personaje importado' });
    setTimeout(onClose, 2000);
  };

  return (
    <Modal onClose={onClose} wide>
      <div className="flex justify-between items-center mb-6">
        <div>
          <div className="font-mono text-xs text-[#3d8eff]/70 tracking-widest mb-1">SISTEMA DE PARTIDAS</div>
          <h2 className="font-display font-bold text-2xl text-[#eef2f8]">Importar Partida</h2>
        </div>
        <button onClick={onClose} className="text-[#5a6478] hover:text-[#eef2f8] transition-colors">
          <X size={20} />
        </button>
      </div>

      {state.stage === 'idle' && (
        <div className="text-center py-8">
          <div
            className="mx-auto w-20 h-20 rounded-2xl border-2 border-dashed border-[#1e2530] hover:border-[#3d8eff]/50 flex items-center justify-center cursor-pointer mb-4 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={28} className="text-[#3d8eff]/60" />
          </div>
          <p className="text-[#c8d0dc] text-sm mb-2">Selecciona un archivo de partida JSON</p>
          <p className="text-[#5a6478] text-xs mb-6">Soporta partidas de cualquier versión del motor</p>
          <button
            onClick={() => fileRef.current?.click()}
            className="px-6 py-3 rounded-xl font-mono text-sm font-bold transition-all active:scale-95"
            style={{ background: '#3d8eff20', color: '#3d8eff', border: '1px solid #3d8eff50' }}
          >
            <Upload size={14} className="inline mr-2" />
            Seleccionar archivo
          </button>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFile} />
        </div>
      )}

      {state.stage === 'error' && (
        <div className="py-6">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-red-950/30 border border-red-900/40 mb-6">
            <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-mono text-sm text-red-400 font-bold mb-1">Error al importar</p>
              <p className="text-[#c8d0dc] text-sm">{state.message}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => { setState({ stage: 'idle' }); fileRef.current?.click(); }}
              className="flex-1 py-2.5 rounded-xl font-mono text-sm transition-all active:scale-95"
              style={{ background: '#3d8eff20', color: '#3d8eff', border: '1px solid #3d8eff40' }}
            >
              Intentar con otro archivo
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl font-mono text-sm text-[#5a6478] hover:text-[#eef2f8] border border-[#1e2530] transition-colors"
            >
              Cancelar
            </button>
          </div>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFile} />
        </div>
      )}

      {state.stage === 'preview' && (
        <ImportPreview
          run={state.run}
          isDuplicate={state.isDuplicate}
          onConfirmOverwrite={() => handleConfirmImport(state.run, false)}
          onConfirmAsNew={() => handleConfirmImport(state.run, true)}
          onCancel={() => setState({ stage: 'idle' })}
        />
      )}

      {state.stage === 'success' && (
        <div className="text-center py-10">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-[#00d4a815] border border-[#00d4a840] mx-auto mb-4">
            <CheckCircle size={28} className="text-[#00d4a8]" />
          </div>
          <p className="font-display font-bold text-xl text-[#eef2f8] mb-2">Partida importada</p>
          <p className="text-[#5a6478] text-sm">
            La partida de <span className="text-[#c8d0dc]">{state.charName}</span> está disponible en "Cargar Partida".
          </p>
        </div>
      )}
    </Modal>
  );
}

function ImportPreview({
  run, isDuplicate, onConfirmOverwrite, onConfirmAsNew, onCancel,
}: {
  run: ActiveRun;
  isDuplicate: boolean;
  onConfirmOverwrite: () => void;
  onConfirmAsNew: () => void;
  onCancel: () => void;
}) {
  const char = run.character || {};
  const era = run.eraConfig || {};
  const eraLabel = era.eraLabel || era.eraName || era.name || 'Era desconocida';
  const savedDate = run.savedAt
    ? new Date(run.savedAt).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })
    : 'fecha desconocida';

  return (
    <div>
      <div className="rounded-xl border border-[#3d8eff]/30 bg-[#3d8eff]/5 p-4 mb-5">
        <div className="font-mono text-[10px] text-[#3d8eff]/70 tracking-widest mb-2">PARTIDA DETECTADA</div>
        <div className="flex items-baseline gap-2 mb-3">
          <span className="font-display font-bold text-[#eef2f8] text-xl">
            {char.name || 'Personaje sin nombre'}
          </span>
          {char.age != null && (
            <span className="font-mono text-sm text-[#5a6478]">{char.age} años</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs font-mono text-[#5a6478]">
          <span><Sword size={10} className="inline mr-1" />{eraLabel}</span>
          <span><BookOpen size={10} className="inline mr-1" />{run.turnCount ?? 0} turnos jugados</span>
          <span><Calendar size={10} className="inline mr-1" />Guardada: {savedDate}</span>
          {run.npcs?.length > 0 && <span>👥 {run.npcs.length} personajes conocidos</span>}
        </div>
        {run.memoriaNarrador?.resumen && (
          <p className="mt-3 text-xs text-[#5a6478] italic border-t border-[#1e2530] pt-3 leading-relaxed line-clamp-3">
            {run.memoriaNarrador.resumen}
          </p>
        )}
      </div>

      {isDuplicate && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-950/30 border border-amber-900/40 mb-4">
          <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-300 text-xs">
            Ya existe una partida con el mismo ID. Puedes sobrescribirla o importar como partida nueva independiente.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {isDuplicate ? (
          <>
            <button
              onClick={onConfirmOverwrite}
              className="w-full py-3 rounded-xl font-mono text-sm font-bold transition-all active:scale-95"
              style={{ background: '#3d8eff20', color: '#3d8eff', border: '1px solid #3d8eff50' }}
            >
              Sobrescribir partida existente
            </button>
            <button
              onClick={onConfirmAsNew}
              className="w-full py-3 rounded-xl font-mono text-sm font-bold transition-all active:scale-95"
              style={{ background: '#00d4a815', color: '#00d4a8', border: '1px solid #00d4a840' }}
            >
              Importar como partida nueva
            </button>
          </>
        ) : (
          <button
            onClick={onConfirmAsNew}
            className="w-full py-3 rounded-xl font-mono text-sm font-bold transition-all active:scale-95"
            style={{ background: '#3d8eff20', color: '#3d8eff', border: '1px solid #3d8eff50' }}
          >
            <Upload size={13} className="inline mr-2" />
            Confirmar importación
          </button>
        )}
        <button
          onClick={onCancel}
          className="w-full py-2.5 rounded-xl font-mono text-sm text-[#5a6478] hover:text-[#eef2f8] border border-[#1e2530] transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────

function Modal({ children, onClose, wide = false }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className={`bg-[#0f1218] border border-[#1e2530] rounded-2xl p-6 w-full ${wide ? 'max-w-xl' : 'max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function GameCard({
  id, name, tagline, status, gradient, accentColor, accentTeal,
  locked, hasActiveRun, activeRunId, onPlay, onContinue,
}: {
  id: string; name: string; tagline: string; status: string; gradient: string;
  accentColor: string; accentTeal?: string; locked?: boolean;
  hasActiveRun?: boolean; activeRunId?: string;
  onPlay: () => void; onContinue?: () => void;
}) {
  return (
    <motion.div
      whileHover={{ scale: locked ? 1 : 1.01, y: locked ? 0 : -2 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="relative rounded-2xl border overflow-hidden flex flex-col"
      style={{ borderColor: locked ? '#1e2530' : `${accentColor}30`, background: `linear-gradient(135deg, ${gradient.replace('from-', '').replace('via-', '').replace('to-', '').split(' ').join(', ')})` }}
    >
      <div className={`bg-gradient-to-br ${gradient} p-6 flex flex-col flex-1 min-h-[280px]`}>
        {hasActiveRun && (
          <div className="mb-4 px-3 py-1.5 rounded-lg text-xs font-mono font-bold tracking-widest text-center"
            style={{ background: `${accentTeal}20`, color: accentTeal, border: `1px solid ${accentTeal}40` }}>
            ▶ PARTIDA ACTIVA — CONTINUAR
          </div>
        )}
        <div className="flex justify-between items-start mb-4">
          <div className="font-mono text-[10px] tracking-widest px-2 py-1 rounded"
            style={{ color: locked ? '#5a6478' : accentColor, background: locked ? '#1e253010' : `${accentColor}15`, border: `1px solid ${locked ? '#1e2530' : accentColor + '30'}` }}>
            {status}
          </div>
          {locked && <Lock size={14} className="text-[#5a6478]" />}
        </div>
        <div className="flex-1">
          <h3 className="font-display font-extrabold text-3xl mb-3 tracking-tight"
            style={{ color: locked ? '#5a6478' : '#eef2f8' }}>
            {name}
          </h3>
          <p className="font-serif italic text-sm leading-relaxed"
            style={{ color: locked ? '#5a6478' : '#c8d0dc' }}>
            {tagline}
          </p>
        </div>
        <div className="mt-6 flex gap-2">
          {hasActiveRun && onContinue ? (
            <>
              <button
                onClick={onContinue}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-mono text-sm font-bold transition-all active:scale-95"
                style={{ background: `${accentTeal}20`, color: accentTeal, border: `1px solid ${accentTeal}50` }}
              >
                <Play size={14} /> Continuar
              </button>
              <button
                onClick={onPlay}
                className="px-4 py-3 rounded-lg font-mono text-xs transition-all active:scale-95"
                style={{ background: '#1e253050', color: '#5a6478', border: '1px solid #1e2530' }}
              >
                Nueva
              </button>
            </>
          ) : (
            <button
              onClick={onPlay}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-mono text-sm font-bold transition-all active:scale-95"
              style={{
                background: locked ? '#1e253030' : `${accentColor}20`,
                color: locked ? '#5a6478' : accentColor,
                border: `1px solid ${locked ? '#1e2530' : accentColor + '50'}`,
              }}
            >
              {locked ? <><Lock size={14} /> Próximamente</> : <><ChevronRight size={14} /> Jugar</>}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function ActionButton({ icon, label, onClick, accent, disabled }: {
  icon: React.ReactNode; label: string; onClick: () => void; accent: string; disabled?: boolean;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-mono text-xs border transition-all active:scale-95 backdrop-blur-sm ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:scale-[1.02]'}`}
      style={{
        color: disabled ? '#5a6478' : accent,
        borderColor: disabled ? '#1e2530' : `${accent}40`,
        background: disabled ? '#0f121830' : `${accent}15`,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function NavButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-mono text-xs text-[#c8d0dc] hover:text-[#eef2f8] border border-[#1e2530] hover:border-[#3d8eff]/30 bg-[#0f1218]/80 hover:bg-[#141820] transition-all active:scale-95 backdrop-blur-sm"
    >
      {icon}
      {label}
    </button>
  );
}
