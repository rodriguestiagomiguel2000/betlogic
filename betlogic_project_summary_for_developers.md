# Project Blueprint: High-Performance Betting Tracker & Analytics

## Project Overview
A high-fidelity mobile application designed for professional bettors to track, analyze, and manage their betting portfolio. The app features automated bet entry via OCR (optical character recognition), multi-bankroll management, and advanced risk analytics.

## Core Technical Stack (Recommended)
- **Frontend:** React or Next.js (Tailwind CSS for styling)
- **Backend:** Node.js or Python (FastAPI/Django)
- **Database:** PostgreSQL or Firebase
- **OCR Engine:** Tesseract.js (local) or Google Cloud Vision API
- **Data/Odds API:** The Odds API or Prop Odds

---

## Screen Inventory & Functional Logic

### 1. Core Dashboard & Navigation
- **Dashboard with Live Bet Filters (SCREEN_27, SCREEN_45):** The primary landing page. Features a live win streak counter (SCREEN_24) and quick filters to toggle between Live and Pre-match performance.
- **TopAppBar & BottomNavBar:** Standardized navigation across all screens. Includes user notifications and quick access to Scan, Analytics, and Bankroll.

### 2. Betslip Scanner (OCR Workflow)
- **Betslip Scanner - Multi-Leg Support (SCREEN_2, SCREEN_39, SCREEN_42):** 
    - **Logic:** Users upload or take a photo of a physical/digital betslip.
    - **Features:** OCR must detect "Parlay" vs "Single," identify individual "Legs" (Team, Market, Odds), and allow the user to assign the total stake to a specific bankroll before saving.
    - **Specifics:** Must handle "Bet Builders" and detect multiple legs within a single slip.

### 3. Manual Data Entry
- **Manual Bet Entry (SCREEN_32, SCREEN_38, SCREEN_41):**
    - **Logic:** Form for manual logging of bets.
    - **Fields:** Sport, Market, Selection, Odds, Stake, Bookmaker, and Bankroll.
    - **Features:** "Free Bet" toggle to track credit usage and "Live" toggle for in-game stats.

### 4. Advanced Analytics & Risk Management
- **Performance Heatmaps & Projections (SCREEN_22, SCREEN_23):** 
    - **Logic:** Visualizes "Market Hot Zones" to show which sports/leagues are most profitable.
    - **Metrics:** Streak history, ROI projections, and risk-adjusted return (Sharpe-style metrics).
- **ROI by Market (SCREEN_16, SCREEN_19):** Deep-dive breakdown of profit/loss per sport or league.
- **Bookmaker Margin Tracker (SCREEN_21):** Analyzes which bookmakers provide the best value by calculating the "juice" or margin on logged bets.

### 5. Bankroll & Bookmaker Management
- **Bankroll Manager (SCREEN_40, SCREEN_43):** Overview of all active funds.
- **Manage Bankrolls with Transfers (SCREEN_35, SCREEN_36, SCREEN_37):** 
    - **Logic:** Supports moving funds between bankrolls. 
    - **Features:** Automated rollover tracking (SCREEN_25) to see how much of a bonus/credit is "unlocked" based on betting volume.
- **Manage Bookmakers (SCREEN_30, SCREEN_33):** Tracks balances and free bet credits across different betting platforms.

### 6. Data Portability & Audit
- **CSV Data Mapping (SCREEN_9, SCREEN_11):** 
    - **Logic:** A robust tool for importing history from different bookmakers. 
    - **Features:** Field mapping (Matching CSV columns to app fields) and validation warnings for malformed data.
- **Successful Import Summary & Error Log (SCREEN_6, SCREEN_10):** Post-import feedback loop.
- **Advanced Transfer History & Audit (SCREEN_34):** A detailed log of every financial movement for transparency.

### 7. User Profile & Settings
- **User Profile & Account Settings (SCREEN_17, SCREEN_20):** 
    - **Features:** Security (2FA), Data Export (JSON/CSV), and Notification preferences (SCREEN_18).
    - **Logic:** Central hub for data portability and subscription management.

---

## Design System Specifications
- **Theme:** Dark Mode (`#0b1326` surface)
- **Primary Color:** Electric Blue (`#2563eb`)
- **Typography:** Inter (Sans-serif)
- **Border Radius:** 4px (Subtle roundness)
- **Components:** Uses a modular Tailwind-based system for cards, buttons, and input fields.

## Development Roadmap
1.  **Phase 1:** Set up auth and database schema for Bankrolls/Bets.
2.  **Phase 2:** Implement the Manual Bet Entry and Dashboard.
3.  **Phase 3:** Integrate Tesseract.js for the Betslip Scanner logic.
4.  **Phase 4:** Build the Analytics Engine (calculating ROI, Margins, and Streaks).
5.  **Phase 5:** Implement CSV Import/Export tools.