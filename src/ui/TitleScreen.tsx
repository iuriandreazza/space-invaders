import { MAX_WAVE_BONUS, POINTS, UFO_POINTS, WAVE_BONUS_PER_WAVE } from '../../shared/game/constants.ts';
import { Leaderboard } from './Leaderboard.tsx';
import { formatScore } from './LeaderboardTable.tsx';
import { PixelSprite, type SpriteName } from './PixelSprite.tsx';
import type { AppServices } from './services.ts';
import { useHotkeys } from './useHotkeys.ts';

interface TitleScreenProps {
  services: AppServices;
  onStart: () => void;
}

const CONTROLS: ReadonlyArray<readonly [keys: string[], action: string]> = [
  [['Mouse'], 'Move to aim, hold the left button to fire'],
  [['Touch'], 'Drag to aim, holding your finger down fires'],
  [['Keyboard'], 'Arrows or WASD to aim, Space, Z or X to fire'],
  [['P', 'Esc'], 'Pause'],
  [['M'], 'Mute'],
];

const SCORING: ReadonlyArray<{ sprite: SpriteName; name: string; points: string }> = [
  { sprite: 'squid', name: 'Squid', points: String(POINTS.squid) },
  { sprite: 'crab', name: 'Crab', points: String(POINTS.crab) },
  { sprite: 'octopus', name: 'Octopus', points: String(POINTS.octopus) },
  { sprite: 'ufo', name: 'UFO', points: `${Math.min(...UFO_POINTS)}–${Math.max(...UFO_POINTS)}` },
];

export function TitleScreen({ services, onStart }: TitleScreenProps) {
  useHotkeys({ Enter: onStart, Space: onStart });

  return (
    <main className="screen title">
      <header className="title__header">
        <h1 className="logo">Space Invaders</h1>
        <p className="muted">Two cannons, one reticle: aim the lasers and hold the line.</p>
      </header>

      <section className="panel">
        <button type="button" className="button button--primary" onClick={onStart}>
          Start game
        </button>
        <p className="hint">or press Enter or Space</p>
        <p className="rules">
          Both cannons fire at the reticle. The lasers overheat, so fire in bursts. Protect the cannons and the
          bunkers, and shoot the glowing capsules the UFO drops.
        </p>
        <h2 className="panel__title">Controls</h2>
        <dl className="controls">
          {CONTROLS.map(([keys, action]) => (
            <div key={action} className="controls__row">
              <dt>
                {keys.map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="panel">
        <h2 className="panel__title">Top gunners</h2>
        <Leaderboard leaderboard={services.leaderboard} />
        <h2 className="panel__title">Scoring</h2>
        <dl className="scoring">
          {SCORING.map(({ sprite, name, points }) => (
            <div key={name} className={`scoring__row scoring__row--${sprite}`}>
              <dt>
                <span className="scoring__icon">
                  <PixelSprite name={sprite} />
                </span>
                {name}
              </dt>
              <dd>{points}</dd>
            </div>
          ))}
        </dl>
        <p className="hint">
          Clearing a wave is worth {WAVE_BONUS_PER_WAVE} points times the wave, up to {formatScore(MAX_WAVE_BONUS)}.
        </p>
      </section>
    </main>
  );
}
