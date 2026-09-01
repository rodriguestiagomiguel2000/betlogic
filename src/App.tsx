import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Bet, Bankroll, Bookmaker, BankrollTransfer, BankrollTransaction, UserPreferences, BetStatus, TagDefinition, Tipster } from './types';
import {
  isAuthenticated,
  logoutUser,
  authApi,
  betsApi,
  bankrollsApi,
  bookmakersApi,
  transfersApi,
  tagsApi,
  tipstersApi
} from './utils/api';
import { calculateWinStreak, computeBetFinancialImpact, updateBookmakerBalanceForBankroll } from './utils/storage';
import { calculateLegsOdds } from './utils/dateUtils';
import { AuthScreen } from './components/AuthScreen';

import { Navbar } from './components/Navbar';
import { Dashboard } from './components/Dashboard';
import { BetsHistoryView } from './components/BetsHistoryView';
import { BookmakersView } from './components/BookmakersView';
import { BetslipScanner } from './components/BetslipScanner';
import { ManualBetEntry } from './components/ManualBetEntry';
import { AnalyticsView } from './components/AnalyticsView';
import { BankrollManager } from './components/BankrollManager';
import { CSVImportExport } from './components/CSVImportExport';
import { UserProfile } from './components/UserProfile';
import { PLCalendarView } from './components/PLCalendarView';
import { TipstersView } from './components/TipstersView';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';

import { AnimatePresence, motion } from 'motion/react';

