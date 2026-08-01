import React, { useState, useEffect } from 'react';
import { Bookmaker } from '../types';
import { Landmark } from 'lucide-react';

interface BookmakerLogoProps {
  bookmaker: Bookmaker | { name: string; logoUrl?: string; color?: string };
  size?: 'sm' | 'md' | 'lg';
}

export const BookmakerLogo: React.FC<BookmakerLogoProps> = ({ bookmaker, size = 'md' }) => {
  const [hasError, setHasError] = useState(false);

  // Reset error state when the bookmaker logo URL changes
  useEffect(() => {
    setHasError(false);
  }, [bookmaker.logoUrl]);

  const getInitials = (name: string) => {
    const clean = name.trim();
    if (!clean) return '?';
    
    // Explicit requested examples:
    if (clean.toLowerCase().includes('365')) return 'B3';
    if (clean.toLowerCase() === 'betano') return 'BT';
    
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    
    const single = parts[0];
    if (single.toLowerCase().startsWith('bet') && single.length > 3) {
      return ('B' + single.slice(3)[0]).toUpperCase();
    }
    
    return single.slice(0, 2).toUpperCase();
  };

  const initials = getInitials(bookmaker.name);
  const color = bookmaker.color || '#2563eb';

  const sizeClasses = {
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-9 h-9 text-xs',
    lg: 'w-12 h-12 text-sm',
  };

  const iconSizes = {
    sm: 12,
    md: 16,
    lg: 20,
  };

  if (bookmaker.logoUrl && !hasError) {
    return (
      <div 
        className={`${sizeClasses[size]} rounded-full overflow-hidden flex items-center justify-center bg-[#0b1326] border border-[#27314a] shrink-0`}
      >
        <img
          src={bookmaker.logoUrl}
          alt={bookmaker.name}
          referrerPolicy="no-referrer"
          onError={() => setHasError(true)}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  // Fallback styled circular avatar with initials or Landmark icon if initials are not available
  return (
    <div
      style={{
        backgroundColor: `${color}15`,
        borderColor: `${color}40`,
        color: color,
      }}
      className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-black uppercase tracking-wider border shrink-0`}
      title={bookmaker.name}
    >
      {initials ? (
        <span>{initials}</span>
      ) : (
        <Landmark size={iconSizes[size]} />
      )}
    </div>
  );
};
