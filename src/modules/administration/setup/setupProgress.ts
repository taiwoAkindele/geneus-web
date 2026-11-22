import {
  careServiceOfferings,
  isLabTestOffering,
  type Facility,
  type FeeItem,
  type Location,
  type RosterShift,
  type ServiceDefinition,
  type ServiceOffering,
  type Staff,
  type StockItem,
  type Unit,
} from '@shared';
import { allOfType } from '@/data/db';
import { getFacility } from '@/data/repos/facility';

const servicesSummary = (activeCount: number, unfinishedCount: number): string => {
  if (activeCount) {
    return plural(activeCount, 'active care service');
  }

  if (unfinishedCount) {
    return `${plural(unfinishedCount, 'care service')} not yet active`;
  }

  return 'No care services yet';
};

const stepStatus = (isDone: boolean, isNotNeeded: boolean, isStarted: boolean) => {
  if (isDone) {
    return 'done';
  }

  if (isNotNeeded) {
    return 'not_needed';
  }

  return isStarted ? 'started' : 'todo';
};

/**
 * What a hospital needs before it can run day to day, read from the records it
 * already has. Nothing here is stored as "setup state": a team added from
 * Settings counts exactly like one added in the guide. Notes are advice and
 * never hold a step back; a step the hospital does not need can be set aside.
 */
export type SetupFacts = {
  facility?: Pick<Facility, 'timeZone'>;
  units: readonly Unit[];
  locations: readonly Location[];
  offerings: readonly ServiceOffering[];
  /** Tells care services apart from lab tests, which are offerings too. */
  definitions?: readonly Pick<ServiceDefinition, 'id' | 'investigation'>[];
  fees: readonly FeeItem[];
  stock: readonly StockItem[];
  staff: readonly Staff[];
  shifts: readonly RosterShift[];
};

/** One definition of care service versus lab test, shared with booking and the server. */
export { careServiceOfferings, isLabTestOffering };

export const SETUP_STEP_IDS = [
  'facility',
  'teams',
  'places',
  'services',
  'prices',
  'staff',
] as const;

export type SetupStepId = (typeof SETUP_STEP_IDS)[number];

export type SetupStepStatus = 'done' | 'started' | 'todo' | 'not_needed';

export type SetupStep = {
  id: SetupStepId;
  label: string;
  status: SetupStepStatus;
  summary: string;
  notes: string[];
};

export const SETUP_WATCH = [
  'facility',
  'unit',
  'location',
  'service_definition',
  'service_offering',
  'fee_item',
  'stock_item',
  'staff',
  'roster_shift',
] as const;

export const loadSetupFacts = async (): Promise<SetupFacts> => {
  const [facility, units, locations, definitions, offerings, fees, stock, staff, shifts] =
    await Promise.all([
      getFacility(),
      allOfType<Unit>('unit'),
      allOfType<Location>('location'),
      allOfType<ServiceDefinition>('service_definition'),
      allOfType<ServiceOffering>('service_offering'),
      allOfType<FeeItem>('fee_item'),
      allOfType<StockItem>('stock_item'),
      allOfType<Staff>('staff'),
      allOfType<RosterShift>('roster_shift'),
    ]);

  return { facility, units, locations, definitions, offerings, fees, stock, staff, shifts };
};

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

const names = (items: readonly { name: string }[]) =>
  items
    .slice(0, 3)
    .map((item) => item.name)
    .join(', ') + (items.length > 3 ? ` and ${items.length - 3} more` : '');

