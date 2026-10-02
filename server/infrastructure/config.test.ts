import { describe, expect, it } from 'vitest';
import { loadConfig, readDatabasePath } from './config.ts';

const noDirectories = () => false;
const onlyDist = (path: string) => path === 'dist';

describe('loadConfig', () => {
  it('uses the documented defaults', () => {
    expect(loadConfig({}, noDirectories)).toEqual({
      port: 8787,
      databasePath: 'data/leaderboard.sqlite',
      staticDir: undefined,
      trustProxy: 0,
      logClientAddress: false,
      revision: undefined,
    });
  });

  it('hosts the web client from dist when that folder exists', () => {
    expect(loadConfig({}, onlyDist).staticDir).toBe('dist');
  });

  it('reads every setting from the environment', () => {
    const config = loadConfig(
      {
        PORT: '9000',
        DATABASE_PATH: '/var/lib/lb.sqlite',
        STATIC_DIR: 'public',
        TRUST_PROXY: '2',
        LOG_CLIENT_ADDRESS: 'true',
        APP_REVISION: '9052bb9a1c3e4d5f60718293a4b5c6d7e8f90123',
      },
      (path) => path === 'public',
    );

    expect(config).toEqual({
      port: 9000,
      databasePath: '/var/lib/lb.sqlite',
      staticDir: 'public',
      trustProxy: 2,
      logClientAddress: true,
      revision: '9052bb9a1c3e4d5f60718293a4b5c6d7e8f90123',
    });
  });

  it('prefers an explicit STATIC_DIR over dist', () => {
    expect(loadConfig({ STATIC_DIR: 'site' }, () => true).staticDir).toBe('site');
  });

  it('treats blank variables as unset', () => {
    const config = loadConfig(
      { PORT: '', DATABASE_PATH: '  ', STATIC_DIR: '', TRUST_PROXY: ' ', LOG_CLIENT_ADDRESS: '', APP_REVISION: '' },
      onlyDist,
    );

    expect(config).toEqual({
      port: 8787,
      databasePath: 'data/leaderboard.sqlite',
      staticDir: 'dist',
      trustProxy: 0,
      logClientAddress: false,
      revision: undefined,
    });
  });

  it.each([['0'], ['65535']])('accepts PORT=%s', (port) => {
    expect(loadConfig({ PORT: port }, noDirectories).port).toBe(Number(port));
  });

  it.each([['abc'], ['-1'], ['1.5'], ['65536'], ['123456'], ['0x10'], ['1e3'], ['80 80']])(
    'rejects PORT=%s',
    (port) => {
      expect(() => loadConfig({ PORT: port }, noDirectories)).toThrow(/PORT/);
    },
  );

  it('rejects a STATIC_DIR that is not an existing directory', () => {
    expect(() => loadConfig({ STATIC_DIR: 'missing' }, onlyDist)).toThrow(/STATIC_DIR/);
  });

  describe('TRUST_PROXY', () => {
    it.each([['0', 0], ['1', 1], ['2', 2], ['99', 99]])('accepts %s proxies', (value, expected) => {
      expect(loadConfig({ TRUST_PROXY: value }, noDirectories).trustProxy).toBe(expected);
    });

    it.each([['-1'], ['1.5'], ['abc'], ['true'], ['100'], ['0x1'], ['1 2'], ['+1']])('rejects %s', (value) => {
      expect(() => loadConfig({ TRUST_PROXY: value }, noDirectories)).toThrow(/TRUST_PROXY/);
    });
  });

  describe('APP_REVISION', () => {
    it.each([['9052bb9'], ['9052bb9a1c3e4d5f60718293a4b5c6d7e8f90123']])('accepts the commit %s', (value) => {
      expect(loadConfig({ APP_REVISION: value }, noDirectories).revision).toBe(value);
    });

    it.each([['9052BB9'], ['main'], ['9052bb'], ['sha-9052bb9'], ['9052bb9 '.repeat(2)], ['x'.repeat(65)]])(
      'rejects %j',
      (value) => {
        expect(() => loadConfig({ APP_REVISION: value }, noDirectories)).toThrow(/APP_REVISION/);
      },
    );
  });

  describe('LOG_CLIENT_ADDRESS', () => {
    it.each([['true', true], ['TRUE', true], ['false', false], ['False', false]])('reads %s', (value, expected) => {
      expect(loadConfig({ LOG_CLIENT_ADDRESS: value }, noDirectories).logClientAddress).toBe(expected);
    });

    it.each([['1'], ['yes'], ['on'], ['0'], ['enabled']])('rejects %s rather than guessing what was meant', (value) => {
      expect(() => loadConfig({ LOG_CLIENT_ADDRESS: value }, noDirectories)).toThrow(/LOG_CLIENT_ADDRESS/);
    });
  });
});

describe('readDatabasePath', () => {
  it('defaults to a file under data/', () => {
    expect(readDatabasePath({})).toBe('data/leaderboard.sqlite');
  });

  it('reads DATABASE_PATH, ignoring surrounding blanks', () => {
    expect(readDatabasePath({ DATABASE_PATH: ' /var/lib/lb.sqlite ' })).toBe('/var/lib/lb.sqlite');
  });

  it('does not care whether the rest of the environment is valid', () => {
    expect(readDatabasePath({ PORT: 'not-a-port', TRUST_PROXY: 'many', DATABASE_PATH: 'x.sqlite' })).toBe('x.sqlite');
  });
});
