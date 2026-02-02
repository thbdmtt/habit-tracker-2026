import React, { useState, useEffect, useCallback, useMemo, useReducer, useRef } from 'react';

// --- TYPES ---

interface Habit {
  id: string;
  icon: string;
  name: string;
  active: boolean;
}

interface DailyLog {
  date: string; // YYYY-MM-DD
  habitId: string;
  completed: boolean;
}

interface MoodLog {
  date: string; // YYYY-MM-DD
  moodScore: number; // 1-10
  motivationScore: number; // 1-10
}

interface AppState {
  habits: Habit[];
  dailyLogs: DailyLog[];
  moodLogs: MoodLog[];
  currentView: 'today' | 'calendar' | 'stats' | 'settings';
  currentMonth: Date;
  isLoading: boolean;
  isSyncing: boolean;
  error: string | null;
}

interface Config {
  spreadsheetId: string;
  apiKey: string;
}

interface Theme {
  colors: {
    bgPrimary: string;
    bgSecondary: string;
    bgTertiary: string;
    bgElevated: string;
    borderSubtle: string;
    borderDefault: string;
    textPrimary: string;
    textSecondary: string;
    textTertiary: string;
    accent: string;
    accentHover: string;
    accentLight: string;
    success: string;
    successLight: string;
    warning: string;
    error: string;
  };
  spacing: Record<string, string>;
  fontSize: Record<string, string>;
  radius: Record<string, string>;
  shadow: Record<string, string>;
  transition: Record<string, string>;
  fontFamily: string;
}

// --- THEME & CONSTANTS ---

const themeLight: Theme = {
  colors: {
    bgPrimary: '#FFFFFF',
    bgSecondary: '#F8F9FA',
    bgTertiary: '#F1F3F4',
    bgElevated: '#FFFFFF',
    borderSubtle: '#E8EAED',
    borderDefault: '#DADCE0',
    textPrimary: '#1F1F1F',
    textSecondary: '#5F6368',
    textTertiary: '#80868B',
    accent: '#1A73E8',
    accentHover: '#1557B0',
    accentLight: 'rgba(26, 115, 232, 0.08)',
    success: '#1E8E3E',
    successLight: 'rgba(30, 142, 62, 0.1)',
    warning: '#F9AB00',
    error: '#D93025',
  },
  spacing: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '20px', xxl: '24px', xxxl: '32px' },
  fontSize: { xs: '0.6875rem', sm: '0.8125rem', base: '0.875rem', lg: '1rem', xl: '1.125rem', xxl: '1.375rem' },
  radius: { sm: '4px', md: '8px', lg: '12px', full: '9999px' },
  shadow: { sm: '0 1px 2px rgba(0,0,0,0.04)', md: '0 2px 8px rgba(0,0,0,0.06)', lg: '0 4px 16px rgba(0,0,0,0.08)' },
  transition: { fast: '150ms ease-out', normal: '200ms ease-in-out' },
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
};

const themeDark: Theme = {
  ...themeLight,
  colors: {
    ...themeLight.colors,
    bgPrimary: '#1E1E1E',
    bgSecondary: '#252525',
    bgTertiary: '#2D2D2D',
    bgElevated: '#333333',
    borderSubtle: '#3C3C3C',
    borderDefault: '#4A4A4A',
    textPrimary: '#E8EAED',
    textSecondary: '#9AA0A6',
    textTertiary: '#6E7681',
    accent: '#8AB4F8',
    accentHover: '#AECBFA',
    accentLight: 'rgba(138, 180, 248, 0.12)',
    success: '#81C995',
    successLight: 'rgba(129, 201, 149, 0.15)',
  },
  shadow: { sm: '0 1px 2px rgba(0,0,0,0.2)', md: '0 2px 8px rgba(0,0,0,0.3)', lg: '0 4px 16px rgba(0,0,0,0.4)' },
};

const defaultHabits: Habit[] = [
  { id: 'h1', icon: '⏰', name: 'Se lever à 06:00', active: true },
  { id: 'h2', icon: '💪', name: 'Sport / Gym', active: true },
  { id: 'h3', icon: '📚', name: 'Lecture', active: true },
  { id: 'h4', icon: '📋', name: 'Planification', active: true },
  { id: 'h5', icon: '🎯', name: 'Travail sur projet', active: true },
  { id: 'h6', icon: '🚫', name: "Pas d'alcool", active: true },
  { id: 'h7', icon: '📱', name: 'Détox réseaux', active: true },
  { id: 'h8', icon: '✍️', name: 'Journaling', active: true },
  { id: 'h9', icon: '🚿', name: 'Douche froide', active: true },
  { id: 'h10', icon: '🧘', name: 'Méditation', active: true },
];

