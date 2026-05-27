# NEXUS ENGINE

## Overview

NEXUS ENGINE is a full-stack procedural narrative game engine PWA. It uses selectable AI narration providers (Google Gemini and Anthropic Claude via Replit integrations) to tell the story of any life, in any era, with no objectives — pure open-ended existence simulation.

**Current game: "A Life"** — Live any life, in any era, on Earth.

**Version: v5.5 (Dual AI Providers)** — Current corrections add Gemini + Anthropic coexistence, independent per-game provider selection, and provider-aware narrative/state/assist routes:

1. **Dual Provider Dispatch**: Backend AI calls now route through `artifacts/api-server/src/aiProviders.ts`, preserving Gemini while adding Anthropic Claude. Narration, state update, dreams, manual correction, suggestions, memory, summaries, and assist endpoints accept `aiProvider`.

2. **Per-Game Provider Persistence**: `ActiveRun.aiProvider` stores the selected provider for each game. New games inherit the global setting, old saves migrate to a default provider, and the in-game editor changes only the active run.

3. **Provider Selectors**: Main Settings → "Estado de APIs" exposes the global default selector. The in-game Editor panel exposes a separate "IA" tab for switching the active game's provider.

**Previous version: v5.4 (State Rewrite + Custom Sections)** — Added full-state AI snapshots, manual correction improvements, and scoped custom sections:

1. **Full State Rewrite Support**: Narrative and manual state-update responses can now include `fullStateSnapshot`/`stateSnapshot`/`fullState`. The frontend applies complete snapshots while preserving backwards-compatible delta fields, including date/time, character age, NPCs, factions, inventory, consequences, attributes, descriptors, skills, and custom sections.

2. **Scoped Custom Sections**: `CustomSectionsPanel` now supports scopes (`global`, `character`, `world`, `map`, `npcs`, `factions`, `narration`), compact panel embedding, icons, field types, and AI-managed/manual field flags. Custom sections are visible in the main custom tab and embedded in character, world, map, NPC, faction, and narration views.

3. **Manual State Update Improvements**: The "Actualizar Estado" panel now includes Mapa, Fecha/Tiempo, and Secciones personalizadas, and can execute manual instructions without requiring selected sections. The backend prompt explicitly maps section choices to state fields and returns custom section updates plus full-state snapshots.

**Previous version: v5.3 (Save System + Context Refactor)** — Two major features added:

1. **Save/Load/Import System**: Main menu now has "Importar Partida" and "Cargar Partida" buttons. Games auto-save to a local library (`savedGames` in Zustand store, persisted to localStorage, max 20 slots) after each narrative turn. "Cargar Partida" shows a full list with character name, era, turn count, last save date, and a narrative snippet. Each save can be loaded, exported as JSON, or deleted. "Importar Partida" reads any JSON file, validates it, runs it through `migrateRun()` (fills all missing fields with coherent defaults), shows a preview, handles duplicates (overwrite or import as new), and confirms import. New migration utility: `artifacts/nexus-engine/src/engine/migration.ts`.

2. **AI Context Refactor (Two-Call System)**: `/generate` and `/stream` endpoints now make two sequential AI calls instead of one. Call 1: narration only (no JSON, no META). Call 2: state update only (compact state + narrative as "recent event" → JSON). `RECENT_TURNS_LIMIT=7`, `MAX_NPCS_IN_CONTEXT=20`, `MAX_FACCIONES_IN_CONTEXT=12` constants enforced on the backend. Frontend slice standardized to `-7` in all three call sites. Legacy `buildSystemPrompt`/`buildUserPrompt` retained for the `/state-update` endpoint (manual corrections).

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 20
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec in `lib/api-spec/openapi.yaml`)
- **Build**: esbuild (CJS bundle for server, Vite for frontend)
- **Frontend**: React + Vite + Tailwind CSS v4
- **State**: Zustand (persisted in localStorage)
- **AI**: Dual selectable Replit AI integrations (no API key required — billed to Replit credits)
  - Narration: `gemini-3-flash-preview` (literary quality, streaming)
  - State/JSON/Assist: `gemini-2.5-flash` (fast, cheap, structured output)
  - Client: `@google/genai` SDK in `artifacts/api-server/src/gemini.ts`
  - Anthropic narration: `claude-sonnet-4-6`
  - Anthropic state/JSON/assist: `claude-haiku-4-5`
  - Provider dispatch: `artifacts/api-server/src/aiProviders.ts`
- **Fonts**: Syne (headers/display), Lora (narrative body), IBM Plex Mono (UI/stats)

## Structure

```
artifacts-monorepo/
├── artifacts/
│   ├── api-server/           # Express API server (port 8080)
│   │   └── src/routes/       # players, runs, events, narrative, legacy, moments, achievements, maps
│   ├── nexus-engine/         # React+Vite PWA frontend (proxies /api/ → 8080)
│   │   └── src/
│   │       ├── pages/        # Home, NewRun, Game, Profile, Editor
│   │       ├── components/   # Layout, UI (shadcn-based + custom)
│   │       └── store/        # Zustand engine-store (playerId, runId, voice, explicitMode)
│   └── mockup-sandbox/       # Component preview server (canvas prototyping)
├── lib/
│   ├── api-spec/             # OpenAPI spec + Orval codegen config
│   ├── api-client-react/     # Generated React Query hooks + custom-fetch
│   ├── api-zod/              # Generated Zod schemas from OpenAPI
│   ├── db/                   # Drizzle ORM schema + DB connection
│   └── integrations-anthropic-ai/  # Claude AI integration helper
└── scripts/                  # Utility scripts
```

