/**
 * i18next 国际化配置
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCN from './locales/zh-CN.json';
import en from './locales/en.json';
import ru from './locales/ru.json';
import zhCNLocal from './locales/zh-CN-local.json';
import enLocal from './locales/en-local.json';
import ruLocal from './locales/ru-local.json';
import { getInitialLanguage } from '@/utils/language';

i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: { ...zhCN, ...zhCNLocal } },
    en: { translation: { ...en, ...enLocal } },
    ru: { translation: { ...ru, ...ruLocal } }
  },
  lng: getInitialLanguage(),
  fallbackLng: 'zh-CN',
  interpolation: {
    escapeValue: false // React 已经转义
  },
  react: {
    useSuspense: false
  }
});

export default i18n;