// --- HELPERS ---

const formatDateFR = (date: Date): string => {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
};

const toISODate = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

const getDaysInMonth = (date: Date) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const days = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay(); // 0 is Sunday
  // Adjust for Monday start
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;
  return { days, startOffset };
};

// --- HOOKS ---

const useTheme = () => {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isDark ? themeDark : themeLight;
};

const useLocalStorage = <T,>(key: string, initialValue: T): [T, (value: T) => void] => {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  const setValue = (value: T) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(error);
    }
  };

  return [storedValue, setValue];
};

const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    if (media.matches !== matches) {
      setMatches(media.matches);
    }
    const listener = () => setMatches(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [matches, query]);
  return matches;
};

// --- API HOOK ---

const useGoogleSheets = (config: Config) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mock data persistence for demo purposes if API is not set
  const [localHabits, setLocalHabits] = useLocalStorage<Habit[]>('ht_habits', defaultHabits);
  const [localDailyLogs, setLocalDailyLogs] = useLocalStorage<DailyLog[]>('ht_dailyLogs', []);
  const [localMoodLogs, setLocalMoodLogs] = useLocalStorage<MoodLog[]>('ht_moodLogs', []);

  const hasConfig = !!config.apiKey && !!config.spreadsheetId;

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    if (!hasConfig) {
      // Return local data
      setTimeout(() => setIsLoading(false), 500); // Simulate network
      return { habits: localHabits, dailyLogs: localDailyLogs, moodLogs: localMoodLogs };
    }

    try {
      // In a real app with proper OAuth, we would fetch ranges: 'Habits!A2:D', 'DailyLogs!A2:C', 'MoodLogs!A2:C'
      // Since we can't easily do public read/write without OAuth or a proxy, 
      // we will simulate the fetch success but strictly use LocalStorage for this demo 
      // to ensure the app is interactive for the user.
      
      /* 
      const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values`;
      const hRes = await fetch(`${baseUrl}/Habits!A2:D?key=${config.apiKey}`);
      const dRes = await fetch(`${baseUrl}/DailyLogs!A2:C?key=${config.apiKey}`);
      const mRes = await fetch(`${baseUrl}/MoodLogs!A2:C?key=${config.apiKey}`);
      
      if (!hRes.ok || !dRes.ok || !mRes.ok) throw new Error("Failed to fetch from Sheets");
      */
      
      // Simulate success
      await new Promise(resolve => setTimeout(resolve, 800));
      return { habits: localHabits, dailyLogs: localDailyLogs, moodLogs: localMoodLogs };

    } catch (err: any) {
      setError(err.message || 'Error syncing');
      return { habits: localHabits, dailyLogs: localDailyLogs, moodLogs: localMoodLogs };
    } finally {
      setIsLoading(false);
    }
  }, [hasConfig, config.apiKey, config.spreadsheetId, localHabits, localDailyLogs, localMoodLogs]);

  const updateDailyLog = async (date: string, habitId: string, completed: boolean) => {
    // Optimistic Update locally
    const existingIndex = localDailyLogs.findIndex(l => l.date === date && l.habitId === habitId);
    let newLogs = [...localDailyLogs];
    
    if (existingIndex >= 0) {
      newLogs[existingIndex] = { date, habitId, completed };
    } else {
      newLogs.push({ date, habitId, completed });
    }
    
    // Filter out false completions to save space if desired, or keep them to track "unchecked"
    // For this logic, we keep explicit states.
    setLocalDailyLogs(newLogs);

    if (hasConfig) {
       setIsSyncing(true);
       // Here would be the PUT/APPEND logic to Google Sheets
       // e.g., finding the row and updating, or appending a new log line
       await new Promise(resolve => setTimeout(resolve, 500));
       setIsSyncing(false);
    }
  };

  const updateMoodLog = async (date: string, moodScore: number, motivationScore: number) => {
    const existingIndex = localMoodLogs.findIndex(l => l.date === date);
    let newLogs = [...localMoodLogs];

    if (existingIndex >= 0) {
      newLogs[existingIndex] = { date, moodScore, motivationScore };
    } else {
      newLogs.push({ date, moodScore, motivationScore });
    }
    setLocalMoodLogs(newLogs);
    
    if (hasConfig) {
      setIsSyncing(true);
      await new Promise(resolve => setTimeout(resolve, 500));
      setIsSyncing(false);
    }
  };

  return {
    data: { habits: localHabits, dailyLogs: localDailyLogs, moodLogs: localMoodLogs },
    isLoading,
    isSyncing,
    error,
    refetch: fetchData,
    updateDailyLog,
    updateMoodLog
  };
};

