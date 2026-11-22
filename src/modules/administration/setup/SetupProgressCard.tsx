import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/ui';
import { useLiveQuery } from '@/data';
import { useAuthorizationContext } from '@/session';
import {
  loadSetupFacts,
  readNotNeeded,
  SETUP_WATCH,
  setupProgress,
  setupSteps,
} from './setupProgress';

/** Shown to a facility administrator on Home until every setup step is done or set aside. */
export const SetupProgressCard = () => {
  const context = useAuthorizationContext();

  const admin =
    context.role === 'facility_admin' || Boolean(context.roles?.includes('facility_admin'));

  const facts = useLiveQuery(loadSetupFacts, SETUP_WATCH);
  const [notNeeded] = useState(() => readNotNeeded(context.facilityId));

  if (!admin || !facts.data) {
    return null;
  }

  const progress = setupProgress(setupSteps(facts.data, notNeeded));

  if (progress.complete || !progress.next) {
    return null;
  }

  return (
    <section
      aria-labelledby="setup-card"
      className="flex flex-wrap items-center gap-4 rounded-card border border-brand-tint bg-brand-wash px-4 py-4 md:px-5"
    >
      <div className="min-w-0 flex-1 basis-[240px]">
        <h2 id="setup-card" className="text-[17px] font-extrabold">
          Set up your hospital
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          {progress.settled} of {progress.total} steps done · next: {progress.next.label}
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white" aria-hidden="true">
          <div
            className="h-full rounded-full bg-brand"
            style={{ width: `${Math.round((progress.settled / progress.total) * 100)}%` }}
          />
        </div>
      </div>
      <Link
        to={`/setup?step=${progress.next.id}`}
        className="inline-flex min-h-[44px] items-center gap-1 rounded-field bg-brand px-4 text-sm font-bold text-white"
      >
        Continue setup
        <Icon name="chevron" className="h-4 w-4" />
      </Link>
    </section>
  );
};
