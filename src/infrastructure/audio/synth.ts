/** How long a note takes to reach full volume: a few milliseconds, because a jump from silence is heard as a click. */
const ATTACK_SECONDS = 0.004;
/** Exponential ramps cannot start from or reach zero, so a "silent" level is a hair above it. */
const SILENCE = 0.001;
const SMOOTHING_SECONDS = 0.03;

/** Moves a parameter to a value over a few milliseconds: setting it outright would click. */
export function glideTo(context: AudioContext, param: AudioParam, value: number): void {
  param.setTargetAtTime(value, context.currentTime, SMOOTHING_SECONDS);
}

function createNoise(context: AudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  return buffer;
}

/** The one-shot sounds the game is made of: notes that slide, noise that sweeps, and notes in a row. */
export class Synth {
  private readonly context: AudioContext;
  private readonly output: AudioNode;
  private readonly noise: AudioBuffer;

  constructor(context: AudioContext, output: AudioNode) {
    this.context = context;
    this.output = output;
    this.noise = createNoise(context);
  }

  /** A note whose pitch slides from `fromHz` to `toHz` and that dies out over `seconds`. */
  tone(type: OscillatorType, fromHz: number, toHz: number, seconds: number, volume: number, delaySeconds = 0): void {
    const start = this.context.currentTime + delaySeconds;
    const oscillator = this.context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(fromHz, start);
    oscillator.frequency.exponentialRampToValueAtTime(toHz, start + seconds);
    this.shape(oscillator, volume, start, seconds);
    oscillator.start(start);
    oscillator.stop(start + seconds);
  }

  /** Noise whose brightness sweeps from `fromHz` down to `toHz`: the lower, the heavier the blast. */
  noiseBurst(seconds: number, volume: number, fromHz: number, toHz: number): void {
    const start = this.context.currentTime;
    const source = this.context.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const lowpass = this.context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(fromHz, start);
    lowpass.frequency.exponentialRampToValueAtTime(toHz, start + seconds);
    source.connect(lowpass);
    this.shape(lowpass, volume, start, seconds);
    source.start(start);
    source.stop(start + seconds);
  }

  /** Notes one after the other, each at its own pitch. */
  melody(type: OscillatorType, notesHz: readonly number[], noteSeconds: number, volume: number): void {
    notesHz.forEach((hz, index) => this.tone(type, hz, hz, noteSeconds, volume, index * noteSeconds));
  }

  /** Sends a source to the speakers through an envelope: a quick rise to `volume`, then a fade to silence. */
  private shape(source: AudioNode, volume: number, start: number, seconds: number): void {
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(SILENCE, start);
    envelope.gain.linearRampToValueAtTime(volume, start + ATTACK_SECONDS);
    envelope.gain.exponentialRampToValueAtTime(SILENCE, start + seconds);
    source.connect(envelope);
    envelope.connect(this.output);
  }
}
