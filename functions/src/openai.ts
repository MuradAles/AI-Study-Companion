import OpenAI from 'openai';
import * as functions from 'firebase-functions';

// Get OpenAI API key from environment or Firebase config
const getOpenAIApiKey = (): string => {
  // Check Firebase Functions config (production)
  const config = functions.config();
  if (config.openai?.api_key) {
    return config.openai.api_key;
  }
  // Check environment variable (local development)
  if (process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY;
  }
  throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY in environment or Firebase config.');
};

// Initialize OpenAI client
let openaiClient: OpenAI | null = null;

export const getOpenAIClient = (): OpenAI => {
  if (!openaiClient) {
    const apiKey = getOpenAIApiKey();
    openaiClient = new OpenAI({
      apiKey: apiKey,
    });
  }
  return openaiClient;
};

// Helper function to call OpenAI API with error handling
export async function callOpenAI(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    responseFormat?: { type: 'json_object' };
  } = {}
): Promise<string> {
  try {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: options.model || 'gpt-4o',
      messages: messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      response_format: options.responseFormat,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No content in OpenAI response');
    }
    return content;
  } catch (error) {
    throw new Error(`OpenAI API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Helper function for JSON responses
export async function callOpenAIJSON<T>(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<T> {
  const model = options.model || 'gpt-4o';
  
  // Models that support JSON mode
  const jsonModeSupported = [
    'gpt-4-turbo',
    'gpt-4-turbo-preview',
    'gpt-4-0125-preview',
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-3.5-turbo',
    'gpt-3.5-turbo-1106',
  ];
  
  const supportsJsonMode = jsonModeSupported.some(m => model.includes(m));
  
  if (supportsJsonMode) {
    // Use JSON mode if supported
    const response = await callOpenAI(messages, {
      ...options,
      responseFormat: { type: 'json_object' },
    });
    try {
      return JSON.parse(response) as T;
    } catch (error) {
      throw new Error(`Failed to parse OpenAI JSON response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } else {
    // Fallback: request JSON in prompt and parse manually
    const enhancedMessages = [
      {
        role: 'system' as const,
        content: messages.find(m => m.role === 'system')?.content + '\n\nIMPORTANT: You MUST respond with valid JSON only. Do not include any markdown formatting, code blocks, or explanatory text. Return only the JSON object.',
      },
      ...messages.filter(m => m.role !== 'system'),
    ];
    
    const response = await callOpenAI(enhancedMessages, {
      ...options,
    });
    
    // Try to extract JSON from response (handle cases where markdown code blocks are used)
    let jsonString = response.trim();
    
    // Remove markdown code blocks if present
    if (jsonString.startsWith('```json')) {
      jsonString = jsonString.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonString.startsWith('```')) {
      jsonString = jsonString.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    try {
      return JSON.parse(jsonString) as T;
    } catch (error) {
      throw new Error(`Failed to parse OpenAI JSON response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

