// OpenAI API Integration Tests
// This file contains mock tests for OpenAI API integration

import { getOpenAIClient, callOpenAI, callOpenAIJSON } from './openai';

export const testOpenAIConnection = async () => {
  try {
    getOpenAIClient(); // Verify client can be created
    const response = await callOpenAI([
      {
        role: 'system',
        content: 'You are a helpful assistant.',
      },
      {
        role: 'user',
        content: 'Say "Hello" in one word.',
      },
    ], {
      model: 'gpt-3.5-turbo',
      temperature: 0.3,
      maxTokens: 10,
    });
    
    console.log('OpenAI connection test successful:', response);
    return { success: true, response };
  } catch (error) {
    console.error('OpenAI connection test failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

export const testOpenAIJSON = async () => {
  try {
    const response = await callOpenAIJSON<{ message: string }>([
      {
        role: 'system',
        content: 'You are a helpful assistant. Respond only with valid JSON.',
      },
      {
        role: 'user',
        content: 'Return a JSON object with a "message" field containing "Hello".',
      },
    ], {
      model: 'gpt-3.5-turbo',
      temperature: 0.3,
    });
    
    console.log('OpenAI JSON test successful:', response);
    return { success: true, response };
  } catch (error) {
    console.error('OpenAI JSON test failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

// Import this in index.ts if you want to expose test endpoints
// export const testOpenAI = functions.https.onCall(async (data, context) => {
//   return await testOpenAIConnection();
// });

