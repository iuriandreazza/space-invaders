import { describe, expect, it } from 'vitest';
import { CONSENT_COPY, getConsentCopy, pickLocale } from './consentCopy.ts';

describe('pickLocale', () => {
  it.each(['pt', 'pt-BR', 'pt-PT', 'PT-br', 'pt_BR'])('gives Brazilian Portuguese to %s', (language) => {
    expect(pickLocale(language)).toBe('pt-BR');
  });

  it.each(['en', 'en-US', 'es-ES', 'fr', 'de-DE', 'ja', 'ptolemaic', '', undefined])(
    'gives English to %s',
    (language) => {
      expect(pickLocale(language)).toBe('en');
    },
  );
});

describe('getConsentCopy', () => {
  it('follows the language of the browser', () => {
    expect(getConsentCopy('pt-BR')).toBe(CONSENT_COPY['pt-BR']);
    expect(getConsentCopy('en-GB')).toBe(CONSENT_COPY.en);
  });

  it('asks the browser when it is not told the language', () => {
    expect(getConsentCopy()).toBe(CONSENT_COPY[pickLocale(navigator.language)]);
  });
});

describe('the copy', () => {
  it.each(['en', 'pt-BR'] as const)('is marked with its own language in %s', (locale) => {
    expect(CONSENT_COPY[locale].lang).toBe(locale);
  });

  it.each(['en', 'pt-BR'] as const)('tells %s readers about the law, the cookies, the initials and the address', (locale) => {
    const { message, details } = CONSENT_COPY[locale];
    const everything = [message, ...details.map(({ text }) => text)].join(' ');

    expect(message).toMatch(/LGPD/);
    expect(message).toMatch(/13\.709\/2018/);
    expect(everything).toMatch(/Google Analytics/);
    expect(everything).toMatch(/cookies/i);
    expect(everything).toMatch(/IP/);
    expect(everything).toMatch(/memory|memória/i);
  });

  it('counts the seconds in both languages', () => {
    expect(CONSENT_COPY.en.countdown(4)).toBe('Accepting automatically in 4s');
    expect(CONSENT_COPY['pt-BR'].countdown(4)).toBe('Aceitando automaticamente em 4s');
  });
});
