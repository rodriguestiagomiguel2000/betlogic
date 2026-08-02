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
Infer values strictly from the slip. Ensure decimal odds format is returned. Output clean, valid JSON only.

Special parsing rules:
1. LIVE / IN-PLAY BETS: Check for live indicators like "Halftime", red broadcast icons/dots ((•)), "Live", "In-Play", or active match scores (e.g., "0:0", "1:2"). Set is_live: true if any of these are present.
2. CONDENSED MARKET & SELECTION LINES: On slips showing condensed lines like "1x2 Ferencvaros 0:0", parse "1x2" as the market, "Ferencvaros" (or the chosen team/outcome) as the selection/team, and separate out live match scores or status.
3. FIXTURE / EVENT NAME: Extract full fixture names (e.g., "Ferencvaros vs Vasas FC").
4. LEGS ARRAY: Always populate the legs array with at least 1 leg item even for single bets. Include event name, market, selection pick, decimal odds, and event kickoff date/time if visible.`;

      // Enforce JSON Schema structured outputs using Gemini 3.1 Flash Lite
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
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
                description: 'Name of the sportsbook/bookmaker (e.g. BC.GAME, Bet365, Pinnacle).',
              },
              event: {
                type: Type.STRING,
                description: 'Main match/fixture name (e.g. Ferencvaros vs Vasas FC or Liverpool vs Manchester City).',
              },
              market: {
                type: Type.STRING,
                description: 'Main betting market name (e.g. 1x2, Match Result, Both Teams To Score).',
              },
              selection: {
                type: Type.STRING,
                description: 'Selected outcome or team (e.g., Ferencvaros, Over 2.5, Real Madrid Win).',
              },
              sport: {
                type: Type.STRING,
                description: 'Sport category (e.g. Football, Basketball, Tennis, Esports, MMA).',
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
                description: 'Current wager status: pending, won, lost, void, or cashout.',
              },
              is_live: {
                type: Type.BOOLEAN,
                description: 'True if the wager is an in-play/live bet or taken during halftime/in-game, indicated by live icons, red dots, "Halftime", "Live", or live score displays.',
              },
              market_type: {
                type: Type.STRING,
                description: 'Type of bet: Single, Parlay, Multiple, Accumulator, or Bet Builder.',
              },
              placed_at: {
                type: Type.STRING,
                description: 'Date or timestamp when the bet was placed (format: YYYY-MM-DD or ISO string).',
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
                description: 'Array of separate selections or legs parsed from the slip. ALWAYS populate at least one leg even for single bets.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    event: {
                      type: Type.STRING,
                      description: 'Match fixture or event name (e.g. Ferencvaros vs Vasas FC).',
                    },
                    selection: {
                      type: Type.STRING,
                      description: 'The specific pick or team outcome (e.g. Ferencvaros, Over 2.5 Goals).',
                    },
                    team: {
                      type: Type.STRING,
                      description: 'Selected team, athlete or outcome.',
                    },
                    market: {
                      type: Type.STRING,
                      description: 'Wager market details (e.g. 1x2, Match Result).',
                    },
                    odds_decimal: {
                      type: Type.NUMBER,
                      description: 'Decimal odds for this individual leg.',
                    },
                    event_date: {
                      type: Type.STRING,
                      description: 'Kickoff or event date/time if visible on slip (ISO string YYYY-MM-DD or YYYY-MM-DDTHH:mm or Aug 2, 2026 at 17:30).',
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

      // Safe parse to verify structure and log raw extraction
      const parsedData = JSON.parse(rawText.trim());
      console.log('\n=================== [RAW GEMINI OCR RESPONSE FROM SERVER] ===================');
      console.log(JSON.stringify(parsedData, null, 2));
      console.log('=============================================================================\n');
      return res.json(parsedData);
    } catch (err: any) {
      console.error('Betslip scanner error on backend:', err);
      const errMsg = (err.message || '').toLowerCase();
      if (errMsg.includes('resource_exhausted') || errMsg.includes('quota') || errMsg.includes('limit exceeded') || errMsg.includes('429')) {
        return res.status(429).json({
          error: 'Gemini API Quota Exceeded (429 RESOURCE_EXHAUSTED): You have exceeded your free Google AI Studio rate limits of 15 RPM or daily token budget. Please wait 60 seconds and retry.',
        });
      }
      return res.status(500).json({
        error: err.message || 'Failed to scan and parse the betslip using server-side Gemini OCR.',
      });
    }
  });

  // Vite middleware setup for Development
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
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
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`🚀 Production-ready Server listening on http://0.0.0.0:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
}

startServer();
