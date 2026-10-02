import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameEvent } from '../../../shared/game/types.ts';
import { createTestState } from '../canvas/testSupport.ts';
import { WebAudioSound } from './webAudioSound.ts';

/** The few corners of Web Audio the adapter touches, recording what it was asked and refusing what browsers refuse. */
class FakeParam {
  value = 0;
  readonly setValues: number[] = [];
  readonly targets: number[] = [];

  setValueAtTime(value: number) {
    this.setValues.push(value);
  }

  linearRampToValueAtTime() {}

  exponentialRampToValueAtTime(value: number) {
    if (value <= 0) throw new RangeError('An exponential ramp cannot reach zero');
  }

  setTargetAtTime(target: number) {
    this.targets.push(target);
  }
}

class FakeNode {
  readonly frequency = new FakeParam();
  readonly gain = new FakeParam();
  type = '';
  buffer: unknown = null;
  loop = false;
  stopped = 0;

  connect() {}

  start() {}

  stop() {
    this.stopped++;
  }
}

class FakeAudioContext {
  state = 'suspended';
  currentTime = 0;
  sampleRate = 100;
  readonly destination = new FakeNode();
  readonly gains: FakeNode[] = [];
  readonly oscillators: FakeNode[] = [];
  resumed = 0;
  suspended = 0;
  closed = 0;

  createGain() {
    const node = new FakeNode();
    this.gains.push(node);
    return node;
  }

  createOscillator() {
    const node = new FakeNode();
    this.oscillators.push(node);
    return node;
  }

  createBiquadFilter() {
    return new FakeNode();
  }

  createBufferSource() {
    return new FakeNode();
  }

  createBuffer() {
    const samples = new Float32Array(this.sampleRate);
    return { getChannelData: () => samples };
  }

  resume() {
    this.resumed++;
    this.state = 'running';
    return Promise.resolve();
  }

  suspend() {
    this.suspended++;
    this.state = 'suspended';
    return Promise.resolve();
  }

  close() {
    this.closed++;
    this.state = 'closed';
    return Promise.resolve();
  }
}

const EVENTS: Record<GameEvent['type'], GameEvent> = {
  waveStarted: { type: 'waveStarted', wave: 2 },
  invaderDestroyed: { type: 'invaderDestroyed', kind: 'crab', points: 20 },
  bombDestroyed: { type: 'bombDestroyed' },
  bunkerHit: { type: 'bunkerHit' },
  cannonHit: { type: 'cannonHit', cannon: 0 },
  cannonDestroyed: { type: 'cannonDestroyed', cannon: 1 },
  overheated: { type: 'overheated' },
  ufoAppeared: { type: 'ufoAppeared' },
  ufoDestroyed: { type: 'ufoDestroyed', points: 100 },
  capsuleCollected: { type: 'capsuleCollected', kind: 'nova' },
  fleetStepped: { type: 'fleetStepped', beat: 5 },
  waveCleared: { type: 'waveCleared', wave: 1, bonus: 100 },
  gameOver: { type: 'gameOver' },
};

describe('WebAudioSound without Web Audio', () => {
  it('refuses to be built, so that the composition root can fall back to silence', () => {
    expect(() => new WebAudioSound()).toThrow();
  });
});

