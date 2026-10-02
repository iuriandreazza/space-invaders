import type { SoundPort } from '../../application/ports.ts';
import type { InvaderKind } from '../../../shared/game/constants.ts';
import type { GameEvent, GameState } from '../../../shared/game/types.ts';
import { Synth, glideTo } from './synth.ts';

const MASTER_VOLUME = 0.25;
/** Sound is a nicety: a context that refuses to pause, resume or close must not break the game. */
const ignoreFailure = () => undefined;
/**
 * The nova capsule destroys a whole fleet in one tick: without a limit those blips would stack into a wall of noise.
 * The window is shorter than a tick (1/60 s), so that events of one tick collapse but those of consecutive ticks never do:
 * the last invaders make the fleet step every tick, and the march has to keep its four notes in order.
 */
const MIN_REPEAT_SECONDS = 0.01;

/** The farther the invader, the higher it squeaks. */
const INVADER_BLIP_HZ: Record<InvaderKind, number> = { squid: 880, crab: 660, octopus: 440 };
/** The famous four notes of the fleet marching, one per step, going down and starting over. */
const MARCH_HZ = [110, 103.8, 98, 92.5] as const;
const UFO_ARPEGGIO_HZ = [392, 523, 659, 784, 1047];
const CAPSULE_HZ = [988, 1319];
const WAVE_START_FANFARE_HZ = [392, 523, 659, 784];
const WAVE_CLEARED_JINGLE_HZ = [523, 659, 784, 659, 784, 1047];
const GAME_OVER_NOTES_HZ = [440, 392, 349, 294];
const GAME_OVER_NOTE_SECONDS = 0.28;

/** A sound that goes on for as long as something is happening: a few oscillators, a filter and a wobble. */
interface VoiceRecipe {
  waves: readonly OscillatorType[];
  hz: number;
  lowpassHz: number;
  wobbleHz: number;
  wobbleDepthHz: number;
  volume: number;
}

const LASER_HUM: VoiceRecipe = {
  waves: ['sawtooth', 'square'],
  hz: 140,
  lowpassHz: 900,
  wobbleHz: 7,
  wobbleDepthHz: 6,
  volume: 0.2,
};
const UFO_WARBLE: VoiceRecipe = {
  waves: ['sine', 'triangle'],
  hz: 760,
  lowpassHz: 3000,
  wobbleHz: 9,
  wobbleDepthHz: 130,
  volume: 0.1,
};

/** The sound of the game, made of nothing but oscillators and noise: the game ships without a single audio file. */
export class WebAudioSound implements SoundPort {
  // The fields below depend on the ones above them: they are initialized in this order, and the first one
  // throws when the browser has no Web Audio, which is how the composition root knows to stay silent.
  private readonly context = new AudioContext();
  private readonly master = this.context.createGain();
  private readonly synth = new Synth(this.context, this.master);
  // Declared before the continuous voices, which register their oscillators here as they start.
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly laserHum = this.createVoice(LASER_HUM);
  private readonly ufoWarble = this.createVoice(UFO_WARBLE);
  private readonly lastPlayed = new Map<GameEvent['type'], number>();
  private paused = false;

  constructor() {
    this.master.gain.value = MASTER_VOLUME;
    this.master.connect(this.context.destination);
  }