// --- REDUCER ---

type Action =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_SYNCING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_DATA'; payload: { habits: Habit[]; dailyLogs: DailyLog[]; moodLogs: MoodLog[] } }
  | { type: 'SET_VIEW'; payload: AppState['currentView'] }
  | { type: 'SET_MONTH'; payload: Date }
  | { type: 'TOGGLE_HABIT'; payload: { date: string; habitId: string } }
  | { type: 'UPDATE_MOOD'; payload: MoodLog };

const initialState: AppState = {
  habits: [],
  dailyLogs: [],
  moodLogs: [],
  currentView: 'today',
  currentMonth: new Date(),
  isLoading: true,
  isSyncing: false,
  error: null,
};

const reducer = (state: AppState, action: Action): AppState => {
  switch (action.type) {
    case 'SET_LOADING': return { ...state, isLoading: action.payload };
    case 'SET_SYNCING': return { ...state, isSyncing: action.payload };
    case 'SET_ERROR': return { ...state, error: action.payload };
    case 'SET_DATA': return { ...state, ...action.payload, isLoading: false };
    case 'SET_VIEW': return { ...state, currentView: action.payload };
    case 'SET_MONTH': return { ...state, currentMonth: action.payload };
    case 'TOGGLE_HABIT': {
      const { date, habitId } = action.payload;
      const existingLog = state.dailyLogs.find(l => l.date === date && l.habitId === habitId);
      const completed = existingLog ? !existingLog.completed : true;
      const newLogs = state.dailyLogs.filter(l => !(l.date === date && l.habitId === habitId));
      newLogs.push({ date, habitId, completed });
      return { ...state, dailyLogs: newLogs };
    }
    case 'UPDATE_MOOD': {
      const newMoods = state.moodLogs.filter(l => l.date !== action.payload.date);
      newMoods.push(action.payload);
      return { ...state, moodLogs: newMoods };
    }
    default: return state;
  }
};

// --- ICONS ---

const Icon: React.FC<{ name: string; className?: string }> = ({ name, className }) => {
  const props = {
    className: className || '',
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case 'check': return <svg {...props}><polyline points="20 6 9 17 4 12"></polyline></svg>;
    case 'calendar': return <svg {...props}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>;
    case 'chart-bar': return <svg {...props}><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>;
    case 'settings': return <svg {...props}><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>;
    case 'chevron-left': return <svg {...props}><polyline points="15 18 9 12 15 6"></polyline></svg>;
    case 'chevron-right': return <svg {...props}><polyline points="9 18 15 12 9 6"></polyline></svg>;
    case 'target': return <svg {...props}><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>;
    default: return null;
  }
};

// --- UI COMPONENTS ---

const Checkbox: React.FC<{ checked: boolean; onChange: () => void; disabled?: boolean; theme: Theme }> = ({ checked, onChange, disabled, theme }) => {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      style={{
        width: '24px',
        height: '24px',
        borderRadius: theme.radius.sm,
        border: checked ? 'none' : `2px solid ${theme.colors.borderDefault}`,
        backgroundColor: checked ? theme.colors.success : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: `all ${theme.transition.fast}`,
        transform: checked ? 'scale(1)' : 'scale(1)',
      }}
      className="active:scale-90"
      aria-label={checked ? "Mark as incomplete" : "Mark as complete"}
    >
      <div style={{
        opacity: checked ? 1 : 0,
        transform: checked ? 'scale(1)' : 'scale(0.5)',
        transition: `all ${theme.transition.fast}`,
        color: '#FFF'
      }}>
        <Icon name="check" />
      </div>
    </button>
  );
};

