import type { ConsentDecision } from '../application/ports.ts';

export type Locale = 'en' | 'pt-BR';

export interface ConsentCopy {
  lang: Locale;
  regionLabel: string;
  message: string;
  detailsSummary: string;
  details: ReadonlyArray<{ topic: string; text: string }>;
  accept: string;
  decline: string;
  countdown: (seconds: number) => string;
  /** Shown to a visitor who comes back to the banner, so that they see what they chose. */
  current: Record<ConsentDecision, string>;
  /** Read out once by screen readers, instead of the countdown that changes every second. */
  countdownNotice: string;
  autoAccepted: string;
}

/** Any Portuguese gets Brazilian Portuguese, the language of the law that asks for the banner; everything else gets English. */
export function pickLocale(language: string | undefined): Locale {
  return /^pt(?:[-_]|$)/i.test(language ?? '') ? 'pt-BR' : 'en';
}

export const CONSENT_COPY: Record<Locale, ConsentCopy> = {
  en: {
    lang: 'en',
    regionLabel: 'Cookie consent',
    message:
      'We use Google Analytics cookies to understand how the game is used. By accepting, you agree to this data collection (LGPD, Brazilian Law 13.709/2018). You can decline and still play, and change your mind at any time with "Cookie settings" below.',
    detailsSummary: 'What is collected?',
    details: [
      {
        topic: 'Analytics, only if you accept',
        text: 'Google Analytics sets cookies and identifiers in your browser to measure how the game is used: pages seen, length of the visit, type of device and approximate location. If you decline, Google\'s script is never loaded.',
      },
      {
        topic: 'Leaderboard',
        text: 'When you save a score we store three letters (your initials), the score and the date. There is no account and no email.',
      },
      {
        topic: 'Server',
        text: 'Your IP address is used only in memory, to limit abusive requests. It is not stored.',
      },
    ],
    accept: 'Accept',
    decline: 'Decline',
    countdown: (seconds) => `Accepting automatically in ${seconds}s`,
    current: { accepted: 'Analytics are on.', declined: 'Analytics are off.' },
    countdownNotice:
      'Analytics cookies will be accepted automatically in a few seconds. Open the details or choose Decline to stop that.',
    autoAccepted: 'Analytics cookies were accepted automatically. You can change this with "Cookie settings".',
  },
  'pt-BR': {
    lang: 'pt-BR',
    regionLabel: 'Consentimento de cookies',
    message:
      'Usamos cookies do Google Analytics para entender como o jogo é usado. Ao aceitar, você concorda com a coleta (LGPD, Lei 13.709/2018). Você pode recusar e continuar jogando, e mudar de ideia a qualquer momento em "Cookie settings", no rodapé.',
    detailsSummary: 'O que é coletado?',
    details: [
      {
        topic: 'Análise de uso, só se você aceitar',
        text: 'O Google Analytics grava cookies e identificadores no seu navegador para medir como o jogo é usado: páginas vistas, duração da visita, tipo de dispositivo e localização aproximada. Se você recusar, o script do Google nunca é carregado.',
      },
      {
        topic: 'Ranking',
        text: 'Ao salvar uma pontuação, guardamos três letras (suas iniciais), a pontuação e a data. Não há conta nem e-mail.',
      },
      {
        topic: 'Servidor',
        text: 'O endereço IP é usado apenas na memória, para limitar requisições abusivas, e não é armazenado.',
      },
    ],
    accept: 'Aceitar',
    decline: 'Recusar',
    countdown: (seconds) => `Aceitando automaticamente em ${seconds}s`,
    current: { accepted: 'A análise de uso está ativada.', declined: 'A análise de uso está desativada.' },
    countdownNotice:
      'Os cookies de análise serão aceitos automaticamente em alguns segundos. Abra os detalhes ou escolha Recusar para impedir.',
    autoAccepted: 'Os cookies de análise foram aceitos automaticamente. Você pode mudar isso em "Cookie settings".',
  },
};

export function getConsentCopy(language: string | undefined = navigator.language): ConsentCopy {
  return CONSENT_COPY[pickLocale(language)];
}
