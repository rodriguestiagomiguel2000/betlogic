import React, { useState } from 'react';
import { UserPreferences } from '../types';
import { Settings, ShieldCheck, Bell, Save, CheckCircle2, Download } from 'lucide-react';

interface UserProfileProps {
  prefs: UserPreferences;
  onUpdatePrefs: (newPrefs: UserPreferences) => void;
}

export const UserProfile: React.FC<UserProfileProps> = ({ prefs, onUpdatePrefs }) => {
  const [formData, setFormData] = useState<UserPreferences>(prefs);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdatePrefs(formData);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto pb-24 md:pb-12">
      <div className="bg-[#171f33] p-5 rounded-xl border border-[#27314a]">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Settings className="text-[#2563eb]" />
          <span>User Profile & Security Settings</span>
        </h2>
        <p className="text-sm text-[#8d90a0] mt-1">
          Manage system preferences, two-factor authentication security, data backup, and notification alerts.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Account Details */}
        <div className="bg-[#171f33] p-6 rounded-xl border border-[#27314a] space-y-4">
          <h3 className="text-base font-bold text-white border-b border-[#27314a] pb-3">
            Account Metadata & Display Preferences
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-[#8d90a0] mb-1">Full Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white"
              />
            </div>

            <div>
              <label className="block text-[#8d90a0] mb-1">Email Address</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white"
              />
            </div>

            <div>
              <label className="block text-[#8d90a0] mb-1">Base Portfolio Currency</label>
              <select
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="CAD">CAD ($)</option>
              </select>
            </div>

            <div>
              <label className="block text-[#8d90a0] mb-1">Odds Notation System</label>
              <select
                value={formData.oddsFormat}
                onChange={(e) => setFormData({ ...formData, oddsFormat: e.target.value as any })}
                className="w-full bg-[#0b1326] border border-[#27314a] rounded px-3 py-2 text-white"
              >
                <option value="decimal">Decimal (e.g. 2.50)</option>
                <option value="american">American (e.g. +150)</option>
                <option value="fractional">Fractional (e.g. 3/2)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Security / 2FA */}
        <div className="bg-[#171f33] p-6 rounded-xl border border-[#27314a] space-y-4">
          <h3 className="text-base font-bold text-white border-b border-[#27314a] pb-3 flex items-center gap-2">
            <ShieldCheck className="text-[#4edea3]" /> Security & Two-Factor Authentication
          </h3>

          <div className="flex items-center justify-between p-4 bg-[#0b1326] rounded-xl border border-[#27314a]">
            <div>
              <div className="font-bold text-white text-sm">Two-Factor Authentication (2FA)</div>
              <p className="text-xs text-[#8d90a0] mt-0.5">Protect bankrolls with TOTP hardware token verification</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.twoFactorEnabled}
                onChange={(e) => setFormData({ ...formData, twoFactorEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-[#171f33] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#2563eb]"></div>
            </label>
          </div>
        </div>

        {/* Notification Preferences */}
        <div className="bg-[#171f33] p-6 rounded-xl border border-[#27314a] space-y-4">
          <h3 className="text-base font-bold text-white border-b border-[#27314a] pb-3 flex items-center gap-2">
            <Bell className="text-[#b4c5ff]" /> Notification & Alert Thresholds
          </h3>

          <div className="space-y-3 text-xs">
            <label className="flex items-center justify-between p-3 bg-[#0b1326] rounded-lg border border-[#27314a] text-white cursor-pointer">
              <span>Win/Loss Streak Milestone Alerts</span>
              <input
                type="checkbox"
                checked={formData.notifications.winStreakAlerts}
                onChange={(e) => setFormData({
                  ...formData,
                  notifications: { ...formData.notifications, winStreakAlerts: e.target.checked }
                })}
              />
            </label>

            <label className="flex items-center justify-between p-3 bg-[#0b1326] rounded-lg border border-[#27314a] text-white cursor-pointer">
              <span>High Risk / Negative EV Warning Alerts</span>
              <input
                type="checkbox"
                checked={formData.notifications.highRiskWarnings}
                onChange={(e) => setFormData({
                  ...formData,
                  notifications: { ...formData.notifications, highRiskWarnings: e.target.checked }
                })}
              />
            </label>

            <label className="flex items-center justify-between p-3 bg-[#0b1326] rounded-lg border border-[#27314a] text-white cursor-pointer">
              <span>Wagering Rollover Completion Milestones</span>
              <input
                type="checkbox"
                checked={formData.notifications.rolloverMilestones}
                onChange={(e) => setFormData({
                  ...formData,
                  notifications: { ...formData.notifications, rolloverMilestones: e.target.checked }
                })}
              />
            </label>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-between">
          {savedSuccess ? (
            <span className="text-xs text-[#4edea3] font-bold flex items-center gap-1">
              <CheckCircle2 size={16} /> Profile Preferences Saved
            </span>
          ) : (
            <span></span>
          )}

          <button
            type="submit"
            className="px-6 py-2.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold text-xs rounded-lg shadow-lg flex items-center gap-2 transition-all cursor-pointer"
          >
            <Save size={16} /> Save Changes
          </button>
        </div>
      </form>
    </div>
  );
};
