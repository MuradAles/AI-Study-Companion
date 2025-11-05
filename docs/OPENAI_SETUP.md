# OpenAI API Setup Guide

## Getting Your API Key

1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign in or create an account
3. Click "Create new secret key"
4. Copy the key (you'll only see it once!)

## Local Development Setup

1. Copy `.env.example` to `.env`:
   ```bash
   cd functions
   cp .env.example .env
   ```

2. Edit `.env` and add your API key:
   ```
   OPENAI_API_KEY=sk-your-actual-key-here
   ```

3. The Firebase Functions will automatically use this key when running locally

## Production Setup

For production deployment, use Firebase Functions config:

```bash
firebase functions:config:set openai.api_key="sk-your-actual-key-here"
```

Then deploy:
```bash
firebase deploy --only functions
```

## Testing

Once the API key is set, you can test the integration by:

1. Creating a test session document in Firestore with a transcript
2. The `processTranscript` function will automatically trigger
3. Check the function logs for success/errors

## Security Notes

- ✅ `.env` files are gitignored (not committed to repo)
- ✅ API keys are stored securely in Firebase config (production)
- ✅ Never commit API keys to version control
- ✅ Rotate keys if exposed

## Cost Considerations

- GPT-4: ~$0.03 per 1K tokens (more accurate, more expensive)
- GPT-3.5-turbo: ~$0.0015 per 1K tokens (faster, cheaper)
- The code uses GPT-4 for analysis, GPT-3.5 for answers (optimized)

## Troubleshooting

If you get "OpenAI API key not configured" error:
1. Check that `.env` file exists in `functions/` directory
2. Verify the key starts with `sk-`
3. Restart Firebase emulator if running locally
4. Check function logs: `firebase functions:log`

