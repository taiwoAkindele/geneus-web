import { STATION_QUEUES, type StationQueue } from './stationQueues';

/**
 * Which queue this device usually works — the lab bench's phone opens on the
 * lab queue. A per-device convenience, not a rule: anyone on duty may open any
 * queue (PRD §9.8.2). Storage can be unavailable (private mode); then the
 * screen simply opens on every encounter.
 */
const KEY = 'geneus.deviceStation';

export type StationView = 'all' | StationQueue;

export const readDeviceStation = (): StationView => {
  try {
    const stored = localStorage.getItem(KEY);
    return stored && (STATION_QUEUES as readonly string[]).includes(stored) ? (stored as StationQueue) : 'all';
  } catch {
    return 'all';
  }
};

export const rememberDeviceStation = (view: StationView): void => {
  try {
    localStorage.setItem(KEY, view);
  } catch {
    // Not remembered; the screen opens on every encounter next time.
  }
};
