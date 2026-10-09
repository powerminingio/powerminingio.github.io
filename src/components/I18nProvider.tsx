'use client'
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../i18n/config';

interface I18nProviderProps {
  children: React.ReactNode;
}

export function I18nProvider({ children }: I18nProviderProps) {
  const [isI18nInitialized, setIsI18nInitialized] = useState(false);
  const { i18n } = useTranslation();

  useEffect(() => {
    setIsI18nInitialized(true);
  }, []);

  // <html lang> is static in the server-rendered shell; keep it honest as the
  // detector resolves a language and as the user switches.
  useEffect(() => {
    if (i18n.language) {
      document.documentElement.lang = i18n.language;
    }
  }, [i18n.language]);

  if (!isI18nInitialized) {
    return null;
  }

  return <>{children}</>;
}
