-- BetLogic Pro Sportsbook Analytics Database Schema
-- Compatible with PostgreSQL (e.g. Aiven PostgreSQL)

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    currency VARCHAR(10) DEFAULT 'EUR',
    odds_format VARCHAR(20) DEFAULT 'decimal',
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    active_bankroll_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. BANKROLLS TABLE
CREATE TABLE IF NOT EXISTS bankrolls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'EUR',
    initial_balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    current_balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    free_bet_credits DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    allocated_margin DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    color VARCHAR(50) DEFAULT '#2563eb',
    description TEXT,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Update users table self-reference foreign key for active_bankroll_id
ALTER TABLE users ADD CONSTRAINT fk_user_active_bankroll FOREIGN KEY (active_bankroll_id) REFERENCES bankrolls(id) ON DELETE SET NULL;

-- 3. BOOKMAKERS TABLE
CREATE TABLE IF NOT EXISTS bookmakers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    logo_url TEXT,
    icon_name VARCHAR(255),
    real_balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    free_bet_balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    average_margin DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    color VARCHAR(50) DEFAULT '#2563eb',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, name)
);

-- 4. BANKROLL BOOKMAKER BALANCES TABLE
CREATE TABLE IF NOT EXISTS bankroll_bookmaker_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bankroll_id UUID NOT NULL REFERENCES bankrolls(id) ON DELETE CASCADE,
    bookmaker_id UUID NOT NULL REFERENCES bookmakers(id) ON DELETE CASCADE,
    cash_balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    free_bet_balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    UNIQUE (bankroll_id, bookmaker_id)
);

-- 5. BETS TABLE
CREATE TABLE IF NOT EXISTS bets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bankroll_id UUID NOT NULL REFERENCES bankrolls(id) ON DELETE CASCADE,
    bookmaker_id UUID NOT NULL REFERENCES bookmakers(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'single', -- single, parlay, bet_builder
    total_odds DECIMAL(10, 4) NOT NULL DEFAULT 1.0000,
    stake DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    potential_payout DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    actual_return DECIMAL(15, 2) DEFAULT 0.00,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, won, lost, void, cashout
    is_live BOOLEAN DEFAULT FALSE,
    is_free_bet BOOLEAN DEFAULT FALSE,
    free_bet_destination VARCHAR(50) DEFAULT 'cash', -- cash, free_bet
    notes TEXT,
    scanned_slip_url TEXT,
    image_url TEXT,
    tags JSONB DEFAULT '[]'::jsonb, -- Store list of strings e.g. ["arbitrage", "hedged"]
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. BET LEGS TABLE
CREATE TABLE IF NOT EXISTS bet_legs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bet_id UUID NOT NULL REFERENCES bets(id) ON DELETE CASCADE,
    sport VARCHAR(100) NOT NULL,
    league VARCHAR(255),
    event VARCHAR(255) NOT NULL,
    market VARCHAR(255) NOT NULL,
    selection VARCHAR(255) NOT NULL,
    odds DECIMAL(10, 4) NOT NULL DEFAULT 1.0000,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    event_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. BANKROLL TRANSFERS TABLE
CREATE TABLE IF NOT EXISTS bankroll_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    from_bankroll_id UUID NOT NULL REFERENCES bankrolls(id) ON DELETE CASCADE,
    to_bankroll_id UUID NOT NULL REFERENCES bankrolls(id) ON DELETE CASCADE,
    amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    is_free_bet_credit BOOLEAN DEFAULT FALSE,
    conversion_rate DECIMAL(10, 6) DEFAULT 1.000000,
    rollover_required DECIMAL(15, 2) DEFAULT 0.00,
    rollover_completed DECIMAL(15, 2) DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. TAG DEFINITIONS TABLE
CREATE TABLE IF NOT EXISTS tag_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(50) NOT NULL DEFAULT '#3b82f6',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, name)
);

-- 9. BANKROLL TRANSACTIONS (BALANCE SHEET)
CREATE TABLE IF NOT EXISTS bankroll_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bankroll_id UUID NOT NULL REFERENCES bankrolls(id) ON DELETE CASCADE,
    date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    type VARCHAR(50) NOT NULL, -- Initial Balance, Deposit, Withdrawal, Adjustment, Transfer
    description TEXT,
    bookmaker_id UUID REFERENCES bookmakers(id) ON DELETE SET NULL,
    amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- INDEXES FOR HIGH-SPEED LOOKUPS
CREATE INDEX IF NOT EXISTS idx_bets_user_date ON bets(user_id, date);
CREATE INDEX IF NOT EXISTS idx_bets_bankroll ON bets(bankroll_id);
CREATE INDEX IF NOT EXISTS idx_bets_status ON bets(status);
CREATE INDEX IF NOT EXISTS idx_bet_legs_bet ON bet_legs(bet_id);
CREATE INDEX IF NOT EXISTS idx_bankrolls_user ON bankrolls(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmakers_user ON bookmakers(user_id);
CREATE INDEX IF NOT EXISTS idx_transfers_user ON bankroll_transfers(user_id);
CREATE INDEX IF NOT EXISTS idx_bankroll_transactions_bankroll ON bankroll_transactions(bankroll_id);