  play(event: GameEvent): void {
    this.resumeUnlessPaused();
    if (this.isRepeatedTooSoon(event.type)) return;

    switch (event.type) {
      case 'invaderDestroyed': {
        const hz = INVADER_BLIP_HZ[event.kind];
        this.synth.tone('square', hz, hz / 2, 0.1, 0.25);
        this.synth.noiseBurst(0.12, 0.3, 4000, 600);
        return;
      }
      case 'bombDestroyed':
        this.synth.tone('square', 1800, 900, 0.03, 0.12);
        return;
      case 'bunkerHit':
        this.synth.tone('sine', 140, 50, 0.14, 0.5);
        this.synth.noiseBurst(0.1, 0.2, 500, 150);
        return;
      case 'cannonHit':
        this.synth.noiseBurst(0.3, 0.6, 2500, 300);
        this.synth.tone('sawtooth', 180, 60, 0.25, 0.3);
        return;
      case 'cannonDestroyed':
        this.synth.noiseBurst(1.2, 0.8, 2400, 60);
        this.synth.tone('sine', 100, 30, 1, 0.6);
        return;
      case 'overheated':
        this.synth.tone('sawtooth', 330, 70, 0.5, 0.25);
        return;
      case 'ufoAppeared':
        // Not a one-shot: the warble follows the saucer on the screen, see sync().
        return;
      case 'ufoDestroyed':
        this.synth.melody('square', UFO_ARPEGGIO_HZ, 0.07, 0.18);
        return;
      case 'capsuleCollected':
        this.synth.melody('triangle', CAPSULE_HZ, 0.09, 0.25);
        return;
      case 'waveStarted':
        this.synth.melody('square', WAVE_START_FANFARE_HZ, 0.1, 0.18);
        return;
      case 'waveCleared':
        this.synth.melody('square', WAVE_CLEARED_JINGLE_HZ, 0.11, 0.18);
        return;
      case 'gameOver':
        this.synth.melody('sawtooth', GAME_OVER_NOTES_HZ, GAME_OVER_NOTE_SECONDS, 0.22);
        this.synth.tone(
          'sawtooth',
          GAME_OVER_NOTES_HZ.at(-1)!,
          55,
          0.9,
          0.22,
          GAME_OVER_NOTES_HZ.length * GAME_OVER_NOTE_SECONDS,
        );
        return;
      case 'fleetStepped': {
        const hz = MARCH_HZ[event.beat % MARCH_HZ.length]!;
        this.synth.tone('square', hz, hz, 0.09, 0.4);
        return;
      }
    }
  }

  /** The laser hums while the lasers are on and the saucer warbles while it flies, both gone once the game is over. */
  sync(state: GameState): void {
    this.resumeUnlessPaused();
    const sounding = state.phase !== 'gameOver';
    glideTo(this.context, this.laserHum.gain, sounding && state.firing ? LASER_HUM.volume : 0);
    glideTo(this.context, this.ufoWarble.gain, sounding && state.ufo !== null ? UFO_WARBLE.volume : 0);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    const change = paused ? this.context.suspend() : this.context.resume();
    change.catch(ignoreFailure);
  }

  setMuted(muted: boolean): void {
    glideTo(this.context, this.master.gain, muted ? 0 : MASTER_VOLUME);
  }

  dispose(): void {
    for (const source of this.sources) source.stop();
    this.context.close().catch(ignoreFailure);
  }

  /** Browsers keep an audio context suspended until the page has had a gesture: this starts it as soon as it may. */
  private resumeUnlessPaused(): void {
    if (this.paused || this.context.state !== 'suspended') return;
    this.context.resume().catch(ignoreFailure);
  }

  private isRepeatedTooSoon(type: GameEvent['type']): boolean {
    const now = this.context.currentTime;
    const last = this.lastPlayed.get(type);
    if (last !== undefined && now - last < MIN_REPEAT_SECONDS) return true;
    this.lastPlayed.set(type, now);
    return false;
  }

  /** Starts silent: sync() brings the voice in and out, with a glide so that it never clicks. */
  private createVoice(recipe: VoiceRecipe): GainNode {
    const level = this.context.createGain();
    level.gain.value = 0;
    level.connect(this.master);
    const lowpass = this.context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = recipe.lowpassHz;
    lowpass.connect(level);

    const wobble = this.start(this.context.createOscillator());
    wobble.frequency.value = recipe.wobbleHz;
    const depth = this.context.createGain();
    depth.gain.value = recipe.wobbleDepthHz;
    wobble.connect(depth);

    for (const wave of recipe.waves) {
      const oscillator = this.start(this.context.createOscillator());
      oscillator.type = wave;
      oscillator.frequency.value = recipe.hz;
      depth.connect(oscillator.frequency);
      oscillator.connect(lowpass);
    }
    return level;
  }

  private start<T extends AudioScheduledSourceNode>(source: T): T {
    source.start();
    this.sources.push(source);
    return source;
  }
}
