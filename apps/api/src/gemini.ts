import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY ?? "";

let genAIInstance: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  if (!genAIInstance) {
    genAIInstance = new GoogleGenerativeAI(apiKey);
  }
  return genAIInstance;
}

export type GeminiErrorInfo = {
  message: string;
  isQuotaError: boolean;
  httpStatus: number | null;
};

function parseGeminiError(error: unknown): GeminiErrorInfo {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[kotoba/gemini] API error:", message);

  const statusMatch = message.match(/\[(\d{3})\s/);
  const httpStatus = statusMatch ? Number(statusMatch[1]) : null;
  const isQuotaError = httpStatus === 429;

  return { message, isQuotaError, httpStatus };
}

async function executeGeminiCall(
  model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>,
  prompt: string,
) {
  try {
    return await model.generateContent(prompt);
  } catch (error) {
    const errorInfo = parseGeminiError(error);
    if (errorInfo.isQuotaError) {
      throw new GeminiQuotaError(errorInfo.message);
    }
    throw new GeminiApiError(errorInfo.message, errorInfo.httpStatus);
  }
}

function extractJsonPayload(rawText: string): string {
  let text = rawText.trim();

  const fencedJsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedJsonMatch) {
    text = fencedJsonMatch[1].trim();
  }

  if (text.startsWith("{") || text.startsWith("[")) {
    return text;
  }

  const firstBracketIndex = Math.min(
    ...["{", "["].map((character) => {
      const index = text.indexOf(character);
      return index === -1 ? Number.POSITIVE_INFINITY : index;
    }),
  );
  if (firstBracketIndex === Number.POSITIVE_INFINITY) {
    return text;
  }
  const openingBracket = text[firstBracketIndex];
  const closingBracket = openingBracket === "{" ? "}" : "]";
  const lastClosingIndex = text.lastIndexOf(closingBracket);
  if (lastClosingIndex > firstBracketIndex) {
    return text.slice(firstBracketIndex, lastClosingIndex + 1);
  }
  return text;
}

export async function callGeminiJson<T>(prompt: string): Promise<T> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 8192,
    },
  });

  const result = await executeGeminiCall(model, prompt);
  const responseText = result.response.text();
  const candidatePayload = extractJsonPayload(responseText);

  try {
    return JSON.parse(candidatePayload) as T;
  } catch (parseError) {
    const parseMessage = parseError instanceof Error ? parseError.message : String(parseError);
    console.error(
      "[kotoba/gemini] Failed to parse JSON response:",
      parseMessage,
      "\nRaw response (truncated):",
      responseText.slice(0, 400),
    );
    throw new Error(
      `Gemini a renvoyé une réponse JSON invalide. Réessayez, ou réduisez la quantité de vocabulaire envoyé à l'IA.`,
    );
  }
}

export async function callGeminiText(prompt: string): Promise<string> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
  });

  const result = await executeGeminiCall(model, prompt);
  return result.response.text();
}

export function isGeminiConfigured(): boolean {
  return apiKey.length > 0;
}

export class GeminiQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiQuotaError";
  }
}

export class GeminiApiError extends Error {
  httpStatus: number | null;
  constructor(message: string, httpStatus: number | null) {
    super(message);
    this.name = "GeminiApiError";
    this.httpStatus = httpStatus;
  }
}