const ProgressBar: React.FC<{ value: number; theme: Theme }> = ({ value, theme }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, width: '100%' }}>
    <div style={{ flex: 1, height: '8px', backgroundColor: theme.colors.bgTertiary, borderRadius: theme.radius.full, overflow: 'hidden' }}>
      <div style={{
        width: `${Math.max(0, Math.min(100, value))}%`,
        height: '100%',
        backgroundColor: theme.colors.success,
        borderRadius: theme.radius.full,
        transition: `width ${theme.transition.normal}`,
      }} />
    </div>
    <span style={{ fontSize: theme.fontSize.xs, color: theme.colors.textSecondary, minWidth: '32px', textAlign: 'right' }}>
      {Math.round(value)}%
    </span>
  </div>
);

const HabitCard: React.FC<{ habit: Habit; completed: boolean; onToggle: () => void; theme: Theme }> = ({ habit, completed, onToggle, theme }) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: theme.spacing.lg,
        backgroundColor: theme.colors.bgElevated,
        borderRadius: theme.radius.lg,
        border: `1px solid ${theme.colors.borderSubtle}`,
        boxShadow: theme.shadow.sm,
        marginBottom: theme.spacing.md,
        transition: `all ${theme.transition.fast}`,
      }}
      className="hover:shadow-md hover:-translate-y-0.5"
    >
      <span style={{ fontSize: theme.fontSize.xl, marginRight: theme.spacing.lg }}>{habit.icon}</span>
      <span style={{ flex: 1, color: theme.colors.textPrimary, fontWeight: 500 }}>{habit.name}</span>
      <Checkbox checked={completed} onChange={onToggle} theme={theme} />
    </div>
  );
};

const MoodSlider: React.FC<{
  label: string;
  value: number;
  onChange: (val: number) => void;
  emoji?: { low: string; mid: string; high: string };
  theme: Theme;
}> = ({ label, value, onChange, emoji, theme }) => {
  const getEmoji = () => {
    if (!emoji) return '';
    if (value <= 3) return emoji.low;
    if (value <= 7) return emoji.mid;
    return emoji.high;
  };

  return (
    <div style={{ marginBottom: theme.spacing.lg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: theme.spacing.sm }}>
        <span style={{ fontSize: theme.fontSize.sm, color: theme.colors.textSecondary }}>{label}</span>
        <span style={{ fontSize: theme.fontSize.lg }}>{getEmoji()} <span style={{fontSize: theme.fontSize.sm, color: theme.colors.textTertiary, fontWeight: 600}}>{value}</span></span>
      </div>
      <input
        type="range"
        min="1"
        max="10"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        style={{
          width: '100%',
          height: '6px',
          background: theme.colors.bgTertiary,
          borderRadius: theme.radius.full,
          outline: 'none',
          appearance: 'none',
          cursor: 'pointer'
        }}
        className="mood-slider"
      />
      <style>{`
        .mood-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: ${theme.colors.accent};
          cursor: pointer;
          transition: transform 0.1s;
        }
        .mood-slider::-webkit-slider-thumb:hover {
          transform: scale(1.2);
        }
      `}</style>
    </div>
  );
};

// --- VIEWS ---

