import { enMessages } from "./i18n-en";

export const LANGUAGES = ["en", "zh-CN"] as const;
export type Language = (typeof LANGUAGES)[number];

export const languageLabels: Record<Language, string> = {
  en: "English",
  "zh-CN": "简体中文",
};

export type MessageParams = Record<string, string | number | null | undefined>;
export type Translate = (key: string, params?: MessageParams) => string;

export function formatMessage(template: string, params?: MessageParams): string {
  if (!params) return template;
  let text = template;
  for (const [name, value] of Object.entries(params))
    text = text.split(`{${name}}`).join(value == null ? "" : String(value));
  return text;
}

export function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "zh-CN";
}

// The zh-CN source strings double as catalog keys; other languages fall back to
// the key itself so a missing entry degrades to Chinese instead of crashing.
export function makeT(language: Language): Translate {
  if (language === "zh-CN") return (key, params) => formatMessage(key, params);
  return (key, params) => formatMessage(enMessages[key] ?? key, params);
}

export const tZh: Translate = (key, params) => formatMessage(key, params);
