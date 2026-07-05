import { useState } from 'react';
import { AppBar } from '@/ui/AppBar';
import { Card } from '@/ui/Card';
import { PatientForm, type PatientFormValues } from '@/features/registration';

/**
 * Register patient — thin page shell. Composes the AppBar + PatientForm and
 * owns the page's local wiring only. Domain logic lives in
 * `features/registration`; this file just renders and wires.
 *
 * STEP 1: UI only. The submit handler is a demo; persistence via a repository +
 * the shared contract is wired in the integration step.
 */
export const RegisterPatientScreen = () => {
  const [savedName, setSavedName] = useState<string | null>(null);

  const handleSubmit = (values: PatientFormValues) => {
    setSavedName(values.fullName || 'patient');
  }

  return (
    <div className="min-h-screen">
      <AppBar title="Geneus Health" />
      <main className="mx-auto max-w-md space-y-4 p-4">
        <h1 className="text-2xl font-bold">Register patient</h1>
        <p className="text-gray-600">
          Enter the patient&rsquo;s details. Only name, address and sex are required.
        </p>

        <PatientForm onSubmit={handleSubmit} />

        {savedName ? (
          <Card className="border-2 border-brand bg-brand-tint">
            <p className="text-lg font-semibold text-brand-dark">
              Saved &ldquo;{savedName}&rdquo; (demo)
            </p>
            <p className="text-sm text-gray-600">
              Not yet persisted &mdash; the data layer is the next step.
            </p>
          </Card>
        ) : null}
      </main>
    </div>
  );
}
