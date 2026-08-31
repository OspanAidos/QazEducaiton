import { createContext, useContext } from "react";

/** Текущий язык интерфейса ("ru" | "kk"). Прокидывается из App. */
const LangContext = createContext("ru");

export function LangProvider({ lang, children }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}
