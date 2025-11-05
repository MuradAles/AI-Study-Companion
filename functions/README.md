# Firebase Functions

This directory contains Firebase Cloud Functions for the AI Study Companion project.

## Setup

1. Install dependencies:
```bash
cd functions
npm install
```

2. Set OpenAI API key:

### For Local Development:
Create a `.env` file in the `functions/` directory with:
```
OPENAI_API_KEY=your-openai-api-key-here
```

**Get your API key:** https://platform.openai.com/api-keys

### For Production:
Set Firebase Functions config:
```bash
firebase functions:config:set openai.api_key="your-openai-api-key-here"
firebase deploy --only functions
```

**Note:** The `.env` file is gitignored and won't be committed.

## Available Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run serve` - Start Firebase emulators (functions only)
- `npm run deploy` - Deploy functions to Firebase
- `npm run logs` - View function logs

## Functions

- `helloWorld` - Example function (to be removed)
- `processTranscript` - Process session transcripts (Task 4)
- `generateQuestions` - Generate practice questions (Task 5)
- `evaluateAnswer` - Evaluate student answers (Task 7)
- `checkStudentHealth` - Retention automation (Task 11)

## Environment Variables

Functions can access environment variables via:
- `functions.config()` for production config
- `process.env` for local development

