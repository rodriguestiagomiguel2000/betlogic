import React from 'react';
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
  LogOut
} from 'lucide-react';
import { APP_LOGO_BASE64 } from '../assets/logoData';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  winStreak: { currentStreak: number; streakType: 'win' | 'loss' };
  onLogout: () => void;
}

const BrandLogo: React.FC<{ size: 'desktop' | 'mobile' }> = ({ size }) => {
  const [hasError, setHasError] = React.useState(false);

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

  // Flat items for mobile bottom bar navigation
  const mobileNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'history', label: 'History', icon: History },
    { id: 'bookmakers', label: 'Books', icon: Building2 },
    { id: 'entry', label: 'Log Bet', icon: PlusCircle },
    { id: 'profile', label: 'Settings', icon: Settings }
  ];

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
      <header className="md:hidden sticky top-0 z-40 bg-[#060e20]/95 backdrop-blur-md border-b border-[#1f283d] px-4 py-3 flex items-center justify-between">
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

      {/* Mobile Bottom Floating Nav Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#060e20] border-t border-[#1f283d] flex items-center justify-around py-2 px-1">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center gap-1 px-2.5 py-1 rounded-lg transition-colors ${
                isActive ? 'text-[#2563eb]' : 'text-[#8d90a0] hover:text-[#dae2fd]'
              }`}
            >
              <Icon size={18} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
