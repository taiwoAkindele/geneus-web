import type { AuthorizationContext, PatientStatement } from '@shared';
import { billingRequest } from '@/lib/api/billing';
import { getDatabase } from '../database';
import { activeWorkspace } from '../facilityWorkspaces';

const authorize = (context: AuthorizationContext) => {
  if (
    !context.permissions.some((p) =>
      ['payment:receive', 'payment:waive', 'coverage:confirm', 'charge:create'].includes(p),
    )
  ) {
    throw new Error('Patient statement access has not been assigned');
  }

  const scope = activeWorkspace();

  if (scope && (scope.facilityId !== context.facilityId || scope.deviceId !== context.deviceId)) {
    throw new Error('Open this hospital workspace before reading patient statements');
  }
};

export const cachedPatientStatement = async (
  context: AuthorizationContext,
  patientId: string,
  currency: string,
): Promise<PatientStatement | undefined> => {
  authorize(context);

  const row = await getDatabase().getOptional<{ data: string }>(
    'SELECT data FROM patient_statement_snapshots WHERE patientId=? AND currency=?',
    [patientId, currency],
  );

  return row ? (JSON.parse(row.data) as PatientStatement) : undefined;
};

export const fetchPatientStatement = async (
  context: AuthorizationContext,
  patientId: string,
  currency: string,
  cutoff?: string,
) => {
  authorize(context);

  const statement = await billingRequest<PatientStatement>(context, 'statements/patient', {
    patientId,
    currency,
    ...(cutoff ? { cutoff } : {}),
  });

  if (statement.patientId !== patientId || statement.currency !== currency) {
    throw new Error('The returned statement scope does not match this patient account');
  }

  await getDatabase().execute(
    'INSERT OR REPLACE INTO patient_statement_snapshots(id,patientId,currency,cutoff,data) VALUES(?,?,?,?,?)',
    [`${patientId}:${currency}`, patientId, currency, statement.cutoff, JSON.stringify(statement)],
  );

  return statement;
};