describe('WebAudioSound', () => {
  let context: FakeAudioContext;
  const remember = (built: FakeAudioContext) => {
    context = built;
  };

  beforeEach(() => {
    vi.stubGlobal(
      'AudioContext',
      class extends FakeAudioContext {
        constructor() {
          super();
          remember(this);
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** The levels the two continuous voices were last sent to, laser hum first: only they glide. */
  function voiceLevels(): number[] {
    return context.gains.filter((gain) => gain.gain.targets.length > 0).map((gain) => gain.gain.targets.at(-1)!);
  }

  describe('one-shot sounds', () => {
    it.each(Object.entries(EVENTS))('plays %s', (_type, event) => {
      const sound = new WebAudioSound();

      expect(() => sound.play(event)).not.toThrow();
    });

    it.each(Object.entries(EVENTS).filter(([type]) => type !== 'ufoAppeared'))('makes a sound for %s', (_type, event) => {
      const sound = new WebAudioSound();
      const before = context.gains.length;

      sound.play(event);

      expect(context.gains.length).toBeGreaterThan(before);
    });

    it('leaves the saucer appearing to the warble that sync starts', () => {
      const sound = new WebAudioSound();
      const before = context.gains.length;

      sound.play(EVENTS.ufoAppeared);

      expect(context.gains.length).toBe(before);
    });

    it('marches on four notes going down, and starts over', () => {
      const sound = new WebAudioSound();
      const march = (beat: number) => {
        context.currentTime += 1;
        sound.play({ type: 'fleetStepped', beat });
        return context.oscillators.at(-1)!.frequency.setValues[0]!;
      };

      const notes = [0, 1, 2, 3, 4].map(march);

      expect(notes[4]).toBe(notes[0]);
      expect(notes.slice(0, 4)).toEqual([...notes.slice(0, 4)].sort((a, b) => b - a));
      expect(new Set(notes).size).toBe(4);
    });

    it('keeps the march in order even when the fleet steps on every tick, as it does with one invader left', () => {
      const sound = new WebAudioSound();
      const TICK_SECONDS = 1 / 60;
      const stepOnConsecutiveTicks = (beat: number) => {
        context.currentTime += TICK_SECONDS;
        const before = context.oscillators.length;
        sound.play({ type: 'fleetStepped', beat });
        return context.oscillators.length > before ? context.oscillators.at(-1)!.frequency.setValues[0]! : null;
      };

      const notes = [0, 1, 2, 3].map(stepOnConsecutiveTicks);

      expect(notes.every((note) => note !== null)).toBe(true);
      expect(notes).toEqual([...notes].sort((a, b) => b! - a!));
      expect(new Set(notes).size).toBe(4);
    });

    it('squeaks higher for the invaders that are worth more', () => {
      const sound = new WebAudioSound();
      const squeak = (kind: 'squid' | 'crab' | 'octopus') => {
        context.currentTime += 1;
        sound.play({ type: 'invaderDestroyed', kind, points: 0 });
        return context.oscillators.at(-1)!.frequency.setValues[0]!;
      };

      const [squid, crab, octopus] = [squeak('squid'), squeak('crab'), squeak('octopus')];

      expect(squid).toBeGreaterThan(crab!);
      expect(crab).toBeGreaterThan(octopus!);
    });

    it('lets a sound repeat only after a moment, so that a whole fleet dying at once is not a wall of noise', () => {
      const sound = new WebAudioSound();
      const event = EVENTS.invaderDestroyed;

      sound.play(event);
      const afterFirst = context.gains.length;
      sound.play(event);
      expect(context.gains.length).toBe(afterFirst);

      context.currentTime += 0.05;
      sound.play(event);
      expect(context.gains.length).toBeGreaterThan(afterFirst);
    });

    it('does not let one event silence another', () => {
      const sound = new WebAudioSound();

      sound.play(EVENTS.invaderDestroyed);
      const afterFirst = context.gains.length;
      sound.play(EVENTS.bunkerHit);

      expect(context.gains.length).toBeGreaterThan(afterFirst);
    });
  });

  describe('continuous sounds', () => {
    it('hums while the lasers are on, and only then', () => {
      const sound = new WebAudioSound();

      sound.sync(createTestState({ firing: true }));
      expect(voiceLevels().map((level) => level > 0)).toEqual([true, false]);

      sound.sync(createTestState({ firing: false }));
      expect(voiceLevels()).toEqual([0, 0]);
    });

    it('warbles while the saucer flies, and only then', () => {
      const sound = new WebAudioSound();

      sound.sync(createTestState({ ufo: { x: 10, y: 26, direction: 1, hp: 80 } }));
      expect(voiceLevels().map((level) => level > 0)).toEqual([false, true]);

      sound.sync(createTestState({ ufo: null }));
      expect(voiceLevels()).toEqual([0, 0]);
    });

    it('goes quiet when the game is over, even if the lasers were on and the saucer was flying', () => {
      const sound = new WebAudioSound();
      const ufo = { x: 10, y: 26, direction: 1 as const, hp: 80 };

      sound.sync(createTestState({ firing: true, ufo }));
      sound.sync(createTestState({ phase: 'gameOver', firing: true, ufo }));

      expect(voiceLevels()).toEqual([0, 0]);
    });
  });

  describe('volume', () => {
    it('keeps the master volume low', () => {
      new WebAudioSound();

      expect(context.gains[0]!.gain.value).toBeLessThanOrEqual(0.25);
      expect(context.gains[0]!.gain.value).toBeGreaterThan(0);
    });

    it('mutes and unmutes the master volume', () => {
      const sound = new WebAudioSound();
      const master = context.gains[0]!.gain;

      sound.setMuted(true);
      expect(master.targets.at(-1)).toBe(0);

      sound.setMuted(false);
      expect(master.targets.at(-1)).toBeGreaterThan(0);
      expect(master.targets.at(-1)).toBeLessThanOrEqual(0.25);
    });
  });

  describe('the audio context', () => {
    it('is started by the first sound, because browsers keep it suspended until the page has had a gesture', () => {
      const sound = new WebAudioSound();
      expect(context.resumed).toBe(0);

      sound.play(EVENTS.bombDestroyed);
      sound.sync(createTestState());

      expect(context.resumed).toBe(1);
    });

    it('is suspended while the game is paused and not started again by the sounds that come in the meantime', () => {
      const sound = new WebAudioSound();

      sound.setPaused(true);
      sound.play(EVENTS.bombDestroyed);
      sound.sync(createTestState());

      expect(context.suspended).toBe(1);
      expect(context.resumed).toBe(0);

      sound.setPaused(false);
      expect(context.resumed).toBe(1);
    });

    it('is closed on dispose, with every oscillator that goes on forever stopped', () => {
      const sound = new WebAudioSound();
      const forever = [...context.oscillators];

      sound.dispose();

      expect(forever.length).toBeGreaterThan(0);
      expect(forever.every((oscillator) => oscillator.stopped === 1)).toBe(true);
      expect(context.closed).toBe(1);
    });

    it('can be disposed twice without a fuss', () => {
      const sound = new WebAudioSound();

      sound.dispose();

      expect(() => sound.dispose()).not.toThrow();
    });
  });
});