const TodayView: React.FC<{
  state: AppState;
  onToggle: (id: string) => void;
  onMoodChange: (type: 'mood' | 'motivation', val: number) => void;
  theme: Theme;
}> = ({ state, onToggle, onMoodChange, theme }) => {
  const today = toISODate(new Date());
  
  const completionRate = useMemo(() => {
    const todayLogs = state.dailyLogs.filter(l => l.date === today && l.completed);
    if (state.habits.length === 0) return 0;
    return (todayLogs.length / state.habits.length) * 100;
  }, [state.dailyLogs, state.habits, today]);

  const todayMood = state.moodLogs.find(l => l.date === today) || { moodScore: 5, motivationScore: 5 };

  return (
    <div style={{ animation: `fadeIn 400ms ease-out` }}>
      <div style={{ marginBottom: theme.spacing.xxl }}>
        <h2 style={{ fontSize: theme.fontSize.xxl, fontWeight: 700, color: theme.colors.textPrimary, marginBottom: theme.spacing.xs }}>
          {formatDateFR(new Date())}
        </h2>
        <div style={{ marginTop: theme.spacing.md }}>
          <ProgressBar value={completionRate} theme={theme} />
        </div>
      </div>

      <div style={{ marginBottom: theme.spacing.xxl }}>
        {state.habits.map(habit => {
          const isCompleted = state.dailyLogs.some(l => l.date === today && l.habitId === habit.id && l.completed);
          return (
            <HabitCard
              key={habit.id}
              habit={habit}
              completed={isCompleted}
              onToggle={() => onToggle(habit.id)}
              theme={theme}
            />
          );
        })}
      </div>

      <div style={{ 
        padding: theme.spacing.xl, 
        backgroundColor: theme.colors.bgElevated, 
        borderRadius: theme.radius.lg,
        border: `1px solid ${theme.colors.borderSubtle}`
      }}>
        <h3 style={{ fontSize: theme.fontSize.lg, fontWeight: 600, color: theme.colors.textPrimary, marginBottom: theme.spacing.lg }}>Daily Reflection</h3>
        <MoodSlider
          label="Mood"
          value={todayMood.moodScore}
          onChange={(val) => onMoodChange('mood', val)}
          emoji={{ low: '😔', mid: '😐', high: '😊' }}
          theme={theme}
        />
        <MoodSlider
          label="Motivation"
          value={todayMood.motivationScore}
          onChange={(val) => onMoodChange('motivation', val)}
          emoji={{ low: '🐌', mid: '🚶', high: '🚀' }}
          theme={theme}
        />
      </div>
    </div>
  );
};

const CalendarView: React.FC<{ state: AppState; theme: Theme }> = ({ state, theme }) => {
  const { days, startOffset } = getDaysInMonth(state.currentMonth);
  const totalSlots = days + startOffset;
  const rows = Math.ceil(totalSlots / 7);

  const getDayData = (day: number) => {
    const date = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth(), day);
    const iso = toISODate(date);
    const logs = state.dailyLogs.filter(l => l.date === iso && l.completed);
    const rate = state.habits.length > 0 ? (logs.length / state.habits.length) * 100 : 0;
    return { date, rate, iso };
  };

  return (
    <div style={{ animation: `fadeIn 400ms ease-out` }}>
       <div style={{ 
         display: 'grid', 
         gridTemplateColumns: 'repeat(7, 1fr)', 
         gap: theme.spacing.sm,
         marginBottom: theme.spacing.md
       }}>
         {['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'].map(d => (
           <div key={d} style={{ textAlign: 'center', fontSize: theme.fontSize.xs, color: theme.colors.textTertiary, fontWeight: 600 }}>{d}</div>
         ))}
       </div>
       
       <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: theme.spacing.sm }}>
         {Array.from({ length: rows * 7 }).map((_, idx) => {
           const dayNum = idx - startOffset + 1;
           if (dayNum < 1 || dayNum > days) {
             return <div key={idx} />;
           }
           
           const { date, rate, iso } = getDayData(dayNum);
           const isToday = iso === toISODate(new Date());
           
           let bgColor = theme.colors.bgTertiary;
           let textColor = theme.colors.textSecondary;
           
           if (rate >= 80) { bgColor = theme.colors.success; textColor = '#FFF'; }
           else if (rate >= 40) { bgColor = theme.colors.warning; textColor = '#FFF'; }
           else if (rate > 0) { bgColor = theme.colors.textTertiary; textColor = '#FFF'; }

           return (
             <div
                key={idx}
                style={{
                  aspectRatio: '1',
                  borderRadius: theme.radius.md,
                  backgroundColor: bgColor,
                  color: textColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: theme.fontSize.sm,
                  fontWeight: 600,
                  border: isToday ? `2px solid ${theme.colors.accent}` : 'none',
                  cursor: 'pointer',
                  transition: 'transform 0.2s',
                }}
                className="hover:scale-105"
                title={`${iso}: ${Math.round(rate)}%`}
             >
               {dayNum}
             </div>
           );
         })}
       </div>
    </div>
  );
};

