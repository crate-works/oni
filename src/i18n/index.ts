import type { I18n, I18nOptions } from 'vue-i18n';
import { createI18n } from 'vue-i18n';

import { ui } from '@/configuration';

const assetPrefix = import.meta.env.BASE_URL.replace(/\/$/, '');

type Locale = string;
type Messages = Record<string, Record<string, string>>;

const localeModules = import.meta.glob<{ default: Messages }>('./locales/*.json', { eager: true });
const builtInMessages = Object.entries(localeModules).reduce<Record<string, Messages>>((acc, [path, mod]) => {
  const locale = path.split('/').pop()?.replace('.json', '');
  if (locale) {
    acc[locale] = mod.default;
  }

  return acc;
}, {});

const localeMerge = (target: Messages, source: Messages): Messages => {
  const result = { ...target };

  for (const outer in source) {
    for (const inner in source[outer]) {
      const value = source[outer][inner];
      if (value) {
        result[outer] ||= {};
        result[outer][inner] = value;
      }
    }
  }

  return result;
};

const loadRuntimeLocale = async (locale: Locale): Promise<Messages | null> => {
  try {
    const response = await fetch(`${assetPrefix}/i18n/${locale}.json`);

    if (!response.ok) {
      return null;
    }

    const messages = (await response.json()) as Messages;

    return messages;
  } catch (_error) {
    return null;
  }
};

// Load and merge all locale messages (built-in + runtime)
const loadMessages = async (locales: Locale[]): Promise<Record<string, Messages>> => {
  const messages: Record<string, Messages> = {};

  // Load configured locales and merge runtime overrides on top.
  await Promise.all(
    locales.map(async (locale) => {
      messages[locale] = builtInMessages[locale] || {};

      const runtimeMessages = await loadRuntimeLocale(locale);

      if (runtimeMessages) {
        messages[locale] = localeMerge(messages[locale], runtimeMessages);
      }
    }),
  );

  return messages;
};

// Create and configure i18n instance
export const setupI18n = async (locale: Locale = 'en'): Promise<I18n> => {
  const configuredLocales = ui.i18n?.availableLocales ?? ['en'];
  const messages = await loadMessages(configuredLocales);
  const fallbackLocale = messages[ui.i18n.defaultLocale] ? ui.i18n.defaultLocale : configuredLocales[0] || 'en';
  const initialLocale = messages[locale] ? locale : fallbackLocale;

  const options: I18nOptions = {
    legacy: false,
    locale: initialLocale,
    fallbackLocale,
    messages,
  };

  const i18n = createI18n(options);

  return i18n;
};

export type { Locale };
