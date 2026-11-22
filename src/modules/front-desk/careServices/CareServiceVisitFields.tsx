import { useEffect } from 'react';
import { VISIT_TYPE_NAMES, VisitType, type ServiceOffering } from '@shared';
import { SelectField } from '@/ui';
import { useLiveQuery } from '@/data';
import {
  CARE_SERVICE_WATCH,
  careServicesFor,
  loadCareServices,
  type CareVisitChoice,
} from '@/data/repos/careServices';

/** Emergency care is never held back for want of a set-up service. */
const EMERGENCY = 'emergency:none';

/** The service the choice should start on: one that records this visit type, else the first. */
export const defaultCareChoice = (
  services: readonly Pick<ServiceOffering, 'id' | 'visitTypes'>[],
  visitType: VisitType,
): CareVisitChoice | undefined => {
  const service = services.find((s) => s.visitTypes.includes(visitType)) ?? services[0];

  return service
    ? {
        offeringId: service.id,
        visitType: service.visitTypes.includes(visitType) ? visitType : service.visitTypes[0],
      }
    : undefined;
};

/**
 * Choose what a visit is for from the hospital's own care services, and the
 * kind of visit when a service records more than one (a first consultation or a
 * follow-up). The visit type that fee exemptions, registers and reports read is
 * always filled in. A hospital with no care services set up keeps the plain
 * visit-type list, and emergency care can always be recorded.
 */
export const CareServiceVisitFields = ({
  arrival,
  value,
  onChange,
  label = 'Care service',
  keep,
}: {
  arrival?: 'scheduled' | 'walk_in';
  value: CareVisitChoice;
  onChange: (value: CareVisitChoice) => void;
  label?: string;
  /** A service already recorded (a booking's), kept as a choice even if it no longer takes new arrivals. */
  keep?: Pick<ServiceOffering, 'id' | 'name' | 'visitTypes'>;
}) => {
  const query = useLiveQuery(loadCareServices, CARE_SERVICE_WATCH);
  const listed = careServicesFor(query.data, arrival);
  const services = keep && !listed.some((s) => s.id === keep.id) ? [keep, ...listed] : listed;
  const selected = services.find((s) => s.id === value.offeringId);
  const emergencyListed = services.some((s) => s.visitTypes.includes('emergency'));

  const unset =
    query.data &&
    services.length > 0 &&
    !selected &&
    !(value.visitType === 'emergency' && !value.offeringId && !emergencyListed);

  // Pick a default only at the moment the choice becomes unset. `services` and `onChange`
  // are new on every render, so depending on them would keep re-applying the default.
  useEffect(() => {
    if (!unset) {
      return;
    }

    const start = defaultCareChoice(services, value.visitType);

    if (start) {
      onChange(start);
    }
  }, [unset]);

  if (!query.data) {
    return (
      <SelectField
        label={label}
        disabled
        value=""
        options={[{ value: '', label: 'Loading care services…' }]}
      />
    );
  }

  if (!services.length) {
    return (
      <SelectField
        label="Visit type"
        value={value.visitType}
        onChange={(e) => onChange({ visitType: e.target.value as VisitType })}
        options={VisitType.options.map((type) => ({ value: type, label: VISIT_TYPE_NAMES[type] }))}
      />
    );
  }

  const choose = (id: string) => {
    if (id === EMERGENCY) {
      return onChange({ visitType: 'emergency' });
    }

    const service = services.find((s) => s.id === id)!;
    onChange({
      offeringId: id,
      visitType: service.visitTypes.includes(value.visitType)
        ? value.visitType
        : service.visitTypes[0],
    });
  };

  return (
    <div className="space-y-3">
      <SelectField
        label={label}
        value={selected?.id ?? (value.visitType === 'emergency' ? EMERGENCY : '')}
        onChange={(e) => choose(e.target.value)}
        options={[
          ...services.map((s) => ({ value: s.id, label: s.name })),
          ...(emergencyListed ? [] : [{ value: EMERGENCY, label: 'Emergency' }]),
        ]}
      />
      {selected && selected.visitTypes.length > 1 ? (
        <SelectField
          label="Kind of visit"
          value={value.visitType}
          onChange={(e) =>
            onChange({ offeringId: selected.id, visitType: e.target.value as VisitType })
          }
          options={selected.visitTypes.map((type) => ({
            value: type,
            label: VISIT_TYPE_NAMES[type],
          }))}
        />
      ) : null}
    </div>
  );
};
