import { GoogleGenAI } from "@google/genai";
import { invoke } from '@tauri-apps/api/core';

// Função para buscar a chave de API do backend
async function getApiKey(): Promise<string | null> {
  try {
    // Certifique-se que o nome do comando é o mesmo que no backend Rust
    const apiKey = await invoke<string | null>('get_api_key');
    if (!apiKey) {
      console.error("A variável de ambiente API_KEY não está definida no backend.");
      return null;
    }
    return apiKey;
  } catch (error) {
    console.error("Erro ao buscar a chave de API do backend:", error);
    return null;
  }
}

let ai: GoogleGenAI | null = null;
const apiKey = await getApiKey();

if (!apiKey) {
  console.warn("Gemini API key not found. AI features will be disabled.");
} else {
  ai = new GoogleGenAI({ apiKey: apiKey });
}

const getBasePrompt = (scriptType: 'pre-request' | 'post-request'): string => {
    return `
You are an expert JavaScript code generator for an API client like Postman.
Your task is to generate a script for the "${scriptType}" phase.
You have access to a global object 'pm' with the following structure and methods:
pm = {
  variables: {
    get: (variableName: string): any => { /* retrieves a variable */ },
    set: (variableName: string, value: any): void => { /* sets a variable */ },
  },
  request: {
    headers: {
      add: ({ key: string, value: string }): void => { /* adds a request header */ }
    }
  },
  response: { // Only available in post-request scripts
    status: number,
    json: (): any => { /* parses response body as JSON */ },
    text: (): string => { /* returns response body as text */ }
  }
}
Generate ONLY the JavaScript code to accomplish the user's goal. Do not wrap it in markdown, comments, or explanations.
`;
}


export const generateScriptWithGemini = async (prompt: string, scriptType: 'pre-request' | 'post-request'): Promise<string> => {
  if (!ai) {
    return Promise.reject(new Error("API Key for Gemini is not configured."));
  }

  const fullPrompt = `${getBasePrompt(scriptType)}\nUser's goal: "${prompt}"`;

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: fullPrompt,
    });
    return response.text ? response.text.trim() : '';
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new Error("Failed to generate script with AI.");
  }
};