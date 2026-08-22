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
import compression from 'compression';
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
  
  // Enable HTTP response compression (gzip/brotli) for all responses
  app.use(compression());
  
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
    // Keep reference to image outside try block for cleanup in finally if needed
    let imageData: string | null = req.body.image;
    
    try {
      const mimeType = req.body.mimeType;
      
      if (!imageData) {
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
   - Read the day and month EXACTLY as printed on THIS slip. Do not reuse or default to any date mentioned elsewhere in these instructions — every slip has its own date, and copying a previous example would be a factual error.
   - Dates on these slips are in European format DD/MM (day first, then month) — e.g. a printed "05/11" means day 5, month 11 (5th November), NOT May 11th. Apply this rule to whatever DD/MM digits are actually visible on the slip, whatever they are.
   - When a date is shown without an explicit year, assume the current year is ${currentYear}, and combine it with the DD/MM (and time, if shown) you actually read from the image into ISO format YYYY-MM-DDTHH:mm.
   - NEVER output past years unless explicitly printed on the physical slip.
   - If no date/time is visible anywhere on the slip for a given field, leave that field null/omitted. Do NOT guess, and do NOT fall back to today's date or to any date used as an example in this prompt.

2b. 'placed_at' vs 'event_date' ARE DIFFERENT FIELDS, EVEN WHEN THEY ARE VISUALLY CLOSE (CRITICAL):
   - 'placed_at' (top-level) is the timestamp of the TICKET/SLIP ITSELF — where the bet was placed. It is normally found in ONE of these specific structural positions, and NOWHERE else:
     * In the slip's top header, next to words like "Combo", "Múltipla", "Acumulador a partir", "Aposta realizada", or next to the ticket/bet type label.
     * In the slip's footer/bottom area, next to "Ticket ID", "ID:", a bet reference number, or alongside Total Odds / Total Stake / Total Win summary rows.
   - 'event_date' (per leg) is the KICKOFF date/time of that specific match. It is ALWAYS printed INSIDE or DIRECTLY ABOVE that leg's own block/card/row, immediately next to (or just above) that leg's team names, league name, or sport icon. It is NEVER found in the ticket's global header or footer area.
   - DO NOT be misled by proximity or similarity: on many real slips, 'placed_at' and the FIRST leg's 'event_date' fall on the same calendar date and can be only minutes apart in printed time (e.g. slip placed at 20:19 for a match kicking off at 19:30 the same day — a live/in-play bet). Being close in time or on the same date does NOT make them the same field. Judge strictly by WHERE on the slip each timestamp is printed (global ticket area vs. inside a specific leg's block), never by which value seems more "sensible" as a default.
   - Extract 'placed_at' ONLY from the global ticket header/footer position described above. Never copy a per-leg kickoff time into 'placed_at', and never copy 'placed_at' into any leg's 'event_date'.
   - Extract EACH leg's 'event_date' independently by re-reading the timestamp printed inside that specific leg's own block. Do not reuse the ticket's global placed_at value, and do not reuse one leg's date/time for a different leg unless that exact same date/time is separately and explicitly printed inside that other leg's own block too.
   - RELATIVE DAY LABELS ON A LEG (e.g. "Today", "Hoje", "Live", "Ao Vivo", an in-play match clock like "70' 2nd half", or a live score like "0:0"): these still belong to that leg's own 'event_date', combined with whatever explicit clock time is printed in that same leg's block (e.g. "Today, 16:30" -> today's date + 16:30). If a leg shows a live match clock/live score instead of a clock time, and no separate kickoff time is printed for it, you may leave that leg's time portion off and use just the date if inferable, or omit event_date entirely for that leg if genuinely no date/time is printed there.
   - BARE TIME WITH NO DATE ON A LEG (e.g. a leg block shows only "19:30" or "20:30" without any date, common on compact multi-leg summaries): the date for that leg is the same calendar date as the slip's own placed_at/ticket date (unless a different day is explicitly labeled next to that leg, e.g. "Amanhã"/"Tomorrow"). Combine that inferred date with the TIME actually printed inside that leg's block — never with the placed_at TIME.
   - WORKED EXAMPLE (bare time, no date, ticket has its own global timestamp): a leg block shows "Dortmund  19:30  Bayern Munique" with no date printed inside that block, while the ticket's global footer shows a placement timestamp like "22/08/26, 17:46". In this case: event_date = ticket's own date (22/08/2026) + that leg's own printed time (19:30) -> "2026-08-22T19:30". The placed_at TIME (17:46) must NEVER appear in any leg's event_date, even though the placed_at DATE may be reused when a leg has no date of its own. Apply this same logic independently to every leg in the ticket, using each leg's own printed time (e.g. 19:30, 19:45, 20:30), never the placed_at time repeated across legs.
   - SELF-CHECK BEFORE FINALIZING (CRITICAL): before producing your final JSON output, re-scan the 'legs' array you are about to return. For every leg where event_date is missing, go back to that leg's own block in the image and check again for a printed time (even a bare time like "19:30" with no date, per the bare-time rule above). Only leave event_date genuinely omitted after this second check confirms no time is printed anywhere in that leg's block. It is a mistake to extract event_date for some legs correctly and skip it for others on the same ticket when all legs share the same visible format — treat inconsistent extraction across legs of the same ticket as a signal to re-check, not as an acceptable outcome.
   - If, after checking the leg's own block specifically, truly no date or time is printed there at all, leave that leg's 'event_date' null/omitted. An omitted field is always better than reusing the ticket's placed_at value.

3. LIVE / IN-PLAY BETS:
   - Look for "LIVE", "Halftime", red dots ((•)), active live scores (e.g. "0:0", "1:2"), or match clocks. Set is_live: true if present.

4. BOOKMAKER (CRITICAL):
   - Identify the sportsbook/operator name printed on the slip. Check ALL of these locations, in order of reliability: (a) any logo or brand wordmark at the top or bottom of the slip, (b) header/footer text or watermark, (c) distinctive color scheme/UI style you recognize, (d) any "shared via" / "powered by" / URL text.
   - PRIORITY: always read the literal brand wordmark/text first (e.g. the actual letters "Betclic" or "22BET" printed on the slip). Only use color scheme or layout as a secondary, lower-confidence confirmation signal — never let color alone override a clearly legible wordmark.
   - Distinguish these commonly confused operators by their literal wordmark text, not just color (both can appear on red/dark backgrounds):
     * Betclic: the literal word "Betclic" (bold, rounded lowercase-style lettering) at the very top of the slip, Portuguese labels like "Múltipla", "Cota total", "Ganhos potenciais", "Se acertar, ganho".
     * 22Bet: the literal characters "22BET" or "22Bet" as a distinct logo/wordmark, Portuguese labels like "Identificação do bol", "Acumulador a partir", "Estado: Aceite".
     * BC.GAME: dark navy background, green accent color, green shield/coin logo, "BC.GAME" wordmark near the ticket ID, status labels like "OPEN".
     * ReloadBet: black/yellow theme, lightning-bolt "R" icon, "RELOADBET" wordmark, "Bet Builder" terminology.
   - Return the bookmaker's clean, canonical brand name with correct casing, e.g. "BC.GAME", "ReloadBet", "22Bet", "Betclic", "Bet365", "Pinnacle" — not an abbreviation, a mis-cased guess, or a translated/localized variant.
   - If the wordmark text is not clearly legible, only then fall back to color/layout pattern-matching, and in that case return your best-confidence answer rather than guessing a different operator with a superficially similar color.
   - If you can visually identify a known logo/wordmark but the text is partially obscured, cropped, or stylized, still return your best-confidence canonical name rather than leaving it blank.
   - Only leave 'bookmaker' null/omitted if there is genuinely no visible brand indicator anywhere on the slip (logo, text, or watermark) — this happens on tightly cropped screenshots that only show the bets/results table without any header or footer branding.

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

      // Enforce JSON Schema structured outputs using Gemini 3.5 Flash Lite
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash-lite',
        contents: [
          {
            inlineData: {
              mimeType: mimeType || 'image/jpeg',
              data: imageData,
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
                description: `The bet-slip's own placement/issue timestamp ONLY (e.g. a receipt or "ticket generated" line), NOT any match kickoff time — see rule 2b. ISO string YYYY-MM-DD or YYYY-MM-DDTHH:mm using current year ${currentYear}. Omit entirely if no distinct placement timestamp is visible on the slip; do not default to today's date.`,
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
                      description: `Kickoff date/time exactly as printed on THIS slip, in ISO format YYYY-MM-DDTHH:mm, using current year ${currentYear} if no year is shown. Read the actual digits from the image — never reuse a date from these instructions or from another leg. Omit this field entirely if no date/time is visible for this leg.`,
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

      // CRITICAL: Immediate memory release
      req.body.image = null;
      imageData = null;

      const rawText = response.text;
      if (!rawText) {
        throw new Error('Gemini OCR returned an empty text response.');
      }

      // Safe parse to verify structure and log raw extraction
      let parsedData = JSON.parse(rawText.trim());
      console.log('\n=================== [RAW GEMINI OCR RESPONSE FROM SERVER] ===================');
      console.log(JSON.stringify(parsedData, null, 2));
      console.log('=============================================================================\n');
      
      const resData = res.json(parsedData);
      
      // Cleanup local references
      (parsedData as any) = null;
      
      return resData;
    } catch (err: any) {
      // Ensure memory is released even on error
      req.body.image = null;
      imageData = null;
      
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
    } finally {
      // Final attempt to help GC
      if (global.gc) {
        global.gc();
      }
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
    // Production serving with aggressive static asset caching
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, {
      maxAge: '1y',
      immutable: true,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }));
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
