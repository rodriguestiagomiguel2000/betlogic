import React, { useState, useEffect } from 'react';
import { AlertTriangle, X, Check, RotateCcw } from 'lucide-react';
import { formatOdds } from '../utils/storage';

interface VoidLegModalProps {
  isOpen: boolean;
  legSelection: string;
  currentTotalOdds: number;
  suggestedTotalOdds: number;
  onConfirm: (confirmedTotalOdds: number) => void;
  onCancel: () => void;
}

export const VoidLegModal: React.FC<VoidLegModalProps> = ({
  isOpen,
  legSelection,
  currentTotalOdds,
  suggestedTotalOdds,
  onConfirm,
  onCancel,
}) => {
  const [oddsInput, setOddsInput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setOddsInput(suggestedTotalOdds.toFixed(3));
      setError(null);
    }
  }, [isOpen, suggestedTotalOdds]);

  if (!isOpen) return null;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setOddsInput(val);
    const num = parseFloat(val);
    if (isNaN(num) || num < 1.0) {
      setError('Odds must be at least 1.000');
    } else {
      setError(null);
    }
  };

  const handleReset = () => {
    setOddsInput(suggestedTotalOdds.toFixed(3));
    setError(null);
  };

  const handleConfirm = () => {
    const num = parseFloat(oddsInput);
    if (isNaN(num) || num < 1.0) {
      setError('Please enter a valid odds value (at least 1.000)');
      return;
    }
    onConfirm(Number(num.toFixed(3)));
  };

  const isChangedFromSuggested =
    !isNaN(parseFloat(oddsInput)) &&
    Math.abs(parseFloat(oddsInput) - suggestedTotalOdds) > 0.0001;

  return (
    <div
      id="void-leg-modal-backdrop"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        id="void-leg-modal"
        className="bg-[#171f33] border border-[#27314a] rounded-xl p-6 max-w-md w-full space-y-4 shadow-2xl text-white animate-fade-in"
      >
        <div className="flex items-center justify-between pb-2 border-b border-[#27314a]">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <AlertTriangle className="text-amber-400" size={20} />
            <span>Confirm Void Leg &amp; Odds</span>
          </h3>
          <button
            id="void-leg-modal-close-btn"
            onClick={onCancel}
            className="text-[#8d90a0] hover:text-white p-1 rounded-lg hover:bg-[#27314a] transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-[#c5c6d0] leading-relaxed">
          Marking <span className="text-[#b4c5ff] font-semibold underline decoration-blue-500/40 underline-offset-2">{legSelection}</span> as VOID changes this bet&apos;s total odds.
        </p>

        {/* 3 Pieces of Information */}
        <div className="bg-[#0b1326] p-4 rounded-lg border border-[#27314a] space-y-3">
          {/* Piece 1 & Piece 2 */}
          <div className="grid grid-cols-2 gap-3 pb-3 border-b border-[#1b253b]">
            <div>
              <span className="block text-[11px] font-medium text-[#8d90a0] uppercase tracking-wider">
                Current Total Odds
              </span>
              <span className="text-sm font-mono font-bold text-white mt-0.5 block">
                @{formatOdds(currentTotalOdds)}
              </span>
            </div>
            <div>
              <span className="block text-[11px] font-medium text-[#8d90a0] uppercase tracking-wider">
                Suggested New Total Odds
              </span>
              <span className="text-sm font-mono font-bold text-[#4edea3] mt-0.5 block">
                @{formatOdds(suggestedTotalOdds)}
              </span>
            </div>
          </div>

          {/* Piece 3: Editable numeric input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="void-leg-odds-input"
                className="text-xs font-semibold text-[#8d90a0]"
              >
                Final Total Odds (Editable)
              </label>
              {isChangedFromSuggested && (
                <button
                  id="void-leg-reset-suggested-btn"
                  type="button"
                  onClick={handleReset}
                  className="text-[11px] text-[#2563eb] hover:text-[#528eff] flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw size={11} /> Reset to Suggested
                </button>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-mono text-[#8d90a0]">
                @
              </span>
              <input
                id="void-leg-odds-input"
                type="number"
                step="0.001"
                min="1.0"
                value={oddsInput}
                onChange={handleInputChange}
                className="w-full bg-[#131b2e] border border-[#27314a] focus:border-[#2563eb] rounded-lg pl-7 pr-3 py-2 text-sm font-mono text-white focus:outline-none"
                placeholder="1.000"
                autoFocus
              />
            </div>
            {error ? (
              <p className="text-[11px] text-[#ffb3ad]">{error}</p>
            ) : (
              <p className="text-[11px] text-[#8d90a0]">
                Pre-filled with the calculated odds. You can adjust this if your bookmaker applied a different settlement value.
              </p>
            )}
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            id="void-leg-modal-cancel-btn"
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-[#1b253b] hover:bg-[#27314a] text-gray-300 hover:text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            id="void-leg-modal-confirm-btn"
            type="button"
            onClick={handleConfirm}
            disabled={!!error || !oddsInput}
            className="px-4 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-lg shadow-blue-500/20"
          >
            <Check size={15} /> Confirm
          </button>
        </div>
      </div>
    </div>
  );
};
