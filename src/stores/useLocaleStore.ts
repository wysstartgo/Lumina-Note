import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Locale, getTranslations, detectSystemLocale, Translations } from '@/i18n';

interface LocaleState {
  locale: Locale;
  t: Translations;
  setLocale: (locale: Locale) => void;
}

/**
 * 非 React 环境下获取当前翻译
 * 用于 Agent prompts、LLM services 等非组件代码
 */
export function getCurrentTranslations(): Translations {
  return useLocaleStore.getState().t;
}

/**
 * 非 React 环境下获取当前语言
 */
export function getCurrentLocale(): Locale {
  return useLocaleStore.getState().locale;
}

// 获取保存的语言或检测系统语言
function getInitialLocale(): Locale {
  try {
    const saved = localStorage.getItem('lumina-locale');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.state?.locale) {
        return parsed.state.locale as Locale;
      }
    }
  } catch {}
  return detectSystemLocale();
}

const initialLocale = getInitialLocale();

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: initialLocale,
      t: getTranslations(initialLocale),
      setLocale: (locale: Locale) => {
        set({
          locale,
          t: getTranslations(locale),
        });
      },
    }),
    {
      name: 'lumina-locale',
      partialize: (state) => ({ locale: state.locale }),
    }
  )
);
