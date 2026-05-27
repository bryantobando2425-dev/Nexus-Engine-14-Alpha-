import { GoogleGenAI } from "@google/genai";

export const gemini = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

export const GEMINI_NARRATION_MODEL = "gemini-3-flash-preview";
export const GEMINI_STATE_MODEL = "gemini-2.5-flash";

export async function geminiGenerate(
  model: string,
  userPrompt: string,
  systemPrompt?: string,
  maxOutputTokens = 8192,
): Promise<string> {
  const response = await gemini.models.generateContent({
    model,
    contents: userPrompt,
    config: {
      ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
      maxOutputTokens,
    },
  });
  return response.text ?? "";
}

export async function* geminiStream(
  model: string,
  userPrompt: string,
  systemPrompt?: string,
  maxOutputTokens = 8192,
): AsyncGenerator<string> {
  const stream = await gemini.models.generateContentStream({
    model,
    contents: userPrompt,
    config: {
      ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
      maxOutputTokens,
    },
  });
  for await (const chunk of stream) {
    const text = chunk.text;
    if (text) yield text;
  }
}
