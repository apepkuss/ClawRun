import React, { createContext, useContext, useState, useCallback } from 'react';
import en from './en';
import zh from './zh';

export type Locale = 'en' | 'zh';

const translations: Record<Locale, Record<string, string>> = { en, zh };

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string>) => string;
}

const LocaleContext = createContext<LocaleContextValue>(null!);

function detectLocale(): Locale {
  const saved = localStorage.getItem('locale');
  if (saved === 'en' || saved === 'zh') return saved;
  return navigator.language.startsWith('zh') ? 'zh' : 'en';
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  const setLocale = useCallback((l: Locale) => {
    localStorage.setItem('locale', l);
    setLocaleState(l);
  }, []);

  const t = useCallback((key: string, vars?: Record<string, string>) => {
    let text = translations[locale][key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        text = text.replaceAll(`{{${k}}}`, v);
      }
    }
    return text;
  }, [locale]);

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}