export function App() {
  const [isAuth, setIsAuth] = useState<boolean>(isAuthenticated());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<string>('dashboard');

  const [bets, setBets] = useState<Bet[]>([]);
  const [bankrolls, setBankrolls] = useState<Bankroll[]>([]);
  const [bookmakers, setBookmakers] = useState<Bookmaker[]>([]);
  const [transfers, setTransfers] = useState<BankrollTransfer[]>([]);
  const [transactions, setTransactions] = useState<BankrollTransaction[]>([]);
  const [userPrefs, setUserPrefs] = useState<UserPreferences>({
    currency: 'EUR',
    oddsFormat: 'decimal',
    activeBankrollId: '',
    twoFactorEnabled: false,
    name: 'User',
    email: '',
    notifications: {
      winStreakAlerts: true,
      highRiskWarnings: true,
      rolloverMilestones: true,
      weeklyReports: true
    }
  });
  const [tagDefinitions, setTagDefinitions] = useState<TagDefinition[]>([]);
  const [tipsters, setTipsters] = useState<Tipster[]>([]);

  // Memoized win streak
  const winStreak = useMemo(() => calculateWinStreak(bets), [bets]);

  const loadData = async (showSpinner = false) => {
    if (!isAuthenticated()) {
      setIsAuth(false);
      setLoading(false);
      return;
    }

    if (showSpinner) {
      setLoading(true);
    }
    setError(null);
    try {
      // Run all independent requests in parallel using Promise.all
      const [
        betsData,
        bankrollsData,
        bookmakersData,
        transfersData,
        tagsData,
        tipstersData,
        profileData,
        transactionsData
      ] = await Promise.all([
        betsApi.list(),
        bankrollsApi.list(),
        bookmakersApi.list(),
        transfersApi.list(),
        tagsApi.list(),
        tipstersApi.list().catch(() => []),
        authApi.getProfile(),
        (activeTab === 'analytics' || activeTab === 'bankrolls' || transactions.length === 0)
          ? bankrollsApi.allTransactions().catch(() => [])
          : Promise.resolve(transactions)
      ]);

      setBets(betsData);
      setBankrolls(bankrollsData);
      setBookmakers(bookmakersData);
      setTransfers(transfersData);
      setTagDefinitions(tagsData);
      setTipsters(tipstersData);
      setTransactions(transactionsData);

      if (profileData) {
        setUserPrefs(prev => ({
          ...prev,
          currency: profileData.currency || 'EUR',
          oddsFormat: profileData.oddsFormat || 'decimal',
          activeBankrollId: profileData.activeBankrollId || (bankrollsData[0]?.id || ''),
          twoFactorEnabled: profileData.twoFactorEnabled || false,
          name: profileData.name || 'User',
          email: profileData.email || ''
        }));
      }
      setIsAuth(true);
    } catch (err: any) {
      console.error('Failed to load application data from backend:', err);
      setError(err.message || 'Failed to connect to backend / PostgreSQL database.');
      if (err.message && (err.message.includes('expired') || err.message.includes('unauthorized') || err.message.includes('not found') || err.message.includes('Please log in'))) {
        logoutUser();
        setIsAuth(false);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(true);

    const handleLogoutEvent = () => {
      setIsAuth(false);
    };
    window.addEventListener('auth-logout', handleLogoutEvent);
    return () => {
      window.removeEventListener('auth-logout', handleLogoutEvent);
    };
  }, []);

  // Fetch transactions when switching to tabs that need them
  useEffect(() => {
    if ((activeTab === 'analytics' || activeTab === 'bankrolls') && transactions.length === 0 && isAuth) {
      loadData(false);
    }
  }, [activeTab, isAuth]);

  if (!isAuth) {
    return <AuthScreen onAuthenticated={() => { setIsAuth(true); loadData(); }} />;
  }

  if (loading && bets.length === 0 && bankrolls.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
        <p className="text-sm text-slate-400">Loading your betting portfolio from PostgreSQL...</p>
      </div>
    );
  }

  if (error && bankrolls.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-center">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-red-500/10 text-red-400 mb-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-white mb-2">Connection Error</h2>
          <p className="text-sm text-slate-400 mb-6">{error}</p>
          <div className="flex gap-3">
            <button
              onClick={() => loadData()}
              className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl text-sm transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" /> Retry Connection
            </button>
            <button
              onClick={() => { logoutUser(); setIsAuth(false); }}
              className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-xl text-sm transition-all"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Action handlers
  const handleAddBet = async (newBetData: Omit<Bet, 'id'>) => {
    try {
      const res = await betsApi.create(newBetData as any);
      await loadData();
      return res;
    } catch (err: any) {
      alert(`Failed to add bet: ${err.message}`);
      throw err;
    }
  };

  const handleUpdateBetStatus = async (betId: string, status: BetStatus, actualReturn?: number) => {
    try {
      const existing = bets.find(b => b.id === betId);
      if (!existing) return;
      const updated = {
        ...existing,
        status,
        actualReturn: actualReturn !== undefined ? actualReturn : status === 'won' ? existing.potentialPayout : 0
      };
      
      // Optimistic update of all related states
      const oldBet = bets.find(b => b.id === betId);
      if (oldBet) {
        // Update bets state
        setBets(prev => prev.map(b => b.id === betId ? updated : b));

        // Update bookmakers state
        const oldImpact = computeBetFinancialImpact(oldBet);
        const newImpact = computeBetFinancialImpact(updated);
        
        const realDelta = newImpact.realCashDelta - oldImpact.realCashDelta;
        const freeDelta = newImpact.freeBetDelta - oldImpact.freeBetDelta;

        if (realDelta !== 0 || freeDelta !== 0) {
          setBookmakers(prev => prev.map(bm => {
            if (bm.id === updated.bookmakerId) {
              return updateBookmakerBalanceForBankroll(bm, updated.bankrollId, 
                (bm.realBalance || 0) + realDelta, 
                (bm.freeBetBalance || 0) + freeDelta
              );
            }
            return bm;
          }));

          // Update bankrolls state
          setBankrolls(prev => prev.map(br => {
            if (br.id === updated.bankrollId) {
              return {
                ...br,
                currentBalance: (br.currentBalance || 0) + realDelta,
                freeBetCredits: (br.freeBetCredits || 0) + freeDelta
              };
            }
            return br;
          }));
        }
      }
      
      await betsApi.update(betId, updated);
      // Background reload (silent) to ensure everything is in sync with server-side calculations
      loadData(false);
    } catch (err: any) {
      alert(`Failed to update bet status: ${err.message}`);
      // Revert on error
      loadData();
    }
  };

  const handleUpdateBetLegStatus = async (betId: string, legId: string, newLegStatus: BetStatus) => {
    try {
      const existing = bets.find(b => b.id === betId);
      if (!existing) return;
      const updatedLegs = existing.legs.map(l => l.id === legId ? { ...l, status: newLegStatus } : l);
      const effectiveOdds = calculateLegsOdds(updatedLegs, existing.type).effectiveTotalOdds;
      const anyLost = updatedLegs.some(l => l.status === 'lost');
      const allWon = updatedLegs.every(l => l.status === 'won');
      const allVoid = updatedLegs.every(l => l.status === 'void');
      const allWonOrVoid = updatedLegs.every(l => l.status === 'won' || l.status === 'void');
      const hasWon = updatedLegs.some(l => l.status === 'won');

      let newStatus: BetStatus = existing.status;
      if (anyLost) newStatus = 'lost';
      else if (allWon || (allWonOrVoid && hasWon)) newStatus = 'won';
      else if (allVoid) newStatus = 'void';
      else newStatus = 'pending';

      const payout = Number((existing.stake * effectiveOdds).toFixed(2));
      let ret = existing.actualReturn;
      if (newStatus === 'won') ret = payout;
      else if (newStatus === 'lost') ret = 0;
      else if (newStatus === 'void') ret = existing.stake;

      const updated = {
        ...existing,
        legs: updatedLegs,
        totalOdds: Number(effectiveOdds.toFixed(3)),
        potentialPayout: payout,
        status: newStatus,
        actualReturn: ret
      };

      // Optimistic update of all related states
      const oldBet = bets.find(b => b.id === betId);
      if (oldBet) {
        // Update bets state
        setBets(prev => prev.map(b => b.id === betId ? updated : b));

        // Update bookmakers and bankrolls based on impact change
        const oldImpact = computeBetFinancialImpact(oldBet);
        const newImpact = computeBetFinancialImpact(updated);
        
        const realDelta = newImpact.realCashDelta - oldImpact.realCashDelta;
        const freeDelta = newImpact.freeBetDelta - oldImpact.freeBetDelta;

        if (realDelta !== 0 || freeDelta !== 0) {
          setBookmakers(prev => prev.map(bm => {
            if (bm.id === updated.bookmakerId) {
              return updateBookmakerBalanceForBankroll(bm, updated.bankrollId, 
                (bm.realBalance || 0) + realDelta, 
                (bm.freeBetBalance || 0) + freeDelta
              );
            }
            return bm;
          }));

          setBankrolls(prev => prev.map(br => {
            if (br.id === updated.bankrollId) {
              return {
                ...br,
                currentBalance: (br.currentBalance || 0) + realDelta,
                freeBetCredits: (br.freeBetCredits || 0) + freeDelta
              };
            }
            return br;
          }));
        }
      }

      const res = await betsApi.updateLegStatus(betId, legId, newLegStatus);
      
      if (res && (res.status !== undefined || res.totalOdds !== undefined || res.potentialPayout !== undefined || res.actualReturn !== undefined)) {
        setBets(prev => prev.map(b => {
          if (b.id !== betId) return b;
          return {
            ...b,
            status: res.status !== undefined ? res.status : b.status,
            totalOdds: res.totalOdds !== undefined ? Number(res.totalOdds) : b.totalOdds,
            potentialPayout: res.potentialPayout !== undefined ? Number(res.potentialPayout) : b.potentialPayout,
            actualReturn: res.actualReturn !== undefined ? Number(res.actualReturn) : b.actualReturn,
          };
        }));
      }
    } catch (err: any) {
      alert(`Failed to update leg status: ${err.message}`);
      // Revert on error
      loadData();
    }
  };

  const handleDeleteBet = async (betId: string) => {
    try {
      await betsApi.delete(betId);
      await loadData();
    } catch (err: any) {
      alert(`Failed to delete bet: ${err.message}`);
    }
  };

  const handleAddBankroll = (data: any): void => {
    bankrollsApi.create(data).then(() => {
      loadData();
    }).catch(err => {
      alert(`Failed to create bankroll: ${err.message}`);
    });
  };

  const handleSetActiveBankroll = async (bankrollId: string) => {
    try {
      setUserPrefs(prev => ({ ...prev, activeBankrollId: bankrollId }));
      await authApi.updateProfile({ activeBankrollId: bankrollId });
    } catch (err: any) {
      console.error('Failed to set active bankroll:', err);
    }
  };

  const handleDeleteBankroll = async (bankrollId: string) => {
    try {
      await bankrollsApi.delete(bankrollId);
      await loadData();
    } catch (err: any) {
      alert(`Failed to delete bankroll: ${err.message}`);
    }
  };

  const handleReorderBankrolls = async (reorderedIds: string[]) => {
    try {
      await bankrollsApi.reorder(reorderedIds);
      await loadData();
    } catch (err: any) {
      console.error('Failed to reorder bankrolls:', err);
      await loadData();
    }
  };

  const handleUpdateBankrollStatus = async (bankrollId: string, status: 'active' | 'archived') => {
    try {
      await bankrollsApi.updateStatus(bankrollId, status);
      await loadData();
    } catch (err: any) {
      alert(`Failed to update bankroll status: ${err.message}`);
    }
  };

  const handleAddBookmaker = async (data: Omit<Bookmaker, 'id'>) => {
    try {
      await bookmakersApi.create(data);
      await loadData();
    } catch (err: any) {
      alert(`Failed to create bookmaker: ${err.message}`);
    }
  };

  const handleUpdateBookmaker = async (bookmakerId: string, updates: Partial<Bookmaker>) => {
    try {
      await bookmakersApi.update(bookmakerId, updates);
      await loadData();
    } catch (err: any) {
      alert(`Failed to update bookmaker: ${err.message}`);
    }
  };

  const handleUpdateBookmakerBalance = async (
    bookmakerId: string, 
    realBalance: number, 
    freeBetBalance: number, 
    targetBankrollId?: string,
    type?: 'deposit' | 'withdraw' | 'freebet',
    amount?: number
  ) => {
    try {
      if (targetBankrollId && type && amount !== undefined) {
        await bookmakersApi.transaction(bookmakerId, { bankrollId: targetBankrollId, type, amount });
      } else {
        await bookmakersApi.update(bookmakerId, { realBalance, freeBetBalance, bankrollId: targetBankrollId });
      }
      await loadData();
    } catch (err: any) {
      alert(`Failed to update bookmaker balance: ${err.message}`);
    }
  };

  const handleUpdateBookmakerMargin = async (bookmakerId: string, averageMargin: number) => {
    try {
      await bookmakersApi.update(bookmakerId, { averageMargin });
      await loadData();
    } catch (err: any) {
      alert(`Failed to update margin: ${err.message}`);
    }
  };

  const handleDeleteBookmaker = async (bookmakerId: string) => {
    try {
      await bookmakersApi.delete(bookmakerId);
      await loadData();
    } catch (err: any) {
      alert(`Failed to delete bookmaker: ${err.message}`);
    }
  };

  const handleAddTransfer = async (data: Omit<BankrollTransfer, 'id'>) => {
    try {
      await transfersApi.create(data);
      await loadData();
    } catch (err: any) {
      alert(`Failed to record transfer: ${err.message}`);
    }
  };

  const handleAddTagDefinition = async (tag: TagDefinition) => {
    try {
      await tagsApi.create({ name: tag.name, color: tag.color });
      await loadData();
    } catch (err: any) {
      alert(`Failed to create tag: ${err.message}`);
    }
  };

  const handleAddTipster = async (data: { name: string; platform?: string; notes?: string; color?: string }): Promise<Tipster> => {
    try {
      const created = await tipstersApi.create(data);
      await loadData();
      return created;
    } catch (err: any) {
      alert(`Failed to create tipster: ${err.message}`);
      throw err;
    }
  };

  const handleUpdatePrefs = async (newPrefs: UserPreferences) => {
    try {
      setUserPrefs(newPrefs);
      await authApi.updateProfile({
        name: newPrefs.name,
        currency: newPrefs.currency,
        oddsFormat: newPrefs.oddsFormat,
        activeBankrollId: newPrefs.activeBankrollId
      });
    } catch (err: any) {
      alert(`Failed to update profile: ${err.message}`);
    }
  };

  const handleReconcileBookmaker = async (bookmakerId: string, newCash: number, newFreeBet: number, notes: string, targetBankrollId?: string) => {
    try {
      await bookmakersApi.update(bookmakerId, { realBalance: newCash, freeBetBalance: newFreeBet, bankrollId: targetBankrollId });
      await loadData();
    } catch (err: any) {
      alert(`Bookmaker reconciliation failed: ${err.message}`);
    }
  };

  const handleUpdateBankrollBalance = async (bankrollId: string, newBalance: number) => {
    try {
      await bankrollsApi.update(bankrollId, { currentBalance: newBalance });
      await loadData();
    } catch (err: any) {
      alert(`Failed to update bankroll balance: ${err.message}`);
    }
  };

  const handleBatchUpdateBookmakers = async (updates: Array<{ id: string; realBalance?: number; freeBetBalance?: number }>) => {
    try {
      for (const u of updates) {
        await bookmakersApi.update(u.id, { realBalance: u.realBalance, freeBetBalance: u.freeBetBalance });
      }
      await loadData();
    } catch (err: any) {
      alert(`Batch update failed: ${err.message}`);
    }
  };

  const handleImportBets = async (importedBets: Array<Omit<Bet, 'id'>>) => {
    try {
      for (const b of importedBets) {
        await betsApi.create(b as any);
      }
      await loadData();
    } catch (err: any) {
      alert(`Import failed: ${err.message}`);
    }
  };

  const handleBatchCSVImport = (payload: any) => {
    try {
      // Basic implementation
      loadData();
      return { importedBetsCount: 0, createdBankrollsCount: 0, createdBookmakersCount: 0, currencyUsed: userPrefs.currency };
    } catch (err: any) {
      alert(`CSV Import failed: ${err.message}`);
      return { importedBetsCount: 0, createdBankrollsCount: 0, createdBookmakersCount: 0, currencyUsed: userPrefs.currency };
    }
  };

  const handleLogout = () => {
    logoutUser();
    setIsAuth(false);
  };

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            bets={bets}
            bankrolls={bankrolls}
            bookmakers={bookmakers}
            activeBankrollId={userPrefs.activeBankrollId}
            userCurrency={userPrefs.currency}
            onUpdateBetStatus={handleUpdateBetStatus}
            onUpdateBetLegStatus={handleUpdateBetLegStatus}
            onNavigate={setActiveTab}
          />
        );
      case 'calendar':
        return (
          <PLCalendarView
            bets={bets}
            bankrolls={bankrolls}
            bookmakers={bookmakers}
            tagDefinitions={tagDefinitions}
            userCurrency={userPrefs.currency}
          />
        );
      case 'history':
        return (
          <BetsHistoryView
            bets={bets}
            bankrolls={bankrolls}
            bookmakers={bookmakers}
            tagDefinitions={tagDefinitions}
            tipsters={tipsters}
            activeBankrollId={userPrefs.activeBankrollId}
            userCurrency={userPrefs.currency}
            onUpdateBetStatus={handleUpdateBetStatus}
            onUpdateBetLegStatus={handleUpdateBetLegStatus}
            onNavigate={setActiveTab}
            onDeleteBet={handleDeleteBet}
          />
        );
      case 'bookmakers':
        return (
          <BookmakersView
            bookmakers={bookmakers}
            bankrolls={bankrolls}
            bets={bets}
            activeBankrollId={userPrefs.activeBankrollId}
            userCurrency={userPrefs.currency}
            onAddBookmaker={handleAddBookmaker}
            onUpdateBookmaker={handleUpdateBookmaker}
            onUpdateBookmakerBalance={handleUpdateBookmakerBalance}
            onUpdateBookmakerMargin={handleUpdateBookmakerMargin}
            onNavigateToHistory={() => setActiveTab('history')}
            onDeleteBookmaker={handleDeleteBookmaker}
            onReconcileBookmaker={handleReconcileBookmaker}
          />
        );
      case 'scanner':
        return (
          <BetslipScanner
            bankrolls={bankrolls}
            bookmakers={bookmakers}
            bets={bets}
            activeBankrollId={userPrefs.activeBankrollId}
            userCurrency={userPrefs.currency}
            onAddBet={handleAddBet}
            onNavigate={setActiveTab}
            tagDefinitions={tagDefinitions}
            onAddTagDefinition={handleAddTagDefinition}
            tipsters={tipsters}
            onAddTipster={handleAddTipster}
          />
        );
      case 'entry':
        return (
          <ManualBetEntry
            bankrolls={bankrolls}
            bookmakers={bookmakers}
            bets={bets}
            activeBankrollId={userPrefs.activeBankrollId}
            onAddBet={handleAddBet}
            onNavigate={setActiveTab}
            tagDefinitions={tagDefinitions}
            onAddTagDefinition={handleAddTagDefinition}
            tipsters={tipsters}
            onAddTipster={handleAddTipster}
          />
        );
      case 'tipsters':
        return (
          <TipstersView
            tipsters={tipsters}
            bets={bets}
            userCurrency={userPrefs.currency}
            onAddTipster={handleAddTipster}
            onUpdateTipster={async (id, data) => {
              await tipstersApi.update(id, data);
              await loadData();
            }}
            onDeleteTipster={async (id) => {
              await tipstersApi.delete(id);
              await loadData();
            }}
          />
        );
      case 'analytics':
        return (
          <AnalyticsView
            bets={bets}
            bookmakers={bookmakers}
            bankrolls={bankrolls}
            transactions={transactions}
            userCurrency={userPrefs.currency}
            tipsters={tipsters}
          />
        );
      case 'bankrolls':
        return (
          <BankrollManager
            bankrolls={bankrolls}
            bookmakers={bookmakers}
            bets={bets}
            transfers={transfers}
            activeBankrollId={userPrefs.activeBankrollId}
            userCurrency={userPrefs.currency}
            onAddBankroll={handleAddBankroll}
            onUpdateBankrollBalance={handleUpdateBankrollBalance}
            onAddTransfer={handleAddTransfer}
            onSetActiveBankroll={handleSetActiveBankroll}
            onDeleteBankroll={handleDeleteBankroll}
            onReconcileBookmaker={handleReconcileBookmaker}
            onBatchUpdateBookmakers={handleBatchUpdateBookmakers}
            onReorderBankrolls={handleReorderBankrolls}
            onUpdateBankrollStatus={handleUpdateBankrollStatus}
            onRefreshData={loadData}
          />
        );
      case 'csv':
        return (
          <CSVImportExport
            bets={bets}
            bankrolls={bankrolls}
            bookmakers={bookmakers}
            userCurrency={userPrefs.currency}
            onImportBets={handleImportBets}
            onBatchImport={handleBatchCSVImport}
          />
        );
      case 'profile':
        return (
          <UserProfile
            prefs={userPrefs}
            onUpdatePrefs={handleUpdatePrefs}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#0b1326] text-white flex flex-col font-sans antialiased selection:bg-blue-600 selection:text-white">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        winStreak={winStreak}
        onLogout={handleLogout}
      />

      <main className="flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6 pt-[env(safe-area-inset-top)]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="w-full h-full"
          >
            {renderActiveTab()}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

export default App;
