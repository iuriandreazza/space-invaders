import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { RunResult, RunningGame } from '../application/ports.ts';
import type { AppServices } from './services.ts';
import { useHotkeys } from './useHotkeys.ts';

interface GameScreenProps {
  services: AppServices;
  onGameOver: (result: RunResult) => void;
}

export function GameScreen({ services, onGameOver }: GameScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<RunningGame | null>(null);
  const onGameOverRef = useRef(onGameOver);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(() => services.preferences.loadMuted());

  useEffect(() => {
    onGameOverRef.current = onGameOver;
  });

  // The game is created and destroyed with the screen. Strict Mode mounts effects twice in development,
  // so the cleanup has to stop the loop and release the keyboard and the audio for good.
  useEffect(() => {
    const game = services.startGame(canvasRef.current!, (result) => onGameOverRef.current(result));
    gameRef.current = game;
    return () => {
      game.dispose();
      gameRef.current = null;
    };
  }, [services]);

  useEffect(() => {
    gameRef.current?.setMuted(muted);
    services.preferences.saveMuted(muted);
  }, [muted, services]);

  useEffect(() => {
    if (paused) gameRef.current?.pause();
    else gameRef.current?.resume();
  }, [paused]);

  useEffect(() => {
    const pause = () => setPaused(true);
    const pauseWhenHidden = () => {
      if (document.hidden) pause();
    };
    window.addEventListener('blur', pause);
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => {
      window.removeEventListener('blur', pause);
      document.removeEventListener('visibilitychange', pauseWhenHidden);
    };
  }, []);

  const togglePause = () => setPaused((current) => !current);
  const toggleMute = () => setMuted((current) => !current);
  useHotkeys({ KeyP: togglePause, Escape: togglePause, KeyM: toggleMute });

  const handleMuteClick = (event: MouseEvent<HTMLButtonElement>) => {
    toggleMute();
    // A focused button would also react to the space bar, which is the fire key.
    event.currentTarget.blur();
  };

  return (
    <main className="screen game">
      <div className="game__frame">
        <canvas ref={canvasRef} className="game__canvas" role="img" aria-label="Space Invaders game screen" />
        {paused && (
          <div className="game__overlay" role="status">
            <p className="game__overlay-title">Paused</p>
            <button type="button" className="button button--primary" onClick={() => setPaused(false)}>
              Resume
            </button>
            <p className="hint">or press P</p>
          </div>
        )}
      </div>
      <div className="game__bar">
        {/* Which line is shown depends on the device: see `.game__hint` in the stylesheet. */}
        <p className="muted game__hint game__hint--fine">
          Aim with the mouse or arrows · fire with click or Space · P pause · M mute
        </p>
        <p className="muted game__hint game__hint--coarse">Drag to aim · hold to fire</p>
        <button type="button" className="button button--small" aria-pressed={muted} onClick={handleMuteClick}>
          {muted ? 'Sound off' : 'Sound on'}
        </button>
      </div>
    </main>
  );
}
