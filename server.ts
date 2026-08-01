import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Configure dotenv to load environment variables.
// In production on Render, we first look for Render Secret Files at '/etc/secrets/.env'
const renderSecretPath = '/etc/secrets/.env';
if (fs.existsSync(renderSecretPath)) {
  dotenv.config({ path: renderSecretPath });
  console.log(`✅ Loaded environment variables from Render Secret File: ${renderSecretPath}`);
} else {
  dotenv.config();
  console.log('ℹ️ Loaded environment variables from standard local environment/.env');
}

import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import authRouter from './server/auth';
import betsRouter from './server/bets';
import analyticsRouter from './server/analytics';
import healthRouter, { verifyDatabaseSchema } from './server/health';
import bankrollsRouter from './server/bankrolls';
import bookmakersRouter from './server/bookmakers';
import transfersRouter from './server/transfers';
import tagsRouter from './server/tags';

async function startServer() {
  const app = express();
  
  // Use Render PORT in production if specified, otherwise fall back to 3001.
  // In development, we use 3000 to comply with AI Studio preview requirements.
  const PORT = process.env.PORT || (process.env.NODE_ENV === 'production' ? 3001 : 3000);

  // Configure JSON parser with higher limits for large image payloads
  app.use(express.json({ limit: '15mb' }));

  // Register Database API Routes
  app.use('/api/auth', authRouter);
  app.use('/api/bets', betsRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/bankrolls', bankrollsRouter);
  app.use('/api/bookmakers', bookmakersRouter);
  app.use('/api/bankroll-transfers', transfersRouter);
  app.use('/api/tags', tagsRouter);
  app.use('/api/health', healthRouter);

  // Run database table verification check on startup
  await verifyDatabaseSchema();

  // Initialize Gemini client on the server side
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // TASK 2: Secure Betslip Scanner Server Endpoint
  app.post('/api/scan-betslip', async (req, res) => {
    try {
      const { image, mimeType } = req.body;
      if (!image) {
        return res.status(400).json({ error: 'Missing image base64 data' });
      }

      // Check if Gemini API key exists
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({
          error: 'GEMINI_API_KEY environment variable is not configured. Please set it in the Settings > Secrets menu.',
        });
      }

      const prompt = `Analyze this sports betting slip image and extract all structured fields matching the schema exactly.
Infer values strictly from the slip. Ensure decimal odds format is returned. Output clean, valid JSON only.`;

      // Enforce JSON Schema structured outputs using Gemini 3.6 Flash
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: [
          {
            inlineData: {
              mimeType: mimeType || 'image/jpeg',
              data: image,
            },
          },
          {
            text: prompt,
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              bookmaker: {
                type: Type.STRING,
                description: 'Name of the sportsbook/bookmaker.',
              },
              event: {
                type: Type.STRING,
                description: 'Main match/fixture name (e.g. Liverpool vs Manchester City).',
              },
              market: {
                type: Type.STRING,
                description: 'Main betting market name (e.g. Both Teams To Score).',
              },
              odds: {
                type: Type.NUMBER,
                description: 'Decimal odds of the wager selection.',
              },
              stake: {
                type: Type.NUMBER,
                description: 'Monetary stake amount wagered.',
              },
              potentialPayout: {
                type: Type.NUMBER,
                description: 'Estimated or potential monetary return.',
              },
              status: {
                type: Type.STRING,
                description: 'Current wager status: pending, won, lost, or void.',
              },
              market_type: {
                type: Type.STRING,
                description: 'Type of bet: Single, Parlay, Multiple, Accumulator, or Bet Builder.',
              },
              placed_at: {
                type: Type.STRING,
                description: 'Date or timestamp when the bet was placed (format: YYYY-MM-DD).',
              },
              bet_id: {
                type: Type.STRING,
                description: 'Unique slip identifier/ticket number.',
              },
              total_odds: {
                type: Type.NUMBER,
                description: 'Total combined odds of the betslipped ticket.',
              },
              legs: {
                type: Type.ARRAY,
                description: 'Array of separate selections or legs parsed from the slip.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    event: {
                      type: Type.STRING,
                      description: 'Match fixture or event name.',
                    },
                    team: {
                      type: Type.STRING,
                      description: 'Selected team, athlete or outcome.',
                    },
                    market: {
                      type: Type.STRING,
                      description: 'Wager market details.',
                    },
                    odds_decimal: {
                      type: Type.NUMBER,
                      description: 'Decimal odds for this individual leg.',
                    },
                  },
                  required: ['event'],
                },
              },
            },
            required: ['bookmaker', 'odds', 'stake', 'status'],
          },
        },
      });

      const rawText = response.text;
      if (!rawText) {
        throw new Error('Gemini OCR returned an empty text response.');
      }

      // Safe parse to verify structure
      const parsedData = JSON.parse(rawText.trim());
      return res.json(parsedData);
    } catch (err: any) {
      console.error('Betslip scanner error on backend:', err);
      return res.status(500).json({
        error: err.message || 'Failed to scan and parse the betslip using server-side Gemini OCR.',
      });
    }
  });

  // Vite middleware setup for Development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production serving
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // Standard catch-all route to serve index.html for React SPA routing on Render
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`🚀 Production-ready Server listening on http://0.0.0.0:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
}

startServer();
