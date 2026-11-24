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
  app.use(express.json({ limit: '25mb' }));

  // Middleware to catch body-parser errors (like PayloadTooLargeError or malformed JSON) and return JSON
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err && req.path.startsWith('/api')) {
      const status = err.status || err.statusCode || 400;
      console.error(`[API MIDDLEWARE ERROR] ${req.method} ${req.path} failed with status ${status}:`, err.message);
      res.setHeader('Content-Type', 'application/json');
      return res.status(status).json({
        error: err.type === 'entity.too.large' 
          ? 'Image payload is too large. Please upload an image under 15MB.'
          : err.message || 'Invalid request payload format.',
        code: err.type === 'entity.too.large' ? 'PAYLOAD_TOO_LARGE' : 'INVALID_REQUEST',
        retryable: err.type === 'entity.too.large',
      });
    }
    next(err);
  });

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

  // Helper to resolve secrets from process.env (including /etc/secrets/.env on Render) or individual Render Secret Files (/etc/secrets/<KEY>)
  const readEnvOrRenderSecret = (names: string[]): string => {
    for (const name of names) {
      const val = process.env[name];
      if (typeof val === 'string' && val.trim().length > 0) {
        return val.trim();
      }
    }
    for (const name of names) {
      const secretFilePath = path.join('/etc/secrets', name);
      if (fs.existsSync(secretFilePath)) {
        try {
          const content = fs.readFileSync(secretFilePath, 'utf8').trim();
          if (content.length > 0) {
            return content;
          }
        } catch {
          // Ignore unreadable secret file
        }
      }
    }
    return '';
  };

  const getGeminiApiKey = () => readEnvOrRenderSecret(['GEMINI_API_KEY']);
  const getGroqApiKey = () => readEnvOrRenderSecret(['GROQ_API_KEY', 'GROK_API_KEY']);
  const getGroqPrimaryModel = () => (process.env.GROQ_OCR_MODEL || process.env.GROK_OCR_MODEL || 'qwen/qwen3.8-27b').trim();
  const getGroqFallbackModel = () => 'meta-models/muse-spark-open';

  let cachedGeminiKey = '';
  let cachedGeminiClient: GoogleGenAI | null = null;
  const getGeminiClient = () => {
    const key = getGeminiApiKey();
    if (!key) return null;
    if (!cachedGeminiClient || cachedGeminiKey !== key) {
      cachedGeminiKey = key;
      cachedGeminiClient = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
          timeout: 32000,
        },
      });
    }
    return cachedGeminiClient;
  };

  // Lightweight in-memory OCR usage & rate-limit tracker (per rolling UTC day & 60s window)
  const getUtcDayKey = () => new Date().toISOString().slice(0, 10);
  type ProviderUsageState = {
    dayKey: string;
    recentTimestamps: number[];
    requestsToday: number;
    tokensToday: number;
    lastTokens: number | null;
    lastCostUsd: number | null;
    lastScanAt: string | null;
    lastErrorCode: string | null;
    rateLimitHeaders: {
      limitRequests?: string | null;
      remainingRequests?: string | null;
      limitTokens?: string | null;
      remainingTokens?: string | null;
      resetRequests?: string | null;
      resetTokens?: string | null;
    } | null;
  };

  const createEmptyUsageState = (): ProviderUsageState => ({
    dayKey: getUtcDayKey(),
    recentTimestamps: [],
    requestsToday: 0,
    tokensToday: 0,
    lastTokens: null,
    lastCostUsd: null,
    lastScanAt: null,
    lastErrorCode: null,
    rateLimitHeaders: null,
  });

  const ocrUsageTracker: Record<'gemini' | 'groq', ProviderUsageState> = {
    gemini: createEmptyUsageState(),
    groq: createEmptyUsageState(),
  };

  const refreshUsageWindow = (state: ProviderUsageState) => {
    const today = getUtcDayKey();
    if (state.dayKey !== today) {
      state.dayKey = today;
      state.requestsToday = 0;
      state.tokensToday = 0;
      state.lastErrorCode = null;
    }
    const cutoff = Date.now() - 60000;
    state.recentTimestamps = state.recentTimestamps.filter((ts) => ts >= cutoff);
  };

  const recordOcrAttempt = (
    providerId: 'gemini' | 'groq',
    metrics: {
      tokens?: number | null;
      costUsd?: number | null;
      errorCode?: string | null;
      rateLimitHeaders?: ProviderUsageState['rateLimitHeaders'];
    }
  ) => {
    const state = ocrUsageTracker[providerId];
    refreshUsageWindow(state);
    const nowMs = Date.now();
    state.recentTimestamps.push(nowMs);
    state.requestsToday += 1;
    state.lastScanAt = new Date(nowMs).toISOString();
    if (typeof metrics.tokens === 'number' && !isNaN(metrics.tokens)) {
      state.tokensToday += metrics.tokens;
      state.lastTokens = metrics.tokens;
    }
    if (typeof metrics.costUsd === 'number' && !isNaN(metrics.costUsd)) {
      state.lastCostUsd = metrics.costUsd;
    }
    if (metrics.rateLimitHeaders) {
      state.rateLimitHeaders = metrics.rateLimitHeaders;
    }
    state.lastErrorCode = metrics.errorCode || null;
  };

  const buildProviderPayload = () => {
    refreshUsageWindow(ocrUsageTracker.gemini);
    refreshUsageWindow(ocrUsageTracker.groq);
    const geminiAvailable = Boolean(getGeminiApiKey());
    const groqAvailable = Boolean(getGroqApiKey());
    const groqModel = getGroqPrimaryModel();

    return {
      gemini: {
        id: 'gemini',
        name: 'Gemini',
        label: 'Gemini 3.5 Flash Lite',
        model: 'gemini-3.5-flash-lite',
        fallbackModel: 'gemini-3.8-flash',
        available: geminiAvailable,
        envHint: 'GEMINI_API_KEY',
        freeTier: true,
        billingModel: 'Free Tier Supported',
        limits: {
          rpm: 15,
          rpd: 500,
          tpm: 250000,
          resetNote: 'Free tier (~15 RPM, ~500 RPD, 250k TPM) resets daily at midnight Pacific Time and is shared across your Google AI Studio project.',
        },
        usage: {
          requestsLastMinute: ocrUsageTracker.gemini.recentTimestamps.length,
          requestsToday: ocrUsageTracker.gemini.requestsToday,
          tokensToday: ocrUsageTracker.gemini.tokensToday,
          lastTokens: ocrUsageTracker.gemini.lastTokens,
          lastCostUsd: null,
          lastScanAt: ocrUsageTracker.gemini.lastScanAt,
          lastErrorCode: ocrUsageTracker.gemini.lastErrorCode,
          rateLimitHeaders: null,
        },
      },
      groq: {
        id: 'groq',
        name: 'Groq',
        label: `Groq Vision (${groqModel})`,
        model: groqModel,
        fallbackModel: getGroqFallbackModel(),
        available: groqAvailable,
        envHint: 'GROQ_API_KEY or GROK_API_KEY',
        freeTier: true,
        billingModel: 'Free Tier Supported',
        limits: {
          rpm: 30,
          rpd: 1000,
          tpm: 8000,
          tpd: 200000,
          resetNote: 'Groq Free Tier (~30 RPM, ~1,000 RPD, ~7k input / ~1k output TPM, ~200k TPD on Qwen 3.8 27B) is completely free and shared across your Groq Console organization (console.groq.com/settings/limits).',
        },
        usage: {
          requestsLastMinute: ocrUsageTracker.groq.recentTimestamps.length,
          requestsToday: ocrUsageTracker.groq.requestsToday,
          tokensToday: ocrUsageTracker.groq.tokensToday,
          lastTokens: ocrUsageTracker.groq.lastTokens,
          lastCostUsd: null,
          lastScanAt: ocrUsageTracker.groq.lastScanAt,
          lastErrorCode: ocrUsageTracker.groq.lastErrorCode,
          rateLimitHeaders: ocrUsageTracker.groq.rateLimitHeaders,
        },
      },
    };
  };

  // Endpoint to report configured OCR providers & usage limits without exposing secret values
  app.get('/api/ocr-providers', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    return res.json({
      providers: buildProviderPayload(),
    });
  });

  // TASK 2: Secure Betslip Scanner Server Endpoint with AbortController, Timeout, and Structured Logging
  app.post('/api/scan-betslip', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const startTime = Date.now();
    let currentStage = 'request_received';
    let imageData: string | null = req.body.image;
    let mimeType: string = req.body.mimeType || 'image/jpeg';
    const rawProvider = typeof req.body.provider === 'string' ? req.body.provider.trim().toLowerCase() : 'gemini';
    const isGroqAlias = rawProvider === 'groq' || rawProvider === 'grok';
    const provider: 'gemini' | 'groq' = isGroqAlias ? 'groq' : 'gemini';
    let abortTimeout: NodeJS.Timeout | null = null;
    let capturedRateHeaders: ProviderUsageState['rateLimitHeaders'] = null;

    try {
      console.log(`[BETSLIP OCR] [stage=${currentStage}] HTTP request received from ${req.ip} (provider=${provider}, content-length: ${req.headers['content-length'] || 'unknown'})`);

      currentStage = 'request_validation';
      if (req.body.provider !== undefined && rawProvider !== 'gemini' && !isGroqAlias) {
        return res.status(400).json({
          error: `Unsupported OCR provider "${req.body.provider}". Choose "gemini" or "groq".`,
          code: 'INVALID_PROVIDER',
          retryable: false,
          stage: currentStage,
        });
      }

      if (!imageData || typeof imageData !== 'string' || !imageData.trim()) {
        console.warn(`[BETSLIP OCR] [stage=${currentStage}] ❌ Rejected: Missing or invalid image data`);
        return res.status(400).json({
          error: 'Missing image base64 data.',
          code: 'INVALID_REQUEST',
          retryable: false,
          stage: currentStage,
        });
      }
      console.log(`[BETSLIP OCR] [stage=${currentStage}] Request body validated`);

      currentStage = 'image_validation';
      // Clean base64 data in case a data-URL prefix was sent
      if (imageData.includes(';base64,')) {
        const parts = imageData.split(';base64,');
        mimeType = parts[0].replace('data:', '') || mimeType;
        imageData = parts[1];
      }

      const payloadSizeKb = Math.round((imageData.length * 0.75) / 1024);
      console.log(`[BETSLIP OCR] [stage=${currentStage}] Image validated: ${payloadSizeKb} KB, MIME: ${mimeType}, provider: ${provider}`);

      // Check selected provider API key
      const geminiClient = provider === 'gemini' ? getGeminiClient() : null;
      const groqApiKey = provider === 'groq' ? getGroqApiKey() : '';

      if (provider === 'gemini' && !geminiClient) {
        console.error(`[BETSLIP OCR] [stage=${currentStage}] ❌ GEMINI_API_KEY environment variable is missing`);
        return res.status(500).json({
          error: 'GEMINI_API_KEY environment variable is not configured. Please set it in Settings > Secrets or Render Environment Variables.',
          code: 'GEMINI_AUTH',
          provider,
          retryable: false,
          stage: currentStage,
        });
      }

      if (provider === 'groq' && !groqApiKey) {
        console.error(`[BETSLIP OCR] [stage=${currentStage}] ❌ GROQ_API_KEY / GROK_API_KEY environment variable is missing`);
        return res.status(500).json({
          error: 'GROQ_API_KEY (or GROK_API_KEY) environment variable is not configured. Please add it in Settings > Secrets or Render Environment Variables.',
          code: 'GROQ_AUTH',
          provider,
          retryable: false,
          stage: currentStage,
        });
      }

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      const currentDay = now.getDate();
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const currentMonthName = monthNames[currentMonth - 1];

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
   - TOTAL ODDS / SLIP ODDS (CRITICAL - HIGHEST PRIORITY):
     * Prioritize extracting the literal "Total odds" value printed at the summary/footer section at the bottom of the slip (e.g. "Total odds 9.01", "Total Odds: 9.01", "Cota total: 3.34", "Odds: 2.79", or "Cotação total").
     * You MUST extract and store this exact printed total odds value visible on the slip (e.g. 9.01, 2.79, 3.34) as the official total odds.
     * DO NOT derive or compute it by multiplying individual selection odds together, because bookmakers frequently apply accumulator boosts, combo bonuses, or promotional boosts that change the final printed value.
     * Set top-level 'total_odds' to this exact printed total odds value from the summary footer.
     * Set top-level 'odds' to this same printed total odds.

2. CURRENT YEAR & DATE HANDLING (CRITICAL):
   - Current calendar context: Today is ${currentDay} ${currentMonthName} ${currentYear} (Date: ${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}).
   - Sports betting tickets almost ALWAYS contain events occurring in the CURRENT MONTH (${currentMonthName}), the preceding month, or the next upcoming month.
   - EUROPEAN DATE FORMAT (DD/MM) MANDATE:
     * Dates on sports betting tickets (such as "02/09", "15/08", "03/10") are in European DD/MM format (Day first, then Month).
     * For example, a printed "02/09" means Day 02 of Month 09 (${currentMonthName} 2nd) -> ISO "${currentYear}-09-02", NEVER February 9th ("${currentYear}-02-09")!
     * "05/09" means Day 05 of Month 09 (${currentMonthName} 5th) -> ISO "${currentYear}-09-05", NEVER May 9th!
     * "12/08" means Day 12 of Month 08 (August 12th) -> ISO "${currentYear}-08-12", NEVER December 8th!
     * If the date digits could be interpreted as either DD/MM or MM/DD, ALWAYS choose the one whose month is the CURRENT MONTH (${currentMonthName}) or adjacent month.
     * When a date is shown without an explicit year, use ${currentYear}, and combine it with the DD/MM and time into ISO format YYYY-MM-DDTHH:mm.
     * NEVER output past years unless explicitly printed on the physical slip.
     * If no date/time is visible anywhere on the slip for the top-level 'placed_at' field, output an empty string "".

2b. 'placed_at' vs 'event_date' ARE DIFFERENT FIELDS, EVEN WHEN THEY ARE VISUALLY CLOSE (CRITICAL):
   - 'placed_at' (top-level) is the timestamp of the TICKET/SLIP ITSELF — where the bet was placed. It is normally found in ONE of these specific structural positions, and NOWHERE else:
     * In the slip's top header, next to words like "Combo", "Múltipla", "Acumulador a partir", "Aposta realizada", or next to the ticket/bet type label.
     * In the slip's footer/bottom area, next to "Ticket ID", "ID:", a bet reference number, or alongside Total Odds / Total Stake / Total Win summary rows.
   - 'event_date' (per leg, REQUIRED on every leg) is the KICKOFF date/time of that specific match. It is ALWAYS printed INSIDE or DIRECTLY ABOVE that leg's own block/card/row, immediately next to (or just above) that leg's team names, league name, or sport icon. It is NEVER found in the ticket's global header or footer area.
   - DO NOT be misled by proximity or similarity: on many real slips, 'placed_at' and the FIRST leg's 'event_date' fall on the same calendar date and can be only minutes apart in printed time (e.g. slip placed at 20:19 for a match kicking off at 19:30 the same day — a live/in-play bet). Being close in time or on the same date does NOT make them the same field. Judge strictly by WHERE on the slip each timestamp is printed (global ticket area vs. inside a specific leg's block), never by which value seems more "sensible" as a default.
   - Extract 'placed_at' ONLY from the global ticket header/footer position described above. Never copy a per-leg kickoff time into 'placed_at', and never copy 'placed_at' into any leg's 'event_date'.
   - Extract EACH leg's 'event_date' independently by re-reading the timestamp printed inside that specific leg's own block. Do not reuse the ticket's global placed_at value, and do not reuse one leg's date/time for a different leg unless that exact same date/time is separately and explicitly printed inside that other leg's own block too.
   - RELATIVE DAY LABELS ON A LEG (e.g. "Today", "Hoje", "Live", "Ao Vivo", an in-play match clock like "70' 2nd half", or a live score like "0:0"): these still belong to that leg's own 'event_date', combined with whatever explicit clock time is printed in that same leg's block (e.g. "Today, 16:30" -> today's date + 16:30).
   - BARE TIME WITH NO DATE ON A LEG (e.g. a leg block shows only "19:30" or "20:30" without any date, common on compact multi-leg summaries): the date for that leg is the same calendar date as the slip's own placed_at/ticket date (unless a different day is explicitly labeled next to that leg, e.g. "Amanhã"/"Tomorrow"). Combine that inferred date with the TIME actually printed inside that leg's block — never with the placed_at TIME.
   - WORKED EXAMPLE (bare time, no date, ticket has its own global timestamp): a leg block shows "Dortmund  19:30  Bayern Munique" with no date printed inside that block, while the ticket's global footer shows a placement timestamp like "22/08/26, 17:46". In this case: event_date = ticket's own date (22/08/2026) + that leg's own printed time (19:30) -> "2026-08-22T19:30". The placed_at TIME (17:46) must NEVER appear in any leg's event_date, even though the placed_at DATE may be reused when a leg has no date of its own. Apply this same logic independently to every leg in the ticket, using each leg's own printed time (e.g. 19:30, 19:45, 20:30), never the placed_at time repeated across legs.
   - 'event_date' is a REQUIRED field on every leg and can never be omitted from the JSON. If, after checking the leg's own block specifically, truly no date or time is printed there at all AND the ticket-level placed_at date cannot reasonably apply either, output an empty string "" for that leg's event_date. Never leave the field out of the JSON, and never fill it with the placed_at TIME as a substitute.
   - SELF-CHECK BEFORE FINALIZING (CRITICAL): before producing your final JSON output, re-scan the 'legs' array you are about to return. For every leg where you were about to output an empty event_date, go back to that leg's own block in the image and check again for a printed time (even a bare time like "19:30" with no date, per the bare-time rule above). Only output an empty string after this second check confirms no time is printed anywhere in that leg's block. It is a mistake to extract event_date for some legs correctly and leave others empty on the same ticket when all legs share the same visible time format — treat inconsistent extraction across legs of the same ticket as a signal to re-check, not as an acceptable outcome.

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
   - DISAMBIGUATING A COMBO MARKET (single leg) FROM A BET BUILDER (multiple legs) — CRITICAL: The deciding factor is NOT whether the market/selection text contains '&', a comma, or the word 'and'/'e'. The deciding factor is whether EACH row/selection has its OWN individually printed odds value directly next to it:
     * If a row (even one whose market name is itself a combination, like '1x2 & Total' or 'Fenerbahce & Over 1.5') has its own individual odds printed right beside it, AND that row was selected/highlighted as a single bet slip entry, it is ONE single independent leg. Do NOT split it. Do NOT assign a builder_id. Extract its full market/selection text as-is, even if it contains '&' or 'e'.
     * Only split into multiple legs sharing a builder_id when there is NO individual odds printed per sub-selection row, and only ONE combined odds value covers the whole block — this is the true Bet Builder case.
   - Before applying the 'NEVER CONDENSE' self-check below, first apply this disambiguation check. The self-check for condensed Bet Builder sub-selections only applies within a confirmed Bet Builder block (Case B) — never to a single combo-market leg (Case A) that merely has '&' in its own market/selection name.
   - NEVER CONDENSE MULTIPLE SUB-SELECTIONS INTO ONE LEG (CRITICAL): Within a single Bet Builder block, if you see MULTIPLE distinct market/pick rows stacked vertically (e.g. one row showing 'Double chance' -> 'Draw or Team X', and a separate row below it showing 'Total' -> 'Over 1.5'), these are TWO SEPARATE leg objects, NOT one. NEVER join multiple market names or multiple selection picks together with commas, slashes, ampersands, or the word 'and' into a single leg's 'market' or 'selection' field (e.g. 'Double chance, Total' or 'Como or draw, Over 1.5' are WRONG — these must be split into two separate leg entries). Each visually distinct market/pick row within the Bet Builder block, no matter how many there are, becomes its own leg object with its own 'market' and 'selection' fields, ALL sharing the same 'builder_id' and the same 'builder_odds' (the block's single combined odds value, not divided or altered per sub-selection).
   - WORKED EXAMPLE: A Bet Builder block titled 'Como vs. RB Leipzig' with Combined Odds 1.40 shows two stacked rows: Row 1 = 'Double chance' / 'Como or draw'; Row 2 = 'Total' / 'Over 1.5'. This MUST produce two leg objects:
     Leg A: { event: 'Como vs. RB Leipzig', market: 'Double chance', selection: 'Como or draw', builder_id: 'builder_1', builder_odds: 1.40, odds_decimal: 1.40 }
     Leg B: { event: 'Como vs. RB Leipzig', market: 'Total', selection: 'Over 1.5', builder_id: 'builder_1', builder_odds: 1.40, odds_decimal: 1.40 }
     NOT a single leg with market 'Double chance, Total' and selection 'Como or draw, Over 1.5'.
   - SELF-CHECK BEFORE FINALIZING: before returning the JSON, scan every leg whose 'market' or 'selection' field contains a comma, slash, semicolon, or the word 'and'/'e' joining two distinct-sounding market types (e.g. 'Double chance' and 'Total' in the same string) — this is a strong signal that two sub-selections were incorrectly condensed into one leg. Split them into separate leg objects sharing the same builder_id before finalizing.
   - MULTIPLE BET BUILDERS & MIXED COMBOS: A ticket can contain MULTIPLE Bet Builders (e.g., Bet Builder 1 @ 4.50, Bet Builder 2 @ 2.83) OR a mix of Bet Builders and Single bets (e.g., Bet Builder 1 @ 4.50 + Single @ 1.47 + Single @ 2.66).
     * Extract each independent single leg with its odds, and each Bet Builder group with its builder_odds.
   - On Portuguese / European slips showing market descriptor lines above or next to match names (e.g., "[Team] para marcar em ambas as partes", "Ambas as equipas marcam", "Total de Golos", "[Team] a marcar"):
     * Map the market description text into 'market' (e.g. "Sirius para marcar em ambas as partes" or "Ambas Marcam (BTTS)").
     * Map the pick answer into 'selection' (e.g. "Sim", "Não", "Over 2.5").
     * NEVER omit 'market' or leave it empty when a market descriptor header is visible on the slip.`;

      // Set up server-side AbortController with an 80s hard safety timeout (accommodates primary retries + fallback model)
      const controller = new AbortController();
      abortTimeout = setTimeout(() => {
        console.warn(`[BETSLIP OCR] ⏱️ Timeout reached (80s) -> aborting ${provider.toUpperCase()} API call`);
        controller.abort();
      }, 80000);

      // Helper to identify 503/UNAVAILABLE or temporary high demand spikes
      function is503UnavailableError(error: any): boolean {
        if (!error) return false;
        const status = error.status || error.statusCode || error.code;
        if (status === 503 || status === '503') return true;
        const msg = String(error.message || error || '').toLowerCase();
        return (
          msg.includes('503') ||
          msg.includes('unavailable') ||
          msg.includes('high demand') ||
          msg.includes('overloaded') ||
          msg.includes('service unavailable') ||
          msg.includes('spikes in demand')
        );
      }

      // Helper to identify transient upstream failures/timeouts that warrant backup model fallback
      function isTransientFallbackError(error: any): boolean {
        if (!error) return false;
        if (is503UnavailableError(error)) return true;
        const status = error.status || error.statusCode || error.code;
        if (status === 502 || status === 504 || status === 500) return true;
        const msg = String(error.message || error || '').toLowerCase();
        return (
          msg.includes('timeout') ||
          msg.includes('timed out') ||
          msg.includes('abort') ||
          msg.includes('econnreset') ||
          msg.includes('socket') ||
          msg.includes('502') ||
          msg.includes('504')
        );
      }

      const retryDelays = [1500, 3500]; // 1.5s, 3.5s quick backoff delays so backup model keeps >=40s runway
      let usedFallbackModel = false;
      let modelUsed = provider === 'groq' ? getGroqPrimaryModel() : 'gemini-3.5-flash-lite';
      let rawText = '';
      let extractedTokens: number | null = null;

      if (provider === 'gemini' && geminiClient) {
        currentStage = 'gemini_request';
        console.log(`[BETSLIP OCR] [stage=${currentStage}] Starting Gemini request (primary: gemini-3.5-flash-lite, timeout: 80s)...`);

        let response: any = null;
        let lastError: any = null;

        const geminiConfig = {
          responseMimeType: 'application/json',
          temperature: 0,
          abortSignal: controller.signal,
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
                description: 'Total combined odds directly printed on the slip footer/summary (or single bet odds). Extract printed number directly without multiplying legs.',
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
                description: `The bet-slip's own placement/issue timestamp ONLY (e.g. a receipt or "ticket generated" line), NOT any match kickoff time — see rule 2b. ISO string YYYY-MM-DD or YYYY-MM-DDTHH:mm using current year ${currentYear}. If no distinct placement timestamp is visible on the slip, output an empty string "" — do not default to today's date.`,
              },
              bet_id: {
                type: Type.STRING,
                description: 'Unique slip identifier/ticket number.',
              },
              total_odds: {
                type: Type.NUMBER,
                description: 'Total combined odds directly printed on the ticket slip summary/footer (e.g. "Total odds", "Cota total"). Do not calculate by multiplying legs.',
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
                      description: `Kickoff date/time exactly as printed on THIS slip, in ISO format YYYY-MM-DDTHH:mm, using current year ${currentYear} if no year is shown. Read the actual digits from the image — never reuse a date from these instructions or from another leg. This field is REQUIRED and must always be present in the JSON. If, after a careful second check of this specific leg's own block, truly no date or time is printed there, output an empty string "" — never omit the field entirely.`,
                    },
                  },
                  required: ['event', 'selection', 'event_date'],
                },
              },
            },
            required: ['bookmaker', 'stake', 'status', 'legs'],
          },
        };

        const contents = [
          {
            inlineData: {
              mimeType: mimeType || 'image/jpeg',
              data: imageData,
            },
          },
          {
            text: prompt,
          },
        ];

        // 1. Primary Model: gemini-3.5-flash-lite with up to 2 quick retries (1.5s, 3.5s) while within 35s budget
        for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
          if (controller.signal.aborted) {
            throw new Error('Gemini OCR request timed out or was aborted.');
          }

          try {
            if (attempt > 0) {
              console.log(`[BETSLIP OCR] [stage=${currentStage}] Executing retry ${attempt}/${retryDelays.length} with primary model gemini-3.5-flash-lite...`);
            }

            response = await geminiClient.models.generateContent({
              model: 'gemini-3.5-flash-lite',
              contents,
              config: geminiConfig,
            });

            modelUsed = 'gemini-3.5-flash-lite';
            break; // Succeeded
          } catch (err: any) {
            lastError = err;
            const isTransient = isTransientFallbackError(err);
            const hasMoreRetries = attempt < retryDelays.length;
            const elapsedSoFar = Date.now() - startTime;

            // Non-transient errors (e.g. 400, 403, 429): do NOT retry; bail immediately
            if (!isTransient) {
              console.error(`[BETSLIP OCR] [stage=${currentStage}] Non-retryable Gemini error encountered (${err.message}). Aborting retries immediately.`);
              throw err;
            }

            // If we already spent >= 35s on primary, stop retrying primary immediately so fallback gets >=40s
            if (hasMoreRetries && !controller.signal.aborted && elapsedSoFar < 35000) {
              const waitMs = retryDelays[attempt];
              console.warn(`[BETSLIP OCR] [stage=${currentStage}] ⚠️ Transient error on attempt ${attempt + 1} (${elapsedSoFar}ms elapsed). Waiting ${waitMs / 1000}s before retry (${attempt + 1}/${retryDelays.length})... [${err.message}]`);
              await new Promise((res) => setTimeout(res, waitMs));
            } else {
              console.warn(`[BETSLIP OCR] [stage=${currentStage}] Switching away from primary gemini-3.5-flash-lite (${elapsedSoFar}ms elapsed): ${err.message}`);
              break;
            }
          }
        }

        // 2. Fallback Model: gemini-3.8-flash if primary failed with transient 503/timeout
        if (!response) {
          if (isTransientFallbackError(lastError) && !controller.signal.aborted) {
            console.warn(`[BETSLIP OCR] [stage=${currentStage}] [FALLBACK] Automatically switching to backup engine 'gemini-3.8-flash' (${Date.now() - startTime}ms elapsed)...`);
            try {
              response = await geminiClient.models.generateContent({
                model: 'gemini-3.8-flash',
                contents,
                config: geminiConfig,
              });
              usedFallbackModel = true;
              modelUsed = 'gemini-3.8-flash';
              console.log(`[BETSLIP OCR] [stage=${currentStage}] [FALLBACK] Successfully extracted betslip using backup model 'gemini-3.8-flash'!`);
            } catch (fallbackErr: any) {
              console.error(`[BETSLIP OCR] [stage=${currentStage}] [FALLBACK] Backup engine gemini-3.8-flash also failed: ${fallbackErr.message}`);
              throw fallbackErr;
            }
          } else if (lastError) {
            throw lastError;
          }
        }

        currentStage = 'gemini_response';
        rawText = response?.text || '';
        const meta = response?.usageMetadata;
        if (meta && typeof meta.totalTokenCount === 'number') {
          extractedTokens = meta.totalTokenCount;
        }
      } else {
        // Provider: Groq Cloud (console.groq.com OpenAI-compatible Vision API)
        currentStage = 'groq_request';
        const primaryGroqModel = getGroqPrimaryModel();
        const fallbackGroqModel = getGroqFallbackModel();
        console.log(`[BETSLIP OCR] [stage=${currentStage}] Starting Groq request (primary: ${primaryGroqModel}, timeout: 65s)...`);

        // Concise, token-efficient prompt tailored for Groq free-tier (~7,000 input TPM limit)
        const groqPrompt = `Extract all sports betting slip data into valid JSON matching the schema. Today: ${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(currentDay).padStart(2, '0')} (${currentMonthName} ${currentYear}).

Rules:
1. Bookmaker: Read literal wordmark/logo first (e.g., Betclic, 22Bet, BC.GAME, ReloadBet, Bet365, Pinnacle). Return null only if no brand is visible.
2. Sport: Infer from teams/players/leagues/icons. Must be one of: "Football", "Basketball", "Tennis", "Baseball", "Ice Hockey", "Esports", "MMA", "Golf", or null. Set per leg and top-level.
3. Odds & Stake: Use decimal odds. For total_odds/odds, extract the literal printed footer "Total odds" / "Cota total" (do NOT multiply legs).
4. Dates (European DD/MM): "02/09" -> "${currentYear}-09-02" (prefer ${currentMonthName} or adjacent months). Format ISO "YYYY-MM-DDTHH:mm" using ${currentYear} if year omitted.
   - placed_at: Ticket placement/issue timestamp ONLY (near header/Ticket ID/footer), or "". Never copy a match kickoff time here.
   - event_date (required on every leg): Match kickoff time inside that leg's own row/card. If only a bare time (e.g. "19:30") is shown on a leg, combine the ticket's calendar date with THAT leg's time (never placed_at's time). Output "" only if no date/time exists in that leg's row.
5. Status & Live: status in ["pending","won","lost","void","cashout"]. is_live=true if LIVE badge, red dot, match clock, or live score is shown.
6. Legs & Bet Builders: Extract EVERY selection in legs[]. On ReloadBet-style rows: bold pick=selection, top-right=odds_decimal, middle=market, bottom=event.
   - Combo market vs Bet Builder: If a single row (even with "&" like "1x2 & Total") has its own individual odds beside it, keep it as 1 standalone leg (builder_id=null).
   - True Bet Builder ("Bet Builder", "Criar Aposta", "Same Game Parlay"): Sub-rows have NO individual odds; one combined odds covers the block. Split EVERY stacked sub-row into separate leg objects (NEVER join markets/picks with commas or "&"), all sharing the same builder_id ("builder_1", etc.) and builder_odds (= combined block odds; also put in odds_decimal).`;

        const groqJsonSchema = {
          type: 'object',
          additionalProperties: false,
          properties: {
            bookmaker: { type: ['string', 'null'] },
            event: { type: ['string', 'null'] },
            market: { type: ['string', 'null'] },
            selection: { type: ['string', 'null'] },
            sport: {
              anyOf: [
                {
                  type: 'string',
                  enum: ['Football', 'Basketball', 'Tennis', 'Baseball', 'Ice Hockey', 'Esports', 'MMA', 'Golf'],
                },
                { type: 'null' },
              ],
            },
            odds: { type: ['number', 'null'] },
            stake: { type: 'number' },
            potentialPayout: { type: ['number', 'null'] },
            status: { type: 'string' },
            is_live: { type: ['boolean', 'null'] },
            market_type: { type: ['string', 'null'] },
            placed_at: { type: ['string', 'null'] },
            bet_id: { type: ['string', 'null'] },
            total_odds: { type: ['number', 'null'] },
            legs: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  event: { type: 'string' },
                  selection: { type: 'string' },
                  team: { type: ['string', 'null'] },
                  market: { type: ['string', 'null'] },
                  sport: {
                    anyOf: [
                      {
                        type: 'string',
                        enum: ['Football', 'Basketball', 'Tennis', 'Baseball', 'Ice Hockey', 'Esports', 'MMA', 'Golf'],
                      },
                      { type: 'null' },
                    ],
                  },
                  odds_decimal: { type: ['number', 'null'] },
                  builder_id: { type: ['string', 'null'] },
                  builder_odds: { type: ['number', 'null'] },
                  event_date: { type: 'string' },
                },
                required: ['event', 'selection', 'team', 'market', 'sport', 'odds_decimal', 'builder_id', 'builder_odds', 'event_date'],
              },
            },
          },
          required: [
            'bookmaker',
            'event',
            'market',
            'selection',
            'sport',
            'odds',
            'stake',
            'potentialPayout',
            'status',
            'is_live',
            'market_type',
            'placed_at',
            'bet_id',
            'total_odds',
            'legs',
          ],
        };

        const callGroqModel = async (targetModel: string, useStrictSchema: boolean = true): Promise<string> => {
          const schemaReminder = useStrictSchema
            ? ''
            : '\n\nReturn ONLY JSON with keys: bookmaker, event, market, selection, sport, odds, stake, potentialPayout, status, is_live, market_type, placed_at, bet_id, total_odds, legs ([{event, selection, team, market, sport, odds_decimal, builder_id, builder_odds, event_date}]).';

          const payload: any = {
            model: targetModel,
            temperature: 0,
            max_completion_tokens: 850,
            messages: [
              {
                role: 'system',
                content: 'Sports betslip OCR engine. Output only valid JSON matching the schema.',
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:${mimeType || 'image/jpeg'};base64,${imageData}`,
                    },
                  },
                  {
                    type: 'text',
                    text: `${groqPrompt}${schemaReminder}`,
                  },
                ],
              },
            ],
            response_format: useStrictSchema
              ? {
                  type: 'json_schema',
                  json_schema: {
                    name: 'betslip_extraction',
                    strict: true,
                    schema: groqJsonSchema,
                  },
                }
              : { type: 'json_object' },
          };

          const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${groqApiKey}`,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });

          const headerObj: ProviderUsageState['rateLimitHeaders'] = {
            limitRequests: groqRes.headers.get('x-ratelimit-limit-requests'),
            remainingRequests: groqRes.headers.get('x-ratelimit-remaining-requests'),
            limitTokens: groqRes.headers.get('x-ratelimit-limit-tokens'),
            remainingTokens: groqRes.headers.get('x-ratelimit-remaining-tokens'),
            resetRequests: groqRes.headers.get('x-ratelimit-reset-requests'),
            resetTokens: groqRes.headers.get('x-ratelimit-reset-tokens'),
          };
          if (Object.values(headerObj).some((v) => v !== null && v !== '')) {
            capturedRateHeaders = headerObj;
          }

          const rawBody = await groqRes.text();
          if (!groqRes.ok) {
            let errMessage = rawBody;
            try {
              const parsedErr = JSON.parse(rawBody);
              errMessage = parsedErr?.error?.message || parsedErr?.error || parsedErr?.message || rawBody;
            } catch {
              // keep raw text
            }
            const err: any = new Error(errMessage || `Groq API error (HTTP ${groqRes.status})`);
            err.status = groqRes.status;
            err.statusCode = groqRes.status;
            throw err;
          }

          const groqJson = JSON.parse(rawBody);
          if (groqJson?.usage && typeof groqJson.usage.total_tokens === 'number') {
            extractedTokens = groqJson.usage.total_tokens;
          }
          const msgContent = groqJson?.choices?.[0]?.message?.content;
          if (typeof msgContent === 'string') {
            return msgContent;
          }
          if (Array.isArray(msgContent)) {
            return msgContent
              .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
              .join('')
              .trim();
          }
          return '';
        };

        const callGroqWithSchemaFallback = async (targetModel: string): Promise<string> => {
          try {
            return await callGroqModel(targetModel, true);
          } catch (schemaErr: any) {
            const msg = String(schemaErr?.message || '').toLowerCase();
            if (schemaErr?.status === 400 && (msg.includes('response_format') || msg.includes('json_schema') || msg.includes('schema') || msg.includes('reasoning') || msg.includes('strict'))) {
              console.warn(`[BETSLIP OCR] [stage=${currentStage}] Strict json_schema rejected for ${targetModel}, retrying with json_object mode...`);
              return await callGroqModel(targetModel, false);
            }
            throw schemaErr;
          }
        };

        let lastGroqError: any = null;
        for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
          if (controller.signal.aborted) {
            throw new Error('Groq OCR request timed out or was aborted.');
          }

          try {
            if (attempt > 0) {
              console.log(`[BETSLIP OCR] [stage=${currentStage}] Executing retry ${attempt}/${retryDelays.length} with primary model ${primaryGroqModel}...`);
            }
            rawText = await callGroqWithSchemaFallback(primaryGroqModel);
            modelUsed = primaryGroqModel;
            break;
          } catch (err: any) {
            lastGroqError = err;
            const isUnavailable = is503UnavailableError(err);
            const hasMoreRetries = attempt < retryDelays.length;

            if (!isUnavailable) {
              console.error(`[BETSLIP OCR] [stage=${currentStage}] Groq non-503 error (${err.status || 'unknown'}: ${err.message}).`);
              break;
            }

            if (hasMoreRetries && !controller.signal.aborted) {
              const waitMs = retryDelays[attempt];
              console.warn(`[BETSLIP OCR] [stage=${currentStage}] ⚠️ Groq 503/UNAVAILABLE on attempt ${attempt + 1}. Waiting ${waitMs / 1000}s before retry... [${err.message}]`);
              await new Promise((res) => setTimeout(res, waitMs));
            } else {
              break;
            }
          }
        }

        const errMsgLower = String(lastGroqError?.message || '').toLowerCase();
        const isModelMissingOrDecommissioned =
          lastGroqError?.status === 404 ||
          errMsgLower.includes('decommissioned') ||
          errMsgLower.includes('not found') ||
          errMsgLower.includes('does not exist');

        if (!rawText) {
          if ((is503UnavailableError(lastGroqError) || isModelMissingOrDecommissioned) && fallbackGroqModel !== primaryGroqModel && !controller.signal.aborted) {
            console.warn(`[BETSLIP OCR] [stage=${currentStage}] [FALLBACK] Switching to backup Groq model '${fallbackGroqModel}'...`);
            try {
              rawText = await callGroqWithSchemaFallback(fallbackGroqModel);
              usedFallbackModel = true;
              modelUsed = fallbackGroqModel;
              console.log(`[BETSLIP OCR] [stage=${currentStage}] [FALLBACK] Successfully extracted betslip using '${fallbackGroqModel}'!`);
            } catch (fallbackErr: any) {
              console.error(`[BETSLIP OCR] [stage=${currentStage}] [FALLBACK] Backup Groq model ${fallbackGroqModel} failed: ${fallbackErr.message}`);
              throw fallbackErr;
            }
          } else if (lastGroqError) {
            throw lastGroqError;
          }
        }

        currentStage = 'groq_response';
      }

      // Clear the timeout as soon as response arrives
      if (abortTimeout) {
        clearTimeout(abortTimeout);
        abortTimeout = null;
      }

      // CRITICAL: Immediate memory release
      req.body.image = null;
      imageData = null;

      const elapsedMs = Date.now() - startTime;
      if (!rawText) {
        console.warn(`[BETSLIP OCR] [stage=${currentStage}] ⚠️ ${provider} returned empty text after ${elapsedMs} ms`);
        throw new Error(`${provider === 'groq' ? 'Groq' : 'Gemini'} OCR returned an empty text response.`);
      }

      console.log(`[BETSLIP OCR] [stage=${currentStage}] ${provider} response received in ${elapsedMs} ms (Text length: ${rawText.length})`);

      currentStage = 'json_parse';
      // Strip optional <think> blocks and markdown code fences if returned by model, then parse JSON
      const cleanedRawText = rawText
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      const parsedData = JSON.parse(cleanedRawText);
      console.log(`[BETSLIP OCR] [stage=${currentStage}] ${provider} response parsed successfully`);

      // Server-side European date normalization to prevent US MM/DD inversions
      function serverNormalizeDate(dateStr?: string): string | undefined {
        if (!dateStr || typeof dateStr !== 'string' || !dateStr.trim()) return undefined;
        let cleaned = dateStr.trim();
        const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
        const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
        const allowedMonths = new Set([prevMonth, currentMonth, nextMonth]);

        cleaned = cleaned.replace(/\b202[0-5]\b/g, String(currentYear));

        // Pattern 1: DD/MM or DD/MM/YYYY
        const ddmmyyyyMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:[T\s*•,\s]\s*(\d{1,2}:\d{2}))?/);
        if (ddmmyyyyMatch) {
          const p1 = parseInt(ddmmyyyyMatch[1], 10);
          const p2 = parseInt(ddmmyyyyMatch[2], 10);
          let yr = ddmmyyyyMatch[3] ? parseInt(ddmmyyyyMatch[3], 10) : currentYear;
          if (yr < 100) yr += 2000;
          const time = ddmmyyyyMatch[4] ? `T${ddmmyyyyMatch[4]}:00` : '';

          let day = p1;
          let month = p2;
          if (!allowedMonths.has(month) && allowedMonths.has(day) && month <= 31 && day <= 12) {
            const temp = day;
            day = month;
            month = temp;
          }
          let targetYear = yr;
          if (month === 12 && currentMonth === 1) targetYear = currentYear - 1;
          else if (month === 1 && currentMonth === 12) targetYear = currentYear + 1;
          else targetYear = currentYear;

          return `${targetYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}${time}`;
        }

        // Pattern 2: ISO format YYYY-MM-DD
        const isoMatch = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}:\d{2}(?::\d{2})?))?/);
        if (isoMatch) {
          const yr = parseInt(isoMatch[1], 10);
          let month = parseInt(isoMatch[2], 10);
          let day = parseInt(isoMatch[3], 10);
          const time = isoMatch[4] ? `T${isoMatch[4]}` : '';

          if (!allowedMonths.has(month) && allowedMonths.has(day) && month <= 31 && day <= 12) {
            const tempMonth = day;
            const tempDay = month;
            month = tempMonth;
            day = tempDay;
          }
          let targetYear = yr;
          if (month === 12 && currentMonth === 1) targetYear = currentYear - 1;
          else if (month === 1 && currentMonth === 12) targetYear = currentYear + 1;
          else targetYear = currentYear;

          return `${targetYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}${time}`;
        }

        return cleaned;
      }

      if (parsedData.placed_at) {
        parsedData.placed_at = serverNormalizeDate(parsedData.placed_at);
      }
      if (Array.isArray(parsedData.legs)) {
        for (const leg of parsedData.legs) {
          if (leg.event_date) {
            leg.event_date = serverNormalizeDate(leg.event_date);
          }
        }
      }

      recordOcrAttempt(provider, {
        tokens: extractedTokens,
        costUsd: null,
        rateLimitHeaders: capturedRateHeaders,
        errorCode: null,
      });

      parsedData.providerUsed = provider;
      parsedData.usedFallbackModel = usedFallbackModel;
      parsedData.modelUsed = modelUsed;
      parsedData.providersSnapshot = buildProviderPayload();

      currentStage = 'http_response';
      const legsCount = Array.isArray(parsedData.legs) ? parsedData.legs.length : 0;
      console.log(`[BETSLIP OCR] [stage=${currentStage}] Sending JSON response (${legsCount} legs, bookmaker: "${parsedData.bookmaker}", stake: ${parsedData.stake}, provider: ${provider}, model: ${modelUsed}, fallback: ${usedFallbackModel})`);

      return res.json(parsedData);
    } catch (err: any) {
      if (abortTimeout) {
        clearTimeout(abortTimeout);
        abortTimeout = null;
      }

      // Ensure memory is released even on error
      req.body.image = null;
      imageData = null;

      const elapsedMs = Date.now() - startTime;
      const errMsg = (err.message || '').toLowerCase();
      const errStatus = err.status || err.statusCode;
      const providerLabel = provider === 'groq' ? 'Groq' : 'Gemini';
      const codePrefix = provider === 'groq' ? 'GROQ' : 'GEMINI';
      console.error(`[BETSLIP OCR] FAILURE provider=${provider} stage=${currentStage} elapsed=${elapsedMs}ms status=${errStatus || 'n/a'} error=${err.message || err}`);

      // Handle Timeout / Abort
      if (err.name === 'AbortError' || errMsg.includes('abort') || errMsg.includes('deadline') || errMsg.includes('timeout') || errMsg.includes('504')) {
        recordOcrAttempt(provider, { errorCode: `${codePrefix}_TIMEOUT` });
        return res.status(504).json({
          error: `${providerLabel} OCR analysis timed out after 80 seconds. Both the primary and backup engines took too long under upstream load.`,
          code: `${codePrefix}_TIMEOUT`,
          provider,
          stage: currentStage,
          retryable: true,
          details: err.message,
        });
      }

      // Handle Quota / Rate Limit (429) or Groq 413 TPM exceeded
      if (errStatus === 429 || errMsg.includes('resource_exhausted') || errMsg.includes('quota') || errMsg.includes('rate limit') || errMsg.includes('rate_limit') || errMsg.includes('tokens per minute') || errMsg.includes('limit exceeded') || errMsg.includes('429')) {
        recordOcrAttempt(provider, { errorCode: `${codePrefix}_QUOTA`, rateLimitHeaders: capturedRateHeaders });
        const retryMatch = String(err.message || '').match(/try again in\s+([0-9.]+s)/i);
        const retryHint = retryMatch ? ` Please retry in ~${retryMatch[1]}.` : ' Wait a few seconds and retry.';
        return res.status(429).json({
          error: provider === 'groq'
            ? `Groq Free-Tier Rate Limit Reached (429). Free tier allows ~30 RPM, ~1,000 RPD, and ~7k input / 8k total TPM on Qwen 3.8 27B.${retryHint}`
            : 'Gemini API Rate Limit Exceeded (429 RESOURCE_EXHAUSTED). Free tier allows 15 Requests Per Minute. Please wait 30 seconds and retry.',
          code: `${codePrefix}_QUOTA`,
          provider,
          stage: currentStage,
          retryable: true,
          details: err.message,
        });
      }

      // Handle Permission / API Key / Auth (401, 403)
      if (errStatus === 401 || errStatus === 403 || errMsg.includes('permission_denied') || errMsg.includes('api_key') || errMsg.includes('invalid api key') || errMsg.includes('unauthenticated') || errMsg.includes('unauthorized') || errMsg.includes('401') || errMsg.includes('403')) {
        recordOcrAttempt(provider, { errorCode: `${codePrefix}_AUTH` });
        return res.status(403).json({
          error: provider === 'groq'
            ? 'Groq API Authentication Failed. Please verify that GROQ_API_KEY (or GROK_API_KEY) is a valid Groq Console key (console.groq.com) in Settings > Secrets or Render Environment Variables.'
            : 'Gemini API Authentication Failed (403 PERMISSION_DENIED). Please verify that GEMINI_API_KEY is configured in Settings > Secrets or Render Environment Variables.',
          code: `${codePrefix}_AUTH`,
          provider,
          stage: currentStage,
          retryable: false,
          details: err.message,
        });
      }

      // Handle Service Unavailable / High Demand (503)
      const is503 = errStatus === 503 || err.code === 503 || errMsg.includes('503') || errMsg.includes('unavailable') || errMsg.includes('high demand') || errMsg.includes('overloaded');
      if (is503) {
        recordOcrAttempt(provider, { errorCode: `${codePrefix}_UNAVAILABLE`, rateLimitHeaders: capturedRateHeaders });
        return res.status(503).json({
          error: `${providerLabel} OCR models are currently experiencing temporary high demand (503 UNAVAILABLE). Automatic retries and the backup model were attempted, but upstream capacity remains temporarily constrained. Please try again shortly.`,
          code: `${codePrefix}_UNAVAILABLE`,
          provider,
          stage: currentStage,
          retryable: true,
          details: err.message,
        });
      }

      // Handle Payload Too Large (413)
      if (errStatus === 413 || errMsg.includes('payload') || errMsg.includes('too large') || errMsg.includes('413')) {
        recordOcrAttempt(provider, { errorCode: 'PAYLOAD_TOO_LARGE', rateLimitHeaders: capturedRateHeaders });
        return res.status(413).json({
          error: 'Image payload is too large. Please upload a smaller or lower-resolution image.',
          code: 'PAYLOAD_TOO_LARGE',
          provider,
          stage: currentStage,
          retryable: true,
          details: err.message,
        });
      }

      recordOcrAttempt(provider, { errorCode: 'SERVER_ERROR', rateLimitHeaders: capturedRateHeaders });
      return res.status(500).json({
        error: err.message || `Failed to scan and parse the betslip using server-side ${providerLabel} OCR.`,
        code: 'SERVER_ERROR',
        provider,
        stage: currentStage,
        retryable: true,
        details: err.message,
      });
    } finally {
      if (abortTimeout) {
        clearTimeout(abortTimeout);
      }
      if (global.gc) {
        global.gc();
      }
    }
  });

  // Diagnostic Endpoint: Check Gemini Model Status
  app.get('/api/diagnostics/gemini-status', async (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const client = getGeminiClient();
    if (!client) {
      return res.status(500).json({
        available: false,
        model: 'gemini-3.5-flash-lite',
        error: 'GEMINI_API_KEY environment variable is missing.',
        code: 'GEMINI_KEY_MISSING'
      });
    }

    try {
      const ping = await client.models.generateContent({
        model: 'gemini-3.5-flash-lite',
        contents: ['Return the word PONG in plain text.'],
      });
      return res.json({
        available: true,
        model: 'gemini-3.5-flash-lite',
        response: (ping.text || '').trim(),
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      return res.status(500).json({
        available: false,
        model: 'gemini-3.5-flash-lite',
        error: err.message || 'Failed to reach Gemini API',
        code: 'GEMINI_MODEL_UNAVAILABLE',
        details: err
      });
    }
  });

  // Diagnostic Endpoint: Check Groq (console.groq.com) Model Status & Rate Limits
  const handleGroqStatusCheck = async (_req: express.Request, res: express.Response) => {
    res.setHeader('Content-Type', 'application/json');
    const groqKey = getGroqApiKey();
    const groqModel = getGroqPrimaryModel();
    if (!groqKey) {
      return res.status(500).json({
        available: false,
        model: groqModel,
        error: 'GROQ_API_KEY (or GROK_API_KEY) environment variable is missing.',
        code: 'GROQ_KEY_MISSING',
      });
    }

    try {
      const pingRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: groqModel,
          max_completion_tokens: 16,
          temperature: 0,
          messages: [{ role: 'user', content: 'Return the word PONG in plain text.' }],
        }),
      });
      const rateLimits = {
        limitRequests: pingRes.headers.get('x-ratelimit-limit-requests'),
        remainingRequests: pingRes.headers.get('x-ratelimit-remaining-requests'),
        limitTokens: pingRes.headers.get('x-ratelimit-limit-tokens'),
        remainingTokens: pingRes.headers.get('x-ratelimit-remaining-tokens'),
        resetRequests: pingRes.headers.get('x-ratelimit-reset-requests'),
        resetTokens: pingRes.headers.get('x-ratelimit-reset-tokens'),
      };
      const pingText = await pingRes.text();
      if (!pingRes.ok) {
        return res.status(pingRes.status === 401 || pingRes.status === 403 ? 403 : 500).json({
          available: false,
          model: groqModel,
          error: pingText || `HTTP ${pingRes.status}`,
          code: pingRes.status === 401 || pingRes.status === 403 ? 'GROQ_AUTH' : 'GROQ_MODEL_UNAVAILABLE',
          rateLimits,
        });
      }
      const parsed = JSON.parse(pingText);
      return res.json({
        available: true,
        model: groqModel,
        response: (parsed?.choices?.[0]?.message?.content || '').trim(),
        rateLimits,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return res.status(500).json({
        available: false,
        model: groqModel,
        error: err.message || 'Failed to reach Groq API',
        code: 'GROQ_MODEL_UNAVAILABLE',
      });
    }
  };
  app.get('/api/diagnostics/groq-status', handleGroqStatusCheck);
  app.get('/api/diagnostics/grok-status', handleGroqStatusCheck);

  // Diagnostic Endpoint: Test A, B, and C matrix on an image
  app.post('/api/diagnostics/gemini-ocr-test', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const imageData = req.body.image;
    const mimeType = req.body.mimeType || 'image/jpeg';

    if (!imageData) {
      return res.status(400).json({ error: 'Missing image in body', code: 'INVALID_REQUEST' });
    }

    const client = getGeminiClient();
    if (!client) {
      return res.status(500).json({ error: 'GEMINI_API_KEY missing', code: 'GEMINI_KEY_MISSING' });
    }

    const results: any = { model: 'gemini-3.5-flash-lite' };

    // Test A: Plain text
    try {
      const resA = await client.models.generateContent({
        model: 'gemini-3.5-flash-lite',
        contents: [
          { inlineData: { mimeType, data: imageData } },
          'Describe what is visible on this betting slip in plain text.'
        ],
      });
      results.testA_plainText = { success: true, text: resA.text };
    } catch (errA: any) {
      results.testA_plainText = { success: false, error: errA.message };
    }

    // Test B: Simple JSON
    try {
      const resB = await client.models.generateContent({
        model: 'gemini-3.5-flash-lite',
        contents: [
          { inlineData: { mimeType, data: imageData } },
          'Look at this image and return JSON object with description.'
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              description: { type: Type.STRING }
            },
            required: ['description']
          }
        }
      });
      results.testB_simpleJson = { success: true, text: resB.text };
    } catch (errB: any) {
      results.testB_simpleJson = { success: false, error: errB.message };
    }

    return res.json(results);
  });

  // CRITICAL: Dedicated catch-all 404 handler for any unhandled /api/* routes
  // This guarantees /api/* requests ALWAYS return JSON and NEVER fall through to Vite SPA index.html
  app.all('/api/*all', (req, res) => {
    console.warn(`[API 404] Unhandled API route requested: ${req.method} ${req.originalUrl}`);
    res.setHeader('Content-Type', 'application/json');
    res.status(404).json({
      error: `API endpoint not found: ${req.method} ${req.originalUrl}`,
      code: 'API_NOT_FOUND',
      retryable: false,
    });
  });
  // Vite middleware setup for Development
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
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