export const setupSteps = (
  facts: SetupFacts,
  notNeeded: ReadonlySet<SetupStepId> = new Set(),
  now = Date.now(),
): SetupStep[] => {
  const units = facts.units.filter((u) => u.active);
  const locations = facts.locations.filter((l) => l.active);

  const wardsWithoutBeds = locations.filter(
    (l) =>
      l.kind === 'ward' && !locations.some((bed) => bed.kind === 'bed' && bed.parentId === l.id),
  );

  // Lab tests are offerings for ordering and pricing, not care services: they are set up in the Lab catalogue.
  const care = careServiceOfferings(facts.offerings, facts.definitions);
  const offerings = care.filter((o) => o.configuration === 'active');

  const unfinished = care.filter(
    (o) => o.configuration === 'draft' || o.configuration === 'proposed',
  );

  const fees = facts.fees.filter((f) => f.active);
  const priced = new Set(fees.map((f) => f.id));

  // Optional operational links are separate from the central prices used for direct billing.
  const unpricedTests = facts.offerings.filter(
    (o) =>
      o.configuration === 'active' &&
      isLabTestOffering(o, facts.definitions) &&
      (!o.feeItemId || !priced.has(o.feeItemId)),
  );

  const unpricedStock = facts.stock.filter((s) => !s.feeItemId || !priced.has(s.feeItemId));
  const staff = facts.staff.filter((s) => s.active);

  const onRoster = new Set(
    facts.shifts.filter((s) => Date.parse(s.endsAt) > now).map((s) => s.staffId),
  );

  const unrostered = staff.filter((s) => !onRoster.has(s.staffId) && s.loginAccess !== 'always');

  const steps: (Omit<SetupStep, 'status'> & { done: boolean; started: boolean })[] = [
    {
      id: 'facility',
      label: 'Facility',
      done: Boolean(facts.facility?.timeZone),
      started: false,
      summary: facts.facility?.timeZone
        ? `Time zone ${facts.facility.timeZone}`
        : 'Time zone not set',
      notes: facts.facility?.timeZone
        ? []
        : ['Dates on bills, claims and reports use this time zone.'],
    },
    {
      id: 'teams',
      label: 'Teams & units',
      done: units.length > 0,
      started: false,
      summary: units.length ? plural(units.length, 'active team') : 'No teams yet',
      notes: [],
    },
    {
      id: 'places',
      label: 'Places & beds',
      done: locations.length > 0,
      started: false,
      summary: locations.length ? plural(locations.length, 'place') : 'No places yet',
      notes: wardsWithoutBeds.length ? [`No beds yet in ${names(wardsWithoutBeds)}.`] : [],
    },
    {
      id: 'services',
      label: 'Care services',
      done: offerings.length > 0,
      started: unfinished.length > 0,
      summary: servicesSummary(offerings.length, unfinished.length),
      notes:
        offerings.length && unfinished.length
          ? [`${plural(unfinished.length, 'care service')} still in draft or awaiting review.`]
          : [],
    },
    {
      id: 'prices',
      label: 'Prices',
      done: fees.length > 0,
      started: false,
      summary: fees.length ? plural(fees.length, 'active price') : 'No prices yet',
      notes: [
        ...(unpricedTests.length
          ? [
              `${plural(unpricedTests.length, 'lab test')} without a linked Billing item. Link it in Laboratory when configuring ordering; direct Billing remains available.`,
            ]
          : []),
        ...(unpricedStock.length
          ? [
              `${plural(unpricedStock.length, 'stock item')} without a linked Billing item. Stock configuration is separate from selling prices.`,
            ]
          : []),
      ],
    },
    {
      id: 'staff',
      label: 'Staff & shifts',
      done: staff.length > 1,
      started: staff.length === 1,
      summary: staff.length > 1 ? plural(staff.length, 'active staff member') : 'Only you so far',
      notes:
        staff.length > 1 && unrostered.length
          ? [`${plural(unrostered.length, 'person', 'people')} with no upcoming shift.`]
          : [],
    },
  ];

  return steps.map(({ done, started, ...step }) => ({
    ...step,
    status: stepStatus(done, notNeeded.has(step.id), started),
  }));
};

export const setupProgress = (steps: readonly SetupStep[]) => {
  const settled = steps.filter((s) => s.status === 'done' || s.status === 'not_needed').length;

  return {
    settled,
    total: steps.length,
    complete: settled === steps.length,
    next: steps.find((s) => s.status !== 'done' && s.status !== 'not_needed'),
  };
};

/** Setting a step aside is a convenience on this device, not a facility record. */
const notNeededKey = (facilityId: string) => `geneus.setupNotNeeded:${facilityId}`;

export const readNotNeeded = (facilityId: string): Set<SetupStepId> => {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(notNeededKey(facilityId)) ?? '[]');

    return new Set(
      Array.isArray(raw)
        ? raw.filter((id): id is SetupStepId => (SETUP_STEP_IDS as readonly string[]).includes(id))
        : [],
    );
  } catch {
    return new Set();
  }
};

export const writeNotNeeded = (facilityId: string, ids: ReadonlySet<SetupStepId>) => {
  try {
    localStorage.setItem(notNeededKey(facilityId), JSON.stringify([...ids]));
  } catch {
    /* storage unavailable: the choice lasts this visit */
  }
};