const StatsView: React.FC<{ state: AppState; theme: Theme }> = ({ state, theme }) => {
  const stats = useMemo(() => {
    // Basic stats logic
    const totalLogs = state.dailyLogs.filter(l => l.completed).length;
    
    // Calculate current streak (simplified for demo)
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
        const d = new Date();
        d.setDate(today.getDate() - i);
        const iso = toISODate(d);
        const dayLogs = state.dailyLogs.filter(l => l.date === iso && l.completed);
        const dayRate = state.habits.length > 0 ? dayLogs.length / state.habits.length : 0;
        if (dayRate >= 1) streak++;
        else if (i > 0) break; // Break if not today and missed
    }

    return { totalLogs, streak };
  }, [state.dailyLogs, state.habits]);

  const StatBox: React.FC<{ title: string; value: string | number; }> = ({ title, value }) => (
    <div style={{ padding: theme.spacing.lg, backgroundColor: theme.colors.bgElevated, borderRadius: theme.radius.lg, border: `1px solid ${theme.colors.borderSubtle}`, flex: 1 }}>
      <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</div>
      <div style={{ fontSize: theme.fontSize.xxl, fontWeight: 700, color: theme.colors.textPrimary, marginTop: theme.spacing.xs }}>{value}</div>
    </div>
  );

  return (
    <div style={{ animation: `fadeIn 400ms ease-out`, display: 'flex', flexDirection: 'column', gap: theme.spacing.lg }}>
      <div style={{ display: 'flex', gap: theme.spacing.lg }}>
        <StatBox title="Current Streak" value={`${stats.streak} Days`} />
        <StatBox title="Total Habits" value={stats.totalLogs} />
      </div>

      <div style={{ padding: theme.spacing.lg, backgroundColor: theme.colors.bgElevated, borderRadius: theme.radius.lg, border: `1px solid ${theme.colors.borderSubtle}` }}>
        <h3 style={{ fontSize: theme.fontSize.md, fontWeight: 600, marginBottom: theme.spacing.lg, color: theme.colors.textPrimary }}>Habit Performance</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
          {state.habits.map(h => {
             const count = state.dailyLogs.filter(l => l.habitId === h.id && l.completed).length;
             // Approximate max for visualization
             const max = 30; 
             const pct = Math.min(100, (count / max) * 100);
             return (
               <div key={h.id}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: theme.fontSize.sm, marginBottom: theme.spacing.xs, color: theme.colors.textSecondary }}>
                    <span>{h.icon} {h.name}</span>
                    <span>{count}</span>
                 </div>
                 <div style={{ height: '6px', backgroundColor: theme.colors.bgTertiary, borderRadius: theme.radius.full }}>
                   <div style={{ width: `${pct}%`, height: '100%', backgroundColor: theme.colors.accent, borderRadius: theme.radius.full }} />
                 </div>
               </div>
             )
          })}
        </div>
      </div>
    </div>
  );
};

const SettingsView: React.FC<{ config: Config; onConfigSave: (c: Config) => void; theme: Theme }> = ({ config, onConfigSave, theme }) => {
  const [localConfig, setLocalConfig] = useState(config);

  return (
    <div style={{ animation: `fadeIn 400ms ease-out` }}>
      <div style={{ padding: theme.spacing.xl, backgroundColor: theme.colors.bgElevated, borderRadius: theme.radius.lg, border: `1px solid ${theme.colors.borderSubtle}` }}>
        <h3 style={{ fontSize: theme.fontSize.lg, fontWeight: 600, color: theme.colors.textPrimary, marginBottom: theme.spacing.lg }}>Connection Settings</h3>
        <p style={{ fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, marginBottom: theme.spacing.lg }}>
          Connect your Google Sheet to sync data across devices.
        </p>
        
        <div style={{ marginBottom: theme.spacing.lg }}>
          <label style={{ display: 'block', fontSize: theme.fontSize.sm, fontWeight: 500, color: theme.colors.textPrimary, marginBottom: theme.spacing.xs }}>Spreadsheet ID</label>
          <input 
            type="text" 
            value={localConfig.spreadsheetId} 
            onChange={e => setLocalConfig({...localConfig, spreadsheetId: e.target.value})}
            style={{ width: '100%', padding: theme.spacing.md, borderRadius: theme.radius.md, border: `1px solid ${theme.colors.borderDefault}`, backgroundColor: theme.colors.bgPrimary, color: theme.colors.textPrimary }}
            placeholder="abc-123-xyz"
          />
        </div>

        <div style={{ marginBottom: theme.spacing.xl }}>
          <label style={{ display: 'block', fontSize: theme.fontSize.sm, fontWeight: 500, color: theme.colors.textPrimary, marginBottom: theme.spacing.xs }}>API Key</label>
          <input 
            type="password" 
            value={localConfig.apiKey} 
            onChange={e => setLocalConfig({...localConfig, apiKey: e.target.value})}
            style={{ width: '100%', padding: theme.spacing.md, borderRadius: theme.radius.md, border: `1px solid ${theme.colors.borderDefault}`, backgroundColor: theme.colors.bgPrimary, color: theme.colors.textPrimary }}
            placeholder="AIza..."
          />
        </div>

        <button 
          onClick={() => onConfigSave(localConfig)}
          style={{ width: '100%', padding: theme.spacing.md, backgroundColor: theme.colors.accent, color: '#FFF', borderRadius: theme.radius.md, fontWeight: 600, border: 'none', cursor: 'pointer' }}
        >
          Save & Sync
        </button>
      </div>

      <div style={{ marginTop: theme.spacing.xxl, textAlign: 'center' }}>
        <p style={{ fontSize: theme.fontSize.sm, color: theme.colors.textTertiary }}>Habit Tracker 2026 • v1.0.0</p>
      </div>
    </div>
  );
};

