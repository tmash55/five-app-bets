/** Starting games from the menus: turns the save file into a match setup and hands it to the match screen. */

import { duoSetup, ladderSetup, quickSetup, tourSetup, type DuoOptions, type Prefs, type QuickOptions } from '@/meta/setups';
import { nextTourGame, tourById } from '@/meta/tour';
import { squadLevels, type SaveData } from './logic';
import { useSave } from './save';
import { useSession } from './session';

export function prefsFrom(data: SaveData): Prefs {
  return { squad: squadLevels(data), quarterSeconds: data.settings.quarterSeconds, easyShots: data.settings.easyShots, homeTeam: data.homeTeam, uniform: data.uniform };
}

export function startQuick(options: QuickOptions): void {
  const data = useSave.getState();
  useSession.getState().begin(quickSetup(prefsFrom(data), options), options);
}

/** Two people on one screen: the device's squad against the team the second person picked. */
export function startDuo(options: DuoOptions): void {
  const data = useSave.getState();
  useSession.getState().begin(duoSetup(prefsFrom(data), options), undefined, options);
}

export function startLadder(): void {
  const data = useSave.getState();
  useSession.getState().begin(ladderSetup(prefsFrom(data), data.ladder.points, data.settings.format));
}

export function startTour(tourId: string, stage: number, game: number): boolean {
  const data = useSave.getState();
  const setup = tourSetup(prefsFrom(data), tourId, stage, game);
  if (!setup) return false;
  useSession.getState().begin(setup);
  return true;
}

/** What "play again" means after a game: the same kind of game, or the next stop on the tour after a win. */
export function startNext(): boolean {
  const session = useSession.getState();
  const last = session.setup;
  if (!last) return false;
  if (last.mode === 'ladder') {
    startLadder();
    return true;
  }
  if (last.mode === 'duo') {
    if (!session.duo) return false;
    startDuo(session.duo);
    return true;
  }
  if (last.mode === 'tour' && last.tour) {
    const data = useSave.getState();
    const tour = tourById(last.tour.tourId, data.homeTeam);
    const next = session.summary?.won ? nextTourGame(data.tour, tour) : null;
    return next ? startTour(tour.id, next.stage, next.game) : startTour(tour.id, last.tour.stage, last.tour.game);
  }
  if (session.quick) {
    startQuick(session.quick);
    return true;
  }
  return false;
}
