import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, TextField, useToast } from '@/ui';
import { createStaff, type StaffDetails } from '@/data/repos/staff';
import { sendStaffInvitation } from '@/lib/api/staff';
import { VerificationRequired } from '@/lib/api/insurance';
import { useAuthorizationContext, StaffVerification, useStaffVerification } from '@/session';
import { StaffForm } from '@/modules/operations/staff';

const invitationFailure = (cause: unknown): string => {
  if (cause instanceof VerificationRequired) {
    return 'confirm your PIN on their profile, then send it.';
  }

  if (cause instanceof Error) {
    return cause.message;
  }

  return 'try again from their profile.';
};

const isEmail = (value: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());

/**
 * Add staff. Only the name and roles are needed; an email is optional. With
 * one, the person is emailed a one-time code to set their PIN on one of this
 * facility's devices — the administrator never sees it. Without one, the
 * administrator gives them a PIN code in person from their profile, as before.
 */
export const InviteStaffScreen = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const context = useAuthorizationContext();
  const { hasServerSession } = useStaffVerification();
  const [email, setEmail] = useState('');
  useEffect(() => {
    document.title = 'Add staff · Geneus Health';
  }, []);

  const allowed =
    context.permissions.includes('staff:manage') &&
    context.permissions.includes('staff:permission');

  const inviting = email.trim() !== '';
  // Letting the link set up a device is adding a device: offered only to someone who may.
  const mayAddDevices = context.permissions.includes('device:enroll');
  const [allowNewDevice, setAllowNewDevice] = useState(false);

  const save = async (details: StaffDetails) => {
    if (inviting && !isEmail(email)) {
      throw new Error(
        'Enter a valid email address, or leave it empty to give them a PIN code in person',
      );
    }

    // Checked before anything is saved, so the person is never added with an invitation that cannot go.
    if (inviting && !hasServerSession) {
      throw new Error('Confirm your PIN to send the invitation, or leave the email empty');
    }

    const created = await createStaff(details, context);
    const profile = `/admin/staff/${encodeURIComponent(created.staffId)}`;

    if (!inviting) {
      toast(
        `${details.fullName} added — give them a PIN code from their profile so they can set their PIN`,
      );

      navigate(profile);

      return;
    }

    try {
      const { invitation } = await sendStaffInvitation(
        context,
        created.staffId,
        email.trim(),
        mayAddDevices && allowNewDevice,
      );

      toast(
        invitation.delivery === 'provider_accepted'
          ? `${details.fullName} added — invitation emailed to ${invitation.destination}`
          : `${details.fullName} added, but the invitation email was not sent. See their profile.`,
      );
    } catch (cause) {
      // The person is added either way; the invitation can be sent again from their profile.
      toast(
        `${details.fullName} added, but the invitation was not sent: ${invitationFailure(cause)}`,
        {
          tone: 'error',
        },
      );
    }

    navigate(profile);
  };

  return (
    <div className="w-full max-w-[1240px] space-y-5 px-5 py-5 md:px-8">
      <header>
        <button
          type="button"
          onClick={() => navigate('/admin/staff')}
          className="-ml-1 mb-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand"
        >
          <Icon name="back" className="h-4 w-4" />
          Back to staff
        </button>
        <h1 className="text-2xl font-extrabold">Add staff</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Add their details, choose their roles and review the access you are granting.
        </p>
      </header>
      <div>
        {allowed ? (
          <>
            {/* This verification panel owns a form, so it stays outside StaffForm. */}
            {inviting && !hasServerSession ? (
              <div className="mb-5 max-w-2xl">
                <StaffVerification requireServerSession purpose="Sending an invitation" />
              </div>
            ) : null}
            <StaffForm
              layout="split"
              canEditName
              canEditAccess
              submitLabel={inviting ? 'Add and send invitation' : 'Add staff member'}
              onSave={save}
              summaryContent={
                <div className="space-y-1 text-xs text-ink-muted">
                  <p className="text-sm font-semibold text-ink">PIN setup</p>
                  {inviting ? (
                    <>
                      <p className="break-all">Email invitation to {email.trim()}</p>
                      <p>
                        {hasServerSession
                          ? 'They receive an Accept invitation link to set their PIN.'
                          : 'Confirm your PIN before the invitation can be sent.'}
                      </p>
                      {mayAddDevices && allowNewDevice ? (
                        <p>The link may also set up one new device for them.</p>
                      ) : null}
                    </>
                  ) : (
                    <p>
                      Give them a one-time PIN code in person from their profile after adding them.
                    </p>
                  )}
                </div>
              }
            >
              <TextField
                label="Email address (optional)"
                name="staff_invite_email"
                type="email"
                inputMode="email"
                autoComplete="off"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                hint="Leave blank to give their PIN setup code in person."
              />
              {inviting && mayAddDevices ? (
                <label className="flex min-h-11 items-start gap-3 rounded-field border border-outline-soft p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={allowNewDevice}
                    onChange={(event) => setAllowNewDevice(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-brand"
                  />
                  <span>
                    <span className="block font-bold">
                      Allow this person to set up one new device
                    </span>
                    <span className="block text-xs text-ink-muted">
                      For staff who will use a phone the facility has not added yet. The link can
                      set up one device, once, until the invitation expires. Leave unticked if they
                      will use a device the facility already has.
                    </span>
                  </span>
                </label>
              ) : null}
            </StaffForm>
          </>
        ) : (
          <p className="text-sm text-ink-muted">
            Adding staff needs permission to manage staff and assign access. Ask a facility admin.
          </p>
        )}
      </div>
    </div>
  );
};
