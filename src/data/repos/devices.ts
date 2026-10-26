import type { Device } from '@shared';
import { allOfType } from '../db';

/** Server-owned records delivered by the facility's sync stream. */
export const listDevices = () => allOfType<Device>('device');