## Database Tables

- `players` — player accounts with settings, totalRuns, totalPlaytimeMinutes
- `runs` — individual gameplay runs with eraConfig, character, status, endCause
- `run_events` — narrative events with legacyWeight, eventType, mood
- `legacy_echoes` — cross-run memory fragments (core feature: echoes surface in future runs)
- `moments` — special captured moments (image snapshots of pivotal events)
- `achievements` — player achievements
- `world_maps` — procedurally generated map data per run

## API Routes

All routes under `/api/`:
- `GET /healthz` — health check
- `POST|GET|PATCH /players` — player management
- `GET /players/:id/stats` — player stats (totalRuns, totalInGameYears, deathsByCause)
- `GET /players/:id/runs` — all runs for a player
- `GET /players/:id/moments` — all moments for a player
- `POST|GET|PATCH /runs` — run management
- `POST /runs/:id/end` — end a run, triggers legacy echo processing
- `POST /narrative/generate` — Claude AI narration (returns JSON with narrative, eventType, legacyWeight, mood, characterStatChanges)
- `POST /narrative/summarize-run` — generate end-of-run epitaph via Claude
- `POST /events` / `GET /events/run/:id` — run event CRUD
- `POST /legacy/process` — extract legacy echoes from run events
- `POST /legacy/resolve-echoes` — surface legacy echoes into current narration
- `GET /legacy/echoes/:playerId` — get player's echo library
- `POST /moments` / `GET /moments/:id` — moment CRUD
- `POST /achievements/unlock` — unlock achievement
- `GET /achievements/:playerId` — player achievements
- `GET /maps/:runId` / `POST /maps` / `PATCH /maps/:id` — world map CRUD

## v4.2 Features (SAD — Sistema de Atributos Realistas)

### Realistic Attributes System (SAD v4.2)
- **4 Vital Dimensions** (dynamic state): `integridadFisica`, `reservaMetabolica`, `cargaCognitiva`, `umbralDeEstres`
- **4 Competence Profiles** (base capabilities): `aptitudMotriz`, `intelectoAplicado`, `presenciaSocial`, `estatusDeCasta`
- **Era Skills**: `eraSkills[]` with `GradoDeAutonomia` (Nulo/Aprendiz/Competente/Maestro)
- All stored in `ActiveRun.realisticAttributes`, initialized by `deriveInitialAttributes(socialClass)` in `types.ts`
- Tutorial texts stored in `ATTRIBUTE_TUTORIALS` constant — each attribute has a ℹ️ expandable tooltip in the character panel
- Narrative AI applies these attributes to narration and returns `attributeUpdates` in META JSON

### Dual Reputation Matrix
- `reputacionLocal` — perception in immediate environment (existing, but now visible in character panel)
- `renombreGlobal` — global fame beyond local environment (NEW field in `CharacterDescriptors`)
- Both updated by narrative AI via `descriptorUpdates` in META JSON response

### 10-Tab Character Panel
0. Identidad — basic character info
1. **Atributos** (NEW) — 4 vital dimensions + 4 competence profiles, each with ℹ️ tutorial expandable tooltip
2. Descriptores — updated with `renombreGlobal` displayed prominently
3. Inventario
4. Habilidades — includes era skills with Grado de Autonomía
5. Relaciones
6. Historia
7. Salud — character stat bars
8. Psicología — emotional climate + inner voice log
9. Legado — consequence queue + significant moments

### Temporal Advance Protocol
- "⏩ AVANZAR" button in game header — NOW UNLOCKED FROM AGE 0 (no age restriction)
- Time Advance Modal with options: 1, 3, 5, 10, 15, 20 years + contextual "Hasta adulto" / "Hasta los 30"
- AI generates 600+ word narrative covering the full jumped period
- Attributes, reputation, NPCs, and world state all updated during the jump
- Turn registered as `eventType: "time_jump"`

### 8-Panel Sidebar (Complete Implementation)
1. **PERSONAJE** — 10-tab CharacterPanel (Identidad, Atributos, Descriptores, Inventario, Habilidades, Relaciones, Historia, Salud, Psicología, Legado)
2. **MUNDO** — World state with season/weather icons, location card, active conflicts, explored locations list, era rules
3. **MAPA** — Procedural canvas + terrain legend + current position + visited locations list  
4. **NPCs** — Expandable NPC cards with filter tabs (todos/vivo/muerto/desaparecido), trust bars, key moments, known inventory, secrets
5. **FACCIONES** (NEW) — Faction tracking: type/relation/influence/reputation bars, +10/-10 rep buttons, add-faction form with full fields
6. **EDITOR** — Narrative voice selector, explicit mode toggles, other perspectives
7. **GUARDADO** — Save button + game stats + "Terminar partida" with confirmation + archived past runs
8. **MEMORIA IA** (NEW) — Notes to narrator + game rules + canonical facts list (all injected into every AI prompt)