// --- LAYOUT COMPONENTS ---

const Header: React.FC<{ 
  currentMonth: Date; 
  onMonthChange: (d: Date) => void; 
  isSyncing: boolean; 
  theme: Theme 
}> = ({ currentMonth, onMonthChange, isSyncing, theme }) => {
  const changeMonth = (delta: number) => {
    const newDate = new Date(currentMonth);
    newDate.setMonth(newDate.getMonth() + delta);
    onMonthChange(newDate);
  };

  return (
    <header style={{ 
      padding: `${theme.spacing.lg} ${theme.spacing.xl}`, 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'space-between',
      backgroundColor: theme.colors.bgPrimary,
      position: 'sticky',
      top: 0,
      zIndex: 10
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, color: theme.colors.accent }}>
        <Icon name="target" />
        <span style={{ fontWeight: 700, color: theme.colors.textPrimary, fontSize: theme.fontSize.lg }}>Habits</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
        <button onClick={() => changeMonth(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.colors.textSecondary }}><Icon name="chevron-left" /></button>
        <span style={{ fontWeight: 600, color: theme.colors.textPrimary, minWidth: '100px', textAlign: 'center' }}>
          {new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(currentMonth)}
        </span>
        <button onClick={() => changeMonth(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.colors.textSecondary }}><Icon name="chevron-right" /></button>
      </div>

      <div style={{ width: '24px', display: 'flex', justifyContent: 'center' }}>
        {isSyncing && (
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: theme.colors.success, animation: 'pulse 1s infinite' }} />
        )}
      </div>
    </header>
  );
};

const BottomNav: React.FC<{ 
  currentView: AppState['currentView']; 
  onViewChange: (v: AppState['currentView']) => void; 
  theme: Theme 
}> = ({ currentView, onViewChange, theme }) => {
  const items: { id: AppState['currentView']; icon: string; label: string }[] = [
    { id: 'today', icon: 'check', label: 'Today' },
    { id: 'calendar', icon: 'calendar', label: 'Calendar' },
    { id: 'stats', icon: 'chart-bar', label: 'Stats' },
    { id: 'settings', icon: 'settings', label: 'Settings' },
  ];

  return (
    <nav style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: theme.colors.bgElevated,
      borderTop: `1px solid ${theme.colors.borderSubtle}`,
      display: 'flex',
      justifyContent: 'space-around',
      padding: `${theme.spacing.sm} 0 calc(${theme.spacing.sm} + env(safe-area-inset-bottom)) 0`,
      zIndex: 20
    }}>
      {items.map(item => {
        const isActive = currentView === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            style={{
              background: 'none',
              border: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              padding: theme.spacing.sm,
              cursor: 'pointer',
              color: isActive ? theme.colors.accent : theme.colors.textTertiary,
              transition: `color ${theme.transition.fast}`
            }}
          >
            <Icon name={item.icon} />
            <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>{item.label}</span>
          </button>
        )
      })}
    </nav>
  );
};

const Toast: React.FC<{ message: string; visible: boolean; theme: Theme }> = ({ message, visible, theme }) => {
  if (!visible) return null;
  return (
    <div style={{
      position: 'fixed',
      bottom: '90px',
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: theme.colors.textPrimary,
      color: theme.colors.bgPrimary,
      padding: `${theme.spacing.md} ${theme.spacing.xl}`,
      borderRadius: theme.radius.full,
      fontSize: theme.fontSize.sm,
      fontWeight: 500,
      boxShadow: theme.shadow.md,
      zIndex: 100,
      animation: 'slideUp 300ms cubic-bezier(0.175, 0.885, 0.32, 1.275)'
    }}>
      {message}
    </div>
  );
};

