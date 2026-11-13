import { createContext, type ReactNode, useContext, useMemo } from "react";
import { type Language, makeT, type Translate } from "../shared/i18n";

const I18nContext = createContext<Translate | null>(null);

export function I18nProvider({ language, children }: { language: Language; children: ReactNode }) {
  const value = useMemo(() => makeT(language), [language]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// Falls back to English so a component mounted outside the provider still
// renders translated text instead of the Chinese source strings.
export function useT(): Translate {
  const t = useContext(I18nContext);
  return t ?? makeT("en");
}