### New Types in types.ts
- `Faccion` interface — id, name, type, description, relationToPlayer, influenceLevel, knownMembers, knownGoals, playerReputation, discoveredAt
- `MemoriaNarrador` interface — notasLibres, reglasDeLaPartida, hechosCanonicos[]
- `ActiveRun` extended with: `facciones: Faccion[]`, `memoriaNarrador: MemoriaNarrador`, `exploredLocations: Array<{name, description, visitedAt}>`

### Store Changes
- Persistence key: `nexus-engine-v4` (upgraded from v3 — old saves incompatible)
- New actions: `updateRealisticAttributes(partial)`, `updateDescriptors(partial)`, `addFaccion(faccion)`, `updateFaccion(id, partial)`, `updateMemoriaNarrador(partial)`, `addExploredLocation(loc)`
- `addExploredLocation` auto-deduplicates by name

### Narrative API Changes
- `POST /narrative/generate` and `/narrative/stream` now accept:
  - `realisticAttributes` — affects narration tone and available actions
  - `descriptors` — reputation/social state included in character context
  - `isTimeJump: boolean` — triggers 600+ word time jump protocol
  - `timeJumpYears: number` — years to cover
  - `memoriaNarrador` — player-defined rules/notes/canon facts injected with max priority
- Response now includes `attributeUpdates` and `descriptorUpdates` objects
- New location tracking: when `worldStateUpdates.currentLocation` changes, it's auto-added to `exploredLocations`

## Key Design Decisions

- **Legacy Echoes**: Cross-run memories surface naturally in narration without being explicitly announced. Claude is instructed to weave them in organically.
- **No Objectives**: "A Life" has no win/fail conditions. Claude narrates consequence, not success/failure.
- **AI Provider**: Player can choose Gemini or Claude globally in Settings and per game in the in-game Editor. Each provider uses its own quota/budget.
- **Narrative Voice**: Player can choose from literary, omniscient, immersive, stark — affects the selected AI provider's system prompt style.
- **Engine-agnostic**: Game-specific config (name, rules, tone) is passed per-request, not hardcoded in engine code.
- **Player ID**: Stored in Zustand persisted store (localStorage). Created automatically on first visit.
- **Proxy**: Vite dev server proxies `/api/*` → `http://localhost:8080`. This makes API calls work transparently from the browser.
- **Explicit Mode**: Zustand store has `explicitMode` flag for mature content (not yet wired to narrative API).

## Frontend Pages

- **Home (`/`)**: Dark atmospheric hero with "A LIFE" title, Start New Life / Continue / Legacy / Settings
- **NewRun (`/new-run`)**: 7-step character creator (Era & World, Identity, Appearance, Personality, Skills, Beliefs, Review)
- **Game (`/game/:runId`)**: Three-panel layout — left stats sidebar, center narrative scroll + input, right procedural map canvas
- **Profile (`/profile`)**: Legacy & history — stat cards (runs, years, deaths), chronicles list, moments gallery
- **Editor (`/editor/:runId`)**: Run editor / settings (scaffold)

## Color Palette

- Background: `#0a0c0f` (220 40% 4%)
- Accent Blue: `#3d8eff` (215 100% 62%)
- Accent Teal: `#00d4a8` (167 100% 42%)
- Accent Amber: `#f5a623` (38 92% 55%)
- Destructive: `#ff4444`

## PWA

- `public/manifest.json` — PWA manifest (standalone, dark theme)
- Apple web app meta tags configured
- OG tags for sharing

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string (Replit managed)
- `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` — Anthropic proxy URL (auto-set by Replit integration)
- `AI_INTEGRATIONS_ANTHROPIC_API_KEY` — Anthropic API key (auto-set by Replit integration)
- `PORT` — assigned per-artifact by Replit
- `BASE_PATH` — URL base path, passed to Vite `base` config

## Workflows

- `Start application` — `bash start.sh`
  - Starts API server with `PORT=8080 pnpm --filter @workspace/api-server run dev`
  - Starts frontend with `PORT=5000 BASE_PATH=/ pnpm --filter @workspace/nexus-engine run dev`
- Frontend dev server binds to `0.0.0.0:5000` and allows all hosts for Replit preview proxy support.
- `artifacts/mockup-sandbox: Component Preview Server` — component preview server

## Deployment

- Target: autoscale
- Build: `pnpm --filter @workspace/nexus-engine run build && pnpm --filter @workspace/api-server run build`
- Run: `pnpm --filter @workspace/db run push && node artifacts/api-server/dist/index.cjs`
- In production, the Express API server serves the built frontend from `artifacts/nexus-engine/dist/public` and handles SPA fallback.

## Codegen

To regenerate the API client after changing `lib/api-spec/openapi.yaml`:
```
pnpm --filter @workspace/api-spec run generate
```
