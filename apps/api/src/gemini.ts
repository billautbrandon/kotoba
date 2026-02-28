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

export async function callGeminiJson<T>(prompt: string): Promise<T> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  const result = await executeGeminiCall(model, prompt);
  const responseText = result.response.text();

  try {
    return JSON.parse(responseText) as T;
  } catch {
    throw new Error(`Gemini returned invalid JSON: ${responseText.slice(0, 200)}`);
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
