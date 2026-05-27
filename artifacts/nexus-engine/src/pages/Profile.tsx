import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Target, Clock, Skull, Image as ImageIcon, Trophy, ChevronDown, ChevronRight } from 'lucide-react';
import { useEngineStore } from '@/store/engine-store';

export default function Profile() {
  const [, setLocation] = useLocation();
  const { pastRuns, achievements } = useEngineStore();
  const [activeTab, setActiveTab] = useState<'history' | 'legacy' | 'moments' | 'achievements'>('history');
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  const totalYears = pastRuns.reduce((acc, r) => acc + (r.character?.age || 0), 0);
  const allMoments = pastRuns.flatMap((r) => r.moments || []);

  const tabs = [
    { id: 'history', label: 'Historial' },
    { id: 'legacy', label: 'Árbol de Legado' },
    { id: 'moments', label: 'Momentos' },
    { id: 'achievements', label: 'Logros' },
  ] as const;

  return (
    <div className="min-h-screen bg-[#0a0c0f] text-[#eef2f8]">
      <div className="max-w-5xl mx-auto px-4 py-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <button onClick={() => setLocation('/')} className="flex items-center gap-2 text-[#5a6478] hover:text-[#eef2f8] font-mono text-sm mb-8 transition-colors">
            <ArrowLeft size={16} /> Volver
          </button>

          <div className="mb-10">
            <h1 className="font-display font-bold text-4xl mb-1">Perfil</h1>
            <p className="font-mono text-xs text-[#5a6478] tracking-widest">LEGADO Y ESTADÍSTICAS</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            <StatCard icon={<Target size={16} className="text-[#3d8eff]" />} label="Partidas" value={pastRuns.length} />
            <StatCard icon={<Clock size={16} className="text-[#00d4a8]" />} label="Años vividos" value={totalYears} />
            <StatCard icon={<Skull size={16} className="text-[#ff4444]" />} label="Muertes" value={pastRuns.filter((r) => r.endCause).length} />
            <StatCard icon={<Trophy size={16} className="text-[#f5a623]" />} label="Logros" value={achievements.length} />
          </div>

          <div className="flex border-b border-[#1e2530] mb-8 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-6 py-3 font-mono text-xs tracking-widest whitespace-nowrap transition-colors border-b-2 ${
                  activeTab === t.id
                    ? 'border-[#3d8eff] text-[#3d8eff]'
                    : 'border-transparent text-[#5a6478] hover:text-[#c8d0dc]'
                }`}
              >
                {t.label.toUpperCase()}
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
            >
              {activeTab === 'history' && (
                <div className="space-y-4">
                  {pastRuns.length === 0 ? (
                    <EmptyState message="Ninguna partida completada aún." />
                  ) : (
                    pastRuns.map((run) => (
                      <div key={run.runId} className="rounded-xl border border-[#1e2530] bg-[#0f1218] overflow-hidden">
                        <button
                          onClick={() => setExpandedRun(expandedRun === run.runId ? null : run.runId)}
                          className="w-full flex items-start gap-4 p-6 text-left hover:bg-[#141820] transition-colors"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="font-serif text-lg text-[#eef2f8]">{run.character?.name || 'Desconocido'}</h3>
                              <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#141820] border border-[#1e2530] text-[#5a6478]">
                                {run.gameId?.toUpperCase() || 'UNA VIDA'}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-4 font-mono text-xs text-[#5a6478]">
                              {run.eraConfig?.year && <span>Año {run.eraConfig.year}</span>}
                              {run.character?.age && <span>Vivió {run.character.age} años</span>}
                              {run.endCause && <span className="text-[#ff4444]">Fin: {run.endCause}</span>}
                              {run.endedAt && <span>{new Date(run.endedAt).toLocaleDateString('es-ES')}</span>}
                              {run.turnCount !== undefined && <span>{run.turnCount} turnos</span>}
                            </div>
                          </div>
                          {expandedRun === run.runId ? <ChevronDown size={16} className="text-[#5a6478] mt-1" /> : <ChevronRight size={16} className="text-[#5a6478] mt-1" />}
                        </button>
                        <AnimatePresence>
                          {expandedRun === run.runId && run.summary && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="px-6 pb-6 border-t border-[#1e2530]">
                                <p className="font-serif italic text-[#c8d0dc] leading-relaxed mt-4 border-l-2 border-[#3d8eff]/30 pl-4">
                                  "{run.summary}"
                                </p>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'legacy' && (
                <div>
                  {pastRuns.length === 0 ? (
                    <EmptyState message="Completa tu primera partida para comenzar el árbol de legado." />
                  ) : (
                    <LegacyTree runs={pastRuns} />
                  )}
                </div>
              )}

              {activeTab === 'moments' && (
                <div>
                  {allMoments.length === 0 ? (
                    <EmptyState message="Los momentos cinematográficos de tus partidas aparecerán aquí." />
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {allMoments.map((m, i) => (
                        <motion.div
                          key={i}
                          whileHover={{ scale: 1.02 }}
                          className="aspect-square rounded-xl overflow-hidden border border-[#1e2530] relative group cursor-pointer"
                        >
                          <img
                            src={m.imageUrl}
                            alt="Momento"
                            className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                            <div className="font-mono text-[10px] text-[#3d8eff]">{m.date}</div>
                            <div className="font-serif text-xs text-[#eef2f8] line-clamp-2">{m.context}</div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'achievements' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {achievements.length === 0 ? (
                    <div className="col-span-2">
                      <EmptyState message="Los logros se descubren, no se persiguen. Aparecerán aquí cuando ocurran." />
                    </div>
                  ) : (
                    achievements.map((a) => (
                      <div key={a.id} className="p-5 rounded-xl border border-[#f5a623]/20 bg-[#f5a623]/5">
                        <div className="flex items-start gap-3">
                          <Trophy size={20} className="text-[#f5a623] flex-shrink-0 mt-0.5" />
                          <div>
                            <h3 className="font-mono text-sm font-bold text-[#eef2f8] mb-1">{a.name}</h3>
                            <p className="font-serif text-xs italic text-[#c8d0dc]">{a.description}</p>
                            <div className="font-mono text-[10px] text-[#5a6478] mt-2">{a.unlockedAt}</div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  {Array.from({ length: Math.max(0, 6 - achievements.length) }).map((_, i) => (
                    <div key={'locked-' + i} className="p-5 rounded-xl border border-[#1e2530] bg-[#0f1218]">
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded bg-[#141820] border border-[#1e2530]" />
                        <div className="font-mono text-sm text-[#1e2530]">???</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}

const ERA_COLORS: Record<string, string> = {
  medieval: '#f5a623', modern: '#3d8eff', ancient: '#00d4a8',
  futuristic: '#8b5cf6', industrial: '#6b7280',
};

function getEraColor(year: number | undefined): string {
  if (!year) return '#3d8eff';
  if (year < 500) return '#00d4a8';
  if (year < 1400) return '#f5a623';
  if (year < 1800) return '#c8d0dc';
  if (year < 2000) return '#6b7280';
  return '#8b5cf6';
}

function LegacyTree({ runs }: { runs: any[] }) {
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);

  if (runs.length === 1) {
    const run = runs[0];
    const color = getEraColor(run.eraConfig?.year);
    return (
      <div className="text-center py-8">
        <div className="inline-block">
          <div className="w-32 h-32 rounded-full border-2 mx-auto flex flex-col items-center justify-center mb-4 relative"
            style={{ borderColor: color + '60', background: color + '10' }}>
            <div className="font-mono text-[10px] text-[#5a6478] mb-1">R1</div>
            <div className="font-serif text-base text-[#eef2f8] leading-tight px-2 text-center">{run.character?.name || '?'}</div>
            <div className="font-mono text-[9px] mt-1" style={{ color }}>{run.eraConfig?.year || ''}</div>
          </div>
          <div className="font-mono text-[10px] text-[#5a6478] text-center">Primera vida registrada</div>
        </div>
        <p className="font-serif italic text-[#5a6478] text-sm mt-6">
          Cada vida que vivas añadirá un nodo a este árbol. Los ecos del pasado se entrelazan.
        </p>
      </div>
    );
  }

  const nodeW = 120;
  const nodeH = 80;
  const colGap = 160;
  const rowGap = 110;
  const cols = Math.min(4, runs.length);
  const rows = Math.ceil(runs.length / cols);
  const svgW = cols * colGap + 40;
  const svgH = rows * rowGap + nodeH + 20;

  const getPos = (i: number) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return { x: col * colGap + colGap / 2, y: row * rowGap + nodeH / 2 + 20 };
  };

  return (
    <div>
      <div className="font-mono text-[10px] text-[#5a6478] mb-4 tracking-widest">ÁRBOL DE LEGADO — {runs.length} VIDAS</div>
      <div className="overflow-x-auto">
        <svg width={svgW} height={svgH} className="block mx-auto" style={{ maxWidth: '100%' }}>
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {runs.slice(0, -1).map((run, i) => {
            const from = getPos(i);
            const to = getPos(i + 1);
            const color = getEraColor(run.eraConfig?.year);
            return (
              <line key={`link-${i}`}
                x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                stroke={color + '40'} strokeWidth="1.5" strokeDasharray="4 3"
              />
            );
          })}

          {runs.map((run, i) => {
            const { x, y } = getPos(i);
            const color = getEraColor(run.eraConfig?.year);
            const isHovered = hoveredId === run.runId;
            const age = run.character?.age ?? 0;
            const r = 28 + Math.min(age / 5, 12);
            return (
              <g key={run.runId}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredId(run.runId)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <circle cx={x} cy={y} r={r + 6} fill={color + '08'} />
                <circle cx={x} cy={y} r={r}
                  fill="#0f1218"
                  stroke={color + (isHovered ? 'cc' : '50')}
                  strokeWidth={isHovered ? 2 : 1.5}
                  filter={isHovered ? 'url(#glow)' : undefined}
                />
                <text x={x} y={y - 6} textAnchor="middle" fill="#5a6478" fontSize="8" fontFamily="IBM Plex Mono">
                  R{i + 1}
                </text>
                <text x={x} y={y + 7} textAnchor="middle" fill="#eef2f8" fontSize="9" fontFamily="Lora, serif" fontStyle="italic">
                  {(run.character?.name || '?').slice(0, 10)}
                </text>
                <text x={x} y={y + 19} textAnchor="middle" fill={color} fontSize="8" fontFamily="IBM Plex Mono">
                  {run.eraConfig?.year || ''}
                </text>
                {isHovered && (
                  <>
                    <rect x={x - 60} y={y + r + 8} width="120" height="36" rx="4" fill="#0f1218" stroke="#1e2530" strokeWidth="1" />
                    <text x={x} y={y + r + 20} textAnchor="middle" fill="#c8d0dc" fontSize="8" fontFamily="Lora, serif" fontStyle="italic">
                      {run.character?.name || 'Desconocido'}
                    </text>
                    <text x={x} y={y + r + 31} textAnchor="middle" fill="#5a6478" fontSize="7" fontFamily="IBM Plex Mono">
                      {age > 0 ? `${age} años` : ''} {run.endCause ? `· ${run.endCause}` : ''}
                    </text>
                    <text x={x} y={y + r + 41} textAnchor="middle" fill="#5a6478" fontSize="7" fontFamily="IBM Plex Mono">
                      {run.turnCount || 0} turnos
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="font-serif italic text-[#5a6478] text-sm text-center mt-6">
        Los ecos del pasado emergen en las vidas futuras como textura narrativa invisible.
      </p>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="p-5 rounded-xl border border-[#1e2530] bg-[#0f1218] flex items-center gap-3">
      <div className="p-2 rounded-lg bg-[#141820] border border-[#1e2530]">{icon}</div>
      <div>
        <div className="font-mono text-xs text-[#5a6478] mb-0.5">{label}</div>
        <div className="font-display font-bold text-2xl text-[#eef2f8]">{value}</div>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-16 border border-dashed border-[#1e2530] rounded-xl">
      <p className="font-serif italic text-[#5a6478]">{message}</p>
    </div>
  );
}