// --- MAIN APP ---

const App: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery('(max-width: 1024px)');
  const [config, setConfig] = useLocalStorage<Config>('ht_config', { spreadsheetId: '', apiKey: '' });
  const [state, dispatch] = useReducer(reducer, initialState);
  const { data, isLoading, isSyncing, error, refetch, updateDailyLog, updateMoodLog } = useGoogleSheets(config);
  const [toast, setToast] = useState<{ msg: string; visible: boolean }>({ msg: '', visible: false });

  // Sync data from hook to reducer
  useEffect(() => {
    dispatch({ type: 'SET_DATA', payload: data });
  }, [data]);

  useEffect(() => {
    dispatch({ type: 'SET_LOADING', payload: isLoading });
  }, [isLoading]);

  // Toast Helper
  const showToast = (msg: string) => {
    setToast({ msg, visible: true });
    setTimeout(() => setToast(p => ({ ...p, visible: false })), 3000);
  };

  // Handlers
  const handleToggleHabit = (habitId: string) => {
    const today = toISODate(new Date());
    const isCompleted = state.dailyLogs.some(l => l.date === today && l.habitId === habitId && l.completed);
    
    // Optimistic UI
    dispatch({ type: 'TOGGLE_HABIT', payload: { date: today, habitId } });
    
    // API Call
    updateDailyLog(today, habitId, !isCompleted).catch(() => {
      showToast('Error saving log');
    });
  };

  const handleMoodChange = (type: 'mood' | 'motivation', val: number) => {
    const today = toISODate(new Date());
    const currentMood = state.moodLogs.find(l => l.date === today) || { date: today, moodScore: 5, motivationScore: 5 };
    const newMood = { ...currentMood, [type === 'mood' ? 'moodScore' : 'motivationScore']: val };
    
    dispatch({ type: 'UPDATE_MOOD', payload: newMood });
    updateMoodLog(today, newMood.moodScore, newMood.motivationScore);
  };

  const handleConfigSave = (newConfig: Config) => {
    setConfig(newConfig);
    showToast('Configuration saved');
    setTimeout(() => refetch(), 500);
  };

  // Global Styles Injection
  const styles = `
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp { from { transform: translate(-50%, 20px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
    @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
  `;

  return (
    <div style={{ backgroundColor: theme.colors.bgSecondary, minHeight: '100vh', color: theme.colors.textPrimary, fontFamily: theme.fontFamily }}>
      <style>{styles}</style>
      
      <div style={{ 
        maxWidth: isMobile ? '100%' : '800px', 
        margin: '0 auto', 
        backgroundColor: theme.colors.bgPrimary, 
        minHeight: '100vh',
        boxShadow: isMobile ? 'none' : theme.shadow.lg,
        display: 'flex',
        flexDirection: 'column'
      }}>
        
        <Header 
          currentMonth={state.currentMonth} 
          onMonthChange={(d) => dispatch({ type: 'SET_MONTH', payload: d })}
          isSyncing={isSyncing || isLoading}
          theme={theme}
        />

        <main style={{ flex: 1, padding: isMobile ? theme.spacing.lg : theme.spacing.xxxl, paddingBottom: isMobile ? '80px' : theme.spacing.xxxl }}>
          {state.currentView === 'today' && (
            <TodayView state={state} onToggle={handleToggleHabit} onMoodChange={handleMoodChange} theme={theme} />
          )}
          {state.currentView === 'calendar' && (
            <CalendarView state={state} theme={theme} />
          )}
          {state.currentView === 'stats' && (
            <StatsView state={state} theme={theme} />
          )}
          {state.currentView === 'settings' && (
            <SettingsView config={config} onConfigSave={handleConfigSave} theme={theme} />
          )}
        </main>

        {isMobile && (
          <BottomNav 
            currentView={state.currentView} 
            onViewChange={(v) => dispatch({ type: 'SET_VIEW', payload: v })} 
            theme={theme}
          />
        )}
      </div>

      <Toast message={toast.msg} visible={toast.visible} theme={theme} />
    </div>
  );
};

export default App;