import { Bet, UserPreferences, Bankroll, Bookmaker, TagDefinition, BankrollTransaction } from '../types';

const API_BASE_URL = '/api';

/**
 * Get the stored JWT auth token from localStorage
 */
export function getAuthToken(): string | null {
  return localStorage.getItem('betlogic_jwt_token');
}

/**
 * Set the JWT auth token in localStorage
 */
export function setAuthToken(token: string | null): void {
  if (token) {
    localStorage.setItem('betlogic_jwt_token', token);
  } else {
    localStorage.removeItem('betlogic_jwt_token');
  }
}

/**
 * Remove active session details
 */
export function logoutUser(): void {
  localStorage.removeItem('betlogic_jwt_token');
  localStorage.removeItem('betlogic_active_user');
}

/**
 * Check if the user is currently authenticated
 */
export function isAuthenticated(): boolean {
  return !!getAuthToken();
}

/**
 * Generic fetch client that appends JWT Authorization headers automatically
 */
async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401 || response.status === 403) {
    logoutUser();
    window.dispatchEvent(new Event('auth-logout'));
    throw new Error('Session expired or unauthorized. Please log in again.');
  }

  if (!response.ok) {
    let errorMsg = `API request failed with status ${response.status}`;
    try {
      const errorJson = await response.json();
      if (errorJson && errorJson.error) {
        errorMsg = errorJson.error;
      }
    } catch {
      // Use fallback error
    }
    throw new Error(errorMsg);
  }

  return response.json() as Promise<T>;
}

// ==========================================
// AUTHENTICATION ENDPOINTS
// ==========================================

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    currency: string;
    activeBankrollId?: string;
  };
}

export const authApi = {
  async register(data: { name: string; email: string; password?: string; currency?: string }): Promise<AuthResponse> {
    const res = await apiRequest<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    setAuthToken(res.token);
    localStorage.setItem('betlogic_active_user', JSON.stringify(res.user));
    return res;
  },

  async login(data: { email: string; password?: string }): Promise<AuthResponse> {
    const res = await apiRequest<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    setAuthToken(res.token);
    localStorage.setItem('betlogic_active_user', JSON.stringify(res.user));
    return res;
  },

  async getProfile(): Promise<any> {
    return apiRequest<any>('/auth/me');
  },

  async updateProfile(data: { name?: string; currency?: string; oddsFormat?: string; activeBankrollId?: string }): Promise<any> {
    return apiRequest<any>('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }
};

// ==========================================
// BANKROLLS API
// ==========================================

export const bankrollsApi = {
  async list(): Promise<Bankroll[]> {
    return apiRequest<Bankroll[]>('/bankrolls');
  },

  async create(data: Omit<Bankroll, 'id'>): Promise<Bankroll> {
    return apiRequest<Bankroll>('/bankrolls', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async update(id: string, data: Partial<Bankroll>): Promise<Bankroll> {
    return apiRequest<Bankroll>(`/bankrolls/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async delete(id: string): Promise<{ message: string }> {
    return apiRequest<{ message: string }>(`/bankrolls/${id}`, {
      method: 'DELETE',
    });
  },

  async reorder(bankrollIds: string[]): Promise<{ message: string }> {
    return apiRequest<{ message: string }>('/bankrolls/reorder', {
      method: 'PUT',
      body: JSON.stringify({ bankrollIds }),
    });
  },

  async transactions(id: string): Promise<BankrollTransaction[]> {
    return apiRequest<BankrollTransaction[]>(`/bankrolls/${id}/transactions`);
  }
};

// ==========================================
// BOOKMAKERS API
// ==========================================

export const bookmakersApi = {
  async list(): Promise<Bookmaker[]> {
    return apiRequest<Bookmaker[]>('/bookmakers');
  },

  async create(data: Omit<Bookmaker, 'id'>): Promise<Bookmaker> {
    return apiRequest<Bookmaker>('/bookmakers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async update(id: string, data: Partial<Bookmaker>): Promise<Bookmaker> {
    return apiRequest<Bookmaker>(`/bookmakers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async transaction(id: string, data: { bankrollId: string; type: 'deposit' | 'withdraw' | 'freebet'; amount: number }): Promise<Bookmaker> {
    return apiRequest<Bookmaker>(`/bookmakers/${id}/transactions`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async delete(id: string): Promise<{ message: string }> {
    return apiRequest<{ message: string }>(`/bookmakers/${id}`, {
      method: 'DELETE',
    });
  }
};

// ==========================================
// TRANSFERS API
// ==========================================

export const transfersApi = {
  async list(): Promise<any[]> {
    return apiRequest<any[]>('/bankroll-transfers');
  },

  async create(data: any): Promise<any> {
    return apiRequest<any>('/bankroll-transfers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
};

// ==========================================
// TAGS API
// ==========================================

export const tagsApi = {
  async list(): Promise<TagDefinition[]> {
    return apiRequest<TagDefinition[]>('/tags');
  },

  async create(data: { name: string; color?: string }): Promise<TagDefinition> {
    return apiRequest<TagDefinition>('/tags', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async delete(id: string): Promise<{ message: string }> {
    return apiRequest<{ message: string }>(`/tags/${id}`, {
      method: 'DELETE',
    });
  }
};

// ==========================================
// BETS CRUD ENDPOINTS
// ==========================================

export const betsApi = {
  async list(filters?: { startDate?: string; endDate?: string; bankrollId?: string }): Promise<Bet[]> {
    let query = '';
    if (filters) {
      const params = new URLSearchParams();
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.bankrollId) params.append('bankrollId', filters.bankrollId);
      query = `?${params.toString()}`;
    }
    return apiRequest<Bet[]>(`/bets${query}`);
  },

  async create(bet: Omit<Bet, 'id'>): Promise<{ id: string; message: string }> {
    return apiRequest<{ id: string; message: string }>('/bets', {
      method: 'POST',
      body: JSON.stringify(bet),
    });
  },

  async update(id: string, bet: Bet): Promise<{ message: string }> {
    return apiRequest<{ message: string }>(`/bets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(bet),
    });
  },

  async delete(id: string): Promise<{ message: string }> {
    return apiRequest<{ message: string }>(`/bets/${id}`, {
      method: 'DELETE',
    });
  }
};

// ==========================================
// ANALYTICS & CALENDAR ENDPOINTS
// ==========================================

export interface MonthlyCalendarAnalytics {
  year: number;
  month: number;
  dailyData: Record<
    number,
    {
      pnl: number;
      betCount: number;
      hasPending: boolean;
    }
  >;
}

export interface PerformanceSummary {
  totalBets: number;
  wonBets: number;
  lostBets: number;
  pendingBets: number;
  totalStaked: number;
  totalPnL: number;
  winRate: number;
  roi: number;
}

export const analyticsApi = {
  async getMonthlyCalendar(year: number, month: number): Promise<MonthlyCalendarAnalytics> {
    return apiRequest<MonthlyCalendarAnalytics>(`/analytics/pnl-calendar?year=${year}&month=${month}`);
  },

  async getPerformanceSummary(): Promise<PerformanceSummary> {
    return apiRequest<PerformanceSummary>('/analytics/summary');
  }
};
