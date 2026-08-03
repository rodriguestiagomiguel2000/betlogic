import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  LayoutDashboard,
  History,
  Building2,
  ScanLine,
  PlusCircle,
  PieChart,
  Wallet,
  FileSpreadsheet,
  Settings,
  Bell,
  Sparkles,
  Zap,
  ChevronRight,
  TrendingUp,
  ShieldCheck,
  User,
  Calendar,
  LogOut,
  MoreHorizontal,
  X
} from 'lucide-react';
import { APP_LOGO_BASE64 } from '../assets/logoData';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  winStreak: { currentStreak: number; streakType: 'win' | 'loss' };
  onLogout: () => void;
}

const BrandLogo: React.FC<{ size: 'desktop' | 'mobile' }> = ({ size }) => {
  const [hasError, setHasError] = useState(false);

  if (!hasError) {
    return (
      <img
        src={APP_LOGO_BASE64}
        alt="BetLogic Logo"
        onError={() => setHasError(true)}
        className={
          size === 'desktop'
            ? 'w-10 h-10 rounded-xl object-contain shadow-md border border-[#1f283d]'
            : 'w-8 h-8 rounded-lg object-contain shadow border border-[#1f283d]'
        }
        referrerPolicy="no-referrer"
      />
    );
  }

  if (size === 'desktop') {
    return (
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2563eb] to-[#1d4ed8] flex items-center justify-center text-white font-black text-xl shadow-lg shadow-[#2563eb]/20 border border-[#3b82f6]/40">
        BL
      </div>
    );
  }

  return (
    <div className="w-8 h-8 rounded-lg bg-[#2563eb] flex items-center justify-center text-white font-extrabold text-sm shadow">
      BL
    </div>
  );
};

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, winStreak, onLogout }) => {
  const [showMoreDrawer, setShowMoreDrawer] = useState(false);

  useEffect(() => {
    if (showMoreDrawer) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';

      return () => {
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        document.body.style.overflow = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [showMoreDrawer]);

  const navSections = [
    {
      title: 'OVERVIEW',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'calendar', label: 'P&L Calendar', icon: Calendar, badge: 'P&L' },
        { id: 'history', label: 'Bets History', icon: History, badge: 'New' },
        { id: 'bookmakers', label: 'Bookmakers', icon: Building2, badge: 'New' }
      ]
    },
    {
      title: 'BET LOGGING',
      items: [
        { id: 'scanner', label: 'Betslip OCR Scan', icon: ScanLine },
        { id: 'entry', label: 'Manual Bet Entry', icon: PlusCircle }
      ]
    },
    {
      title: 'ANALYTICS & FUNDS',
      items: [
        { id: 'analytics', label: 'Analytics & ROI', icon: PieChart },
        { id: 'bankrolls', label: 'Bankrolls & Vault', icon: Wallet },
        { id: 'csv', label: 'CSV Export/Import', icon: FileSpreadsheet }
      ]
    },
    {
      title: 'SYSTEM',
      items: [
        { id: 'profile', label: 'Settings & Security', icon: Settings }
      ]
    }
  ];

  // 5 Primary visible items for mobile bottom bar navigation
  const mobilePrimaryNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'history', label: 'History', icon: History },
    { id: 'bankrolls', label: 'Bankrolls', icon: Wallet },
    { id: 'bookmakers', label: 'Books', icon: Building2 },
    { id: 'entry', label: 'Log Bet', icon: PlusCircle }
  ];

  // Secondary items accessible via the "More" drawer
  const moreMenuItems = [
    { id: 'calendar', label: 'P&L Calendar', icon: Calendar },
    { id: 'analytics', label: 'Analytics & ROI', icon: PieChart },
    { id: 'scanner', label: 'Betslip OCR Scan', icon: ScanLine },
    { id: 'csv', label: 'CSV Export/Import', icon: FileSpreadsheet },
    { id: 'profile', label: 'Settings & Security', icon: Settings }
  ];

  const isMoreActive = moreMenuItems.some((item) => item.id === activeTab);

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-[#060e20] border-r border-[#1f283d] fixed top-0 left-0 bottom-0 z-40 select-none">
        {/* Brand Header */}
        <div className="p-5 border-b border-[#1f283d] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandLogo size="desktop" />
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-base font-extrabold text-white tracking-tight">BetLogic</h1>
                <span className="text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded bg-[#171f33] text-[#4edea3] border border-[#005236]">
                  PRO
                </span>
              </div>
              <p className="text-[11px] text-[#8d90a0]">Smart Bankroll OS</p>
            </div>
          </div>
        </div>

        {/* Quick Action Button */}
        <div className="p-4 border-b border-[#1f283d]/60 space-y-2">
          <button
            onClick={() => setActiveTab('entry')}
            className="w-full py-2.5 px-3 bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer group"
          >
            <PlusCircle size={16} className="group-hover:rotate-90 transition-transform duration-200" />
            <span>Quick Log Wager</span>
          </button>
          
          <button
            onClick={() => setActiveTab('scanner')}
            className="w-full py-2 px-3 bg-[#171f33] hover:bg-[#222a3d] text-[#b4c5ff] border border-[#27314a] font-semibold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <ScanLine size={15} className="text-[#2563eb]" />
            <span>OCR Slip Reader</span>
          </button>
        </div>

        {/* Nav Links Grouped by Category */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6 custom-scrollbar">
          {navSections.map((section) => (
            <div key={section.title} className="space-y-1">
              <h3 className="px-3 text-[10px] font-bold text-[#8d90a0] uppercase tracking-wider mb-2">
                {section.title}
              </h3>

              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#171f33] text-white shadow-sm border border-[#27314a] relative'
                        : 'text-[#8d90a0] hover:text-[#dae2fd] hover:bg-[#0b1326]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon
                        size={17}
                        className={isActive ? 'text-[#2563eb]' : 'text-[#8d90a0]'}
                      />
                      <span>{item.label}</span>
                    </div>

                    {item.badge ? (
                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-[#2563eb]/20 text-[#b4c5ff] border border-[#2563eb]/30">
                        {item.badge}
                      </span>
                    ) : isActive ? (
                      <div className="w-1.5 h-1.5 rounded-full bg-[#2563eb]"></div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Sidebar Footer Info Widget */}
        <div className="p-4 border-t border-[#1f283d] bg-[#0b1326]/60 space-y-3">
          {/* Win Streak Pill */}
          <div className="flex items-center justify-between bg-[#171f33] border border-[#27314a] px-3 py-2 rounded-xl text-xs">
            <span className="text-[#8d90a0] font-medium text-[11px]">Active Streak:</span>
            <span
              className={`font-bold flex items-center gap-1 ${
                winStreak.streakType === 'win' ? 'text-[#4edea3]' : 'text-[#ffb3ad]'
              }`}
            >
              {winStreak.streakType === 'win' ? '🔥' : '❄️'} {winStreak.currentStreak} {winStreak.streakType.toUpperCase()}
            </span>
          </div>

          <div
            onClick={() => setActiveTab('profile')}
            className="flex items-center gap-3 p-2 rounded-xl hover:bg-[#171f33] transition-colors cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-full bg-[#2563eb]/20 border border-[#2563eb]/40 flex items-center justify-center text-[#2563eb]">
              <User size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-white truncate group-hover:text-[#2563eb] transition-colors">Pro User</div>
              <div className="text-[10px] text-[#8d90a0] truncate">Bankroll Managed</div>
            </div>
            <ChevronRight size={14} className="text-[#8d90a0] group-hover:text-white transition-colors" />
          </div>

          <button
            onClick={onLogout}
            className="w-full mt-2 flex items-center gap-3 p-2 rounded-xl text-red-400 hover:bg-red-400/10 transition-colors cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-full bg-red-400/10 border border-red-400/20 flex items-center justify-center">
              <LogOut size={16} />
            </div>
            <div className="flex-1 text-left">
              <div className="text-xs font-bold">Log Out</div>
              <div className="text-[10px] opacity-70">End your session</div>
            </div>
          </button>
        </div>
      </aside>

      {/* Mobile Sticky Top Header */}
      <header className="md:hidden sticky top-0 z-40 bg-[#060e20]/95 backdrop-blur-md border-b border-[#1f283d] px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <BrandLogo size="mobile" />
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight">BetLogic Pro</h1>
            <p className="text-[10px] text-[#8d90a0]">Sportsbook Analytics</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-[#171f33] border border-[#27314a] px-2 py-1 rounded text-xs">
            <span>{winStreak.streakType === 'win' ? '🔥' : '❄️'}</span>
            <span className={`font-bold text-[11px] ${winStreak.streakType === 'win' ? 'text-[#4edea3]' : 'text-[#ffb3ad]'}`}>
              {winStreak.currentStreak}
            </span>
          </div>

          <button
            onClick={() => setActiveTab('profile')}
            className="p-1.5 rounded bg-[#171f33] text-[#dae2fd] border border-[#27314a]"
          >
            <Bell size={16} />
          </button>

          <button
            onClick={onLogout}
            className="p-1.5 rounded bg-[#171f33] text-red-400 border border-red-400/20"
            title="Log Out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Mobile More Sheet / Drawer */}
      {showMoreDrawer && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/70 backdrop-blur-xs">
          <div 
            className="fixed inset-0 touch-none" 
            onClick={() => setShowMoreDrawer(false)} 
          />
          <div 
            className="relative bg-[#0b1326] border-t border-[#1f283d] rounded-t-2xl p-3.5 shadow-2xl space-y-2.5 z-10"
            style={{ paddingBottom: 'calc(4.25rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="flex items-center justify-between border-b border-[#1f283d] pb-2">
              <div className="flex items-center gap-2">
                <MoreHorizontal size={18} className="text-[#2563eb]" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">More Navigation & Settings</h3>
              </div>
              <button
                onClick={() => setShowMoreDrawer(false)}
                className="p-1.5 rounded-lg bg-[#171f33] text-[#8d90a0] hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-1.5 pt-0.5">
              {moreMenuItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setShowMoreDrawer(false);
                    }}
                    className={`flex items-center gap-3 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-[#171f33] border-[#2563eb] text-white shadow'
                        : 'bg-[#060e20] border-[#1f283d] text-[#8d90a0] hover:text-white hover:bg-[#171f33]'
                    }`}
                  >
                    <Icon size={18} className={isActive ? 'text-[#2563eb]' : 'text-[#8d90a0]'} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Floating Nav Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#060e20] border-t border-[#1f283d] px-1 pb-safe shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
        <div className="grid grid-cols-6 items-center py-1 gap-0.5 w-full max-w-md mx-auto">
          {mobilePrimaryNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setShowMoreDrawer(false);
                }}
                className={`flex flex-col items-center justify-center gap-1 py-1.5 rounded-xl transition-all relative ${
                  isActive 
                    ? 'text-[#2563eb]' 
                    : 'text-[#8d90a0] hover:text-[#dae2fd]'
                }`}
                style={{ minHeight: '52px' }}
              >
                <div className={`p-1.5 rounded-lg transition-colors ${isActive ? 'bg-[#2563eb]/10' : ''}`}>
                  <Icon size={isActive ? 22 : 20} />
                </div>
                <span className={`text-[9px] font-bold uppercase tracking-tighter text-center whitespace-nowrap px-0.5 ${isActive ? 'opacity-100' : 'opacity-70'}`}>
                  {item.label}
                </span>
                {isActive && (
                  <motion.div 
                    layoutId="activeTabIndicator"
                    className="absolute bottom-0 w-8 h-0.5 rounded-full bg-[#2563eb]"
                  />
                )}
              </button>
            );
          })}

          {/* More Tab Button */}
          <button
            onClick={() => setShowMoreDrawer(!showMoreDrawer)}
            className={`flex flex-col items-center justify-center gap-1 py-1.5 rounded-xl transition-all relative ${
              isMoreActive || showMoreDrawer
                ? 'text-[#2563eb]' 
                : 'text-[#8d90a0] hover:text-[#dae2fd]'
            }`}
            style={{ minHeight: '52px' }}
          >
            <div className={`p-1.5 rounded-lg transition-colors ${isMoreActive || showMoreDrawer ? 'bg-[#2563eb]/10' : ''}`}>
              <MoreHorizontal size={isMoreActive || showMoreDrawer ? 22 : 20} />
            </div>
            <span className={`text-[9px] font-bold uppercase tracking-tighter text-center whitespace-nowrap px-0.5 ${isMoreActive || showMoreDrawer ? 'opacity-100' : 'opacity-70'}`}>
              More
            </span>
            {isMoreActive && (
              <motion.div 
                layoutId="activeTabIndicator"
                className="absolute bottom-0 w-8 h-0.5 rounded-full bg-[#2563eb]"
              />
            )}
          </button>
        </div>
      </nav>
    </>
  );
};

