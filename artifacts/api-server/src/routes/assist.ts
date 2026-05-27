import { Router, type IRouter } from "express";
import { generateWithProvider, resolveAIProvider, isProviderBudgetExceeded, type AIProvider } from "../aiProviders";

const router: IRouter = Router();

function budgetExceededResponse(provider: AIProvider): object {
  const providerName = provider === "anthropic" ? "Anthropic (Claude)" : "Google Gemini";
  const otherProvider = provider === "anthropic" ? "Gemini" : "Claude";
  return {
    error: "BUDGET_EXCEEDED",
    provider,
    otherProvider: provider === "anthropic" ? "gemini" : "anthropic",
    message: `El límite de uso de ${providerName} se ha agotado. Cambia al proveedor ${otherProvider} desde el Editor (pestaña IA) o desde Configuración.`,
  };
}

router.post("/", async (req, res) => {
  const provider = resolveAIProvider(req.body?.aiProvider || req.body?.context?.aiProvider);
  try {
    const { type, context } = req.body;
    if (!type) return res.status(400).json({ error: "type required" });

    let prompt = "";
    const systemPrompt = "You are a NEXUS ENGINE assistant. Respond only with the requested content in JSON format.";

    switch (type) {
      case "suggest_names": {
        const { gender, year, region } = context || {};
        const eraDesc = year ? `the year ${year}` : "an unspecified era";
        prompt = `Suggest 3 historically appropriate given names for a ${gender || "person"} born in ${eraDesc}${region ? ` in ${region}` : ""}. 
Return JSON: { "names": ["Name1", "Name2", "Name3"] }
Names must be period-appropriate, not modern.`;
        break;
      }
      case "generate_world_context": {
        const { year, eraLabel, worldRules } = context || {};
        prompt = `Write an atmospheric 2-3 sentence description of what the world looks like in the year ${year || "unknown"} (${eraLabel || ""}). 
Rules active: ${JSON.stringify(worldRules || {})}.
Make it evocative, specific, and historically grounded.
Return JSON: { "context": "..." }`;
        break;
      }
      case "generate_appearance": {
        const { year, socialClass, gender, era } = context || {};
        prompt = `Generate a complete physical appearance for a ${gender || "person"} of ${socialClass || "common"} class born in ${year || "unknown"} (${era || ""}).
Return JSON:
{
  "height": "Promedio",
  "build": "Atlético",
  "skin": "Morena clara",
  "hair": "Cabello negro corto, ondulado",
  "eyes": "Marrones",
  "features": ["Cicatriz", "Manos callosas"],
  "description": "Optional free text description"
}
Use era-appropriate descriptors. For the "features" array, use 1-3 distinctive features from real period characteristics.`;
        break;
      }
      case "generate_personality": {
        const { year, socialClass, gender, positiveTraits, negativeTraits } = context || {};
        prompt = `Generate personality traits for a ${gender || "person"} of ${socialClass || "common"} class in the year ${year || "unknown"}.
Return JSON:
{
  "positive": ["Trait1", "Trait2", "Trait3"],
  "negative": ["Trait1", "Trait2"],
  "values": ["Value1", "Value2"],
  "fears": ["Fear1", "Fear2", "Fear3"],
  "motivation": "A 1-2 sentence motivation description",
  "quirks": "A 1-2 sentence description of personal habits or quirks"
}
Use traits from: Valiente, Curioso, Compasivo, Leal, Alegre, Honesto, Creativo, Paciente, Generoso, Resiliente, Carismático, etc.
Use fears from: Muerte, Abandono, Fracaso, Enfermedad, Pobreza, Soledad, Traición, Deshonra, etc.`;
        break;
      }
      case "suggest_hair": {
        const { year, gender, socialClass } = context || {};
        prompt = `Suggest an era-appropriate hair description for a ${gender || "person"} of ${socialClass || "common"} class in the year ${year || "unknown"}.
Return JSON: { "hair": "brief hair description" }`;
        break;
      }
      case "suggest_motivation": {
        const { year, socialClass, gender, traits } = context || {};
        prompt = `Suggest a motivation for a ${gender || "person"} of ${socialClass || "common"} class in the year ${year || "unknown"} with traits: ${(traits || []).join(', ')}.
Return JSON: { "motivation": "A 1-2 sentence motivation description that is era-appropriate" }`;
        break;
      }
      case "suggest_quirks": {
        const { year, socialClass, traits } = context || {};
        prompt = `Suggest personal quirks/habits for a person of ${socialClass || "common"} class in the year ${year || "unknown"} with traits: ${(traits || []).join(', ')}.
Return JSON: { "quirks": "A 1-2 sentence description of personal habits or quirks" }`;
        break;
      }
      case "generate_origin_story": {
        const { character, year, socialClass, gender, skills, traits } = context || {};
        prompt = `Write an origin story for a character with these attributes:
Name: ${character?.name || "Unknown"}
Gender: ${gender || "unspecified"}, Social class: ${socialClass || "common"}
Year: ${year || "unknown"}
Skills: ${(skills || []).join(', ')}
Traits: ${(traits || []).join(', ')}

Write 2-3 paragraphs in Spanish describing their early life, formative experiences, and what shaped them. Be specific and era-appropriate.
Return JSON: { "story": "..." }`;
        break;
      }
      case "suggest_beliefs": {
        const { year, socialClass, region, worldRules } = context || {};
        prompt = `Suggest historically appropriate beliefs for a person of ${socialClass || "common"} class in the year ${year || "unknown"}${region ? ` in ${region}` : ""}.
Return JSON:
{
  "religion": "The dominant religious belief",
  "philosophy": "A philosophical orientation from: Estoicismo, Epicureísmo, Fatalismo, Pragmatismo, Idealismo, Nihilismo, Humanismo, etc.",
  "politics": "A political stance appropriate to the era",
  "note": "A brief note explaining why these beliefs fit this person's context"
}`;
        break;
      }
      case "generate_presentation": {
        const { character, year, socialClass, gender, traits, skills, worldContext } = context || {};
        prompt = `Write an atmospheric narrative paragraph (minimum 150 words) in Spanish introducing this character and their world.
Character: ${character?.name || "Unknown"}, ${gender || ""}, ${socialClass || "common"} class, born in ${year || "unknown"}
Positive traits: ${(traits?.positive || []).join(', ')}
Negative traits: ${(traits?.negative || []).join(', ')}
Skills: ${(skills || []).join(', ')}
World context: ${worldContext || ""}

Write in second person present ("Eres..."). Make it cinematic and atmospheric.
Return JSON: { "presentation": "..." }`;
        break;
      }
      case "complete_world": {
        const { world } = context || {};
        prompt = `Complete this world configuration for a narrative game. Fill any empty or sparse fields coherently based on what's already defined:
${JSON.stringify(world, null, 2)}

Return JSON with the same structure but with all fields filled in coherently and with narrative richness. Keep existing values, only fill empty ones.`;
        break;
      }
      case "generate_full_world": {
        const { name, concept } = context || {};
        prompt = `Generate a complete world for a narrative life simulation game.
World name: "${name || "Untitled World"}"
Core concept: "${concept || "A historically-grounded world"}"

Return JSON:
{
  "geography": "Description of terrain, climate, notable features",
  "techLevel": "Technology level descriptor",
  "politicalSystem": "Political system in place",
  "religion": "Religious landscape",
  "economy": "Economic system and currency",
  "languages": "Languages and cultural notes",
  "fauna": "Notable animals and plants",
  "specialRules": { "magic": false, "magicType": null, "customRules": [] },
  "dangerLevel": 5,
  "predefinedEvents": [{"year": 0, "description": "Event that will occur"}],
  "freeNotes": "Additional world flavor"
}`;
        break;
      }
      case "suggest_geography": {
        const { worldName, concept } = context || {};
        prompt = `Suggest geography for a world called "${worldName || "the world"}" with concept: "${concept || ""}".
Return JSON: { "geography": "2-3 sentence description of geography, terrain, and climate" }`;
        break;
      }
      case "suggest_fauna": {
        const { worldName, techLevel } = context || {};
        prompt = `Suggest fauna and flora for a ${techLevel || "medieval"} world.
Return JSON: { "fauna": "Description of notable animals, plants, and any creatures unique to this world" }`;
        break;
      }
      case "suggest_religion": {
        const { worldName, politicalSystem, techLevel } = context || {};
        prompt = `Suggest religious beliefs for a ${techLevel || "medieval"} world with ${politicalSystem || "feudal"} political system.
Return JSON: { "religion": "Description of dominant religions, pantheons, and belief systems" }`;
        break;
      }
      case "generate_suggested_actions": {
        const { narrative, character, worldState, age } = context || {};
        const charAge = age || character?.age || 25;
        prompt = `Based on this narrative situation, suggest 3-4 contextual actions for a ${charAge}-year-old character.
Recent narrative: "${(narrative || "").slice(-500)}"
Location: ${worldState?.currentLocation?.name || "unknown"}
Season: ${worldState?.season || "unknown"}
Weather: ${worldState?.weather || "unknown"}

Return JSON: { "actions": ["Action 1", "Action 2", "Action 3", "Action 4"] }
Actions must be in Spanish. Keep them brief (5-10 words). They should be contextual to the situation, not generic.`;
        break;
      }
      default:
        return res.status(400).json({ error: `Unknown assist type: ${type}` });
    }

    const { text: raw, usage } = await generateWithProvider(provider, "state", prompt, systemPrompt);

    let parsed: any;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = { raw };
      }
    } catch {
      parsed = { raw };
    }

    parsed.tokenUsage = { ...usage, narrationInput: 0, narrationOutput: 0, stateInput: usage.inputTokens, stateOutput: usage.outputTokens };
    res.json(parsed);
  } catch (err) {
    console.error("Assist error:", err);
    if (isProviderBudgetExceeded(err, provider)) {
      return res.status(402).json(budgetExceededResponse(provider));
    }
    res.status(500).json({ error: "Failed to generate assist response" });
  }
});

export default router;
