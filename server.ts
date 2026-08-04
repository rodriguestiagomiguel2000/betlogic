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
import tipstersRouter from './server/tipsters';

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
  app.use('/api/tipsters', tipstersRouter);
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

      const currentYear = new Date().getFullYear();
      const prompt = `Analyze this sports betting slip image and extract all structured fields matching the schema exactly.
Infer values strictly from the slip. Ensure decimal odds format is returned. Output clean, valid JSON only.

SPORT INFERENCE & RECOGNITION (CRITICAL):
- You MUST infer the sport category for each selection and the overall bet using your trained knowledge of team names, player names, league names, and competitions visible on the slip.
- Constrain the sport value to EXACTLY one of: "Football", "Basketball", "Tennis", "Baseball", "Ice Hockey", "Esports", "MMA", "Golf". Do NOT invent free-text sport names.
- Examples of trained knowledge sport inference:
  * Recognizing "Ferencvaros" or "Vasas FC" as Hungarian football clubs -> "Football"
  * Recognizing "Deportivo Madryn", "Ciudad de Bolivar", "All Boys", "Mitre" as football clubs -> "Football"
  * Recognizing "Warriors", "Bucks", "Lakers" as NBA basketball teams -> "Basketball"
  * Recognizing "Federer", "Nadal", "Alcaraz", "Swiatek" as tennis players -> "Tennis"
- For genuinely ambiguous, unknown, or lower-league team names that you do not recognize, you MUST NOT guess randomly. Only set it to "Football" if there is a clear visual indicator suggesting it (like a football/soccer ball icon next to the match, or a "1x2" or "Draw" market which is highly football-specific). Otherwise, leave the sport field null or omitted.
- For multi-leg parlays where legs may span different sports, set the sport field on each leg in the 'legs' array individually using this inference. Set the top-level 'sport' to the sport of the first leg or the predominant sport on the slip.

Special parsing & Extraction Rules:
1. MULTI-LEG / PARLAY / MULTIPLE SLIPS (CRITICAL):
   - If the slip header says "Multiple", "Parlay", "Accumulator", "Combo", "Bet Builder", OR shows 2 or more distinct selection cards/rows:
   - Extract EVERY selection block as a separate, distinct item in the 'legs' array.
   - On ReloadBet slips & similar layouts:
     * Bold top line = 'selection' / pick (e.g. "Deportivo Madryn", "Mitre").
     * Top right number = THAT LEG'S individual decimal odds 'odds_decimal' (e.g. 1.95, 1.43). NEVER put the combined total odds (e.g. 2.79) here!
     * Middle line = 'market' (e.g. "1x2").
     * Third line next to sport/ball icon = 'event' / match fixture (e.g. "Deportivo Madryn vs. All Boys", "Ciudad de Bolivar vs. Mitre").
   - Set 'market_type' to "Multiple" or "Parlay".
   - Set top-level 'total_odds' to the combined payout odds on the ticket (e.g. 2.79).
   - Set top-level 'odds' to the combined total odds (e.g. 2.79) for multiple bets.

2. CURRENT YEAR & DATE HANDLING (IMPORTANT):
   - The current year is ${currentYear}.
   - When dates like "02/08" or "02/08 • 20:00" or "02 Aug" are shown without an explicit year, ALWAYS assume the current year is ${currentYear} (e.g. "${currentYear}-08-02T20:00:00").
   - European date format "02/08" is August 2nd (08-02), NOT February 8th.
   - NEVER output past years unless explicitly printed on the physical slip.

3. LIVE / IN-PLAY BETS:
   - Look for "LIVE", "Halftime", red dots ((•)), active live scores (e.g. "0:0", "1:2"), or match clocks. Set is_live: true if present.

4. BOOKMAKER:
   - Identify sportsbook name (e.g., ReloadBet, Bet365, Pinnacle, BC.GAME). Return clean name.

5. LEGS ARRAY, BET BUILDERS & CONDENSED MARKETS (CRITICAL):
   - 'legs' array MUST NOT be empty. EVERY sub-selection MUST be extracted as a leg.
   - BET BUILDER HANDLING: On slips containing a Bet Builder (e.g., "Bet Builder 3/10", "Criar Aposta", "Same Game Parlay"), sub-selections inside the Bet Builder DO NOT have individual odds. Instead, the entire Bet Builder block has a single combined odds (e.g. 4.50 or 2.05).
     * Set 'builder_id' (e.g. "builder_1", "builder_2") for all legs belonging to the same Bet Builder group.
     * Set 'builder_odds' to the combined odds of that Bet Builder block (e.g. 4.50).
     * Set 'odds_decimal' to the builder_odds for legs in that group.
   - MULTIPLE BET BUILDERS & MIXED COMBOS: A ticket can contain MULTIPLE Bet Builders (e.g., Bet Builder 1 @ 4.50, Bet Builder 2 @ 2.83) OR a mix of Bet Builders and Single bets (e.g., Bet Builder 1 @ 4.50 + Single @ 1.47 + Single @ 2.66).
     * Ensure total_odds equals the product of each independent single leg odds AND each Bet Builder group's builder_odds (multiplying each Bet Builder odds ONCE, not per sub-selection).
   - On Portuguese / European slips showing market descriptor lines above or next to match names (e.g., "[Team] para marcar em ambas as partes", "Ambas as equipas marcam", "Total de Golos", "[Team] a marcar"):
     * Map the market description text into 'market' (e.g. "Sirius para marcar em ambas as partes" or "Ambas Marcam (BTTS)").
     * Map the pick answer into 'selection' (e.g. "Sim", "Não", "Over 2.5").
     * NEVER omit 'market' or leave it empty when a market descriptor header is visible on the slip.`;

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
                description: 'Name of the sportsbook/bookmaker (e.g. ReloadBet, Bet365, Pinnacle, BC.GAME).',
              },
              event: {
                type: Type.STRING,
                description: 'Main match/fixture name for single bets or overall description for parlays.',
              },
              market: {
                type: Type.STRING,
                description: 'Main betting market name (e.g. 1x2, Match Result, Both Teams To Score).',
              },
              selection: {
                type: Type.STRING,
                description: 'Selected outcome or team (e.g., Deportivo Madryn, Over 2.5).',
              },
              sport: {
                type: Type.STRING,
                enum: ['Football', 'Basketball', 'Tennis', 'Baseball', 'Ice Hockey', 'Esports', 'MMA', 'Golf'],
                description: 'Sport category. MUST be exactly one of the specified enum values, or omit/leave null if unrecognizable.',
              },
              odds: {
                type: Type.NUMBER,
                description: 'Total or single decimal odds of the wager.',
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
                description: 'True if the wager is an in-play/live bet or taken during halftime/in-game, indicated by LIVE badges, red dots, or match clocks.',
              },
              market_type: {
                type: Type.STRING,
                description: 'Type of bet: Single, Parlay, Multiple, Accumulator, or Bet Builder.',
              },
              placed_at: {
                type: Type.STRING,
                description: `Date or timestamp when the bet was placed (ISO string YYYY-MM-DD or YYYY-MM-DDTHH:mm using current year ${currentYear}).`,
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
                description: 'Array of separate selections or legs parsed from the slip. ALWAYS extract EVERY leg.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    event: {
                      type: Type.STRING,
                      description: 'Match fixture or event name (e.g. Deportivo Madryn vs. All Boys or Ciudad de Bolivar vs. Mitre). MUST NOT be empty.',
                    },
                    selection: {
                      type: Type.STRING,
                      description: 'The specific pick or team outcome (e.g. Deportivo Madryn, Mitre). MUST NOT be empty.',
                    },
                    team: {
                      type: Type.STRING,
                      description: 'Selected team or outcome.',
                    },
                    market: {
                      type: Type.STRING,
                      description: 'Wager market details (e.g. 1x2, Ambas Marcam, Match Result, [Team] para marcar em ambas as partes). MUST be extracted if visible.',
                    },
                    sport: {
                      type: Type.STRING,
                      enum: ['Football', 'Basketball', 'Tennis', 'Baseball', 'Ice Hockey', 'Esports', 'MMA', 'Golf'],
                      description: 'Sport category for this specific leg. MUST be exactly one of the specified enum values, or omit/leave null if unrecognizable.',
                    },
                    odds_decimal: {
                      type: Type.NUMBER,
                      description: 'Decimal odds for this individual leg ONLY (e.g. 1.95 or 1.43). For Bet Builders, use group odds or builder_odds.',
                    },
                    builder_id: {
                      type: Type.STRING,
                      description: 'Identifier grouping sub-selections that belong to the same Bet Builder (e.g. builder_1, builder_2). Leave empty for single independent legs.',
                    },
                    builder_odds: {
                      type: Type.NUMBER,
                      description: 'Combined decimal odds for the entire Bet Builder block (e.g. 4.50 or 2.83). Only populated if part of a Bet Builder.',
                    },
                    event_date: {
                      type: Type.STRING,
                      description: `Kickoff date/time if visible on slip (e.g. ${currentYear}-08-02T20:00:00). ALWAYS use current year ${currentYear} if no year is shown.`,
                    },
                  },
                  required: ['event', 'selection'],
                },
              },
            },
            required: ['bookmaker', 'stake', 'status', 'legs'],
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
