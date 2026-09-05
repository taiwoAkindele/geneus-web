import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Role, StaffPermission } from "@shared";
import { AppBar, Button, ChoiceChip, StatusPill, TextField, useToast } from "@/ui";
import { useWriteContext } from "@/data";
import { createStaff } from "@/data/repos/staff";
import { useSession } from "@/session";

const ROLES: { label: string; value: Role }[] = [
  { label: "CHEW", value: "chew" },
  { label: "Nurse", value: "nurse" },
  { label: "Doctor", value: "doctor" },
  { label: "Records", value: "records_officer" },
  { label: "Admin", value: "facility_admin" },
];

const PermissionCard = ({
  title,
  desc,
  selected,
  onClick,
}: {
  title: string;
  desc: string;
  selected: boolean;
  onClick: () => void;
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex-1 rounded-[13px] p-3.5 text-left ${
        selected
          ? "border-2 border-brand bg-brand-wash"
          : "border-[1.5px] border-outline bg-white"
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`text-[15px] font-bold ${selected ? "text-brand" : "text-ink-soft"}`}
        >
          {title}
        </span>
        {selected ? (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-[11px] font-extrabold text-white">
            ✓
          </span>
        ) : null}
      </div>
      <div
        className={`mt-0.5 text-xs ${selected ? "text-brand-strong" : "text-ink-muted"}`}
      >
        {desc}
      </div>
    </button>
  );
};

export const InviteStaffScreen = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useSession();
  const context = useWriteContext(user.staffId, user.canWrite);
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("chew");
  const [permission, setPermission] = useState<StaffPermission>("read_write");
  const [saving, setSaving] = useState(false);

  const invite = async () => {
    if (!fullName.trim() || saving) return;
    setSaving(true);
    try {
      await createStaff({ fullName: fullName.trim(), role, permission }, context);
      toast(`${fullName.trim()} added — they set a PIN from the sign-in screen`);
      navigate("/admin/staff");
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Could not add the staff member");
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <AppBar
        title="Invite staff"
        onBack={() => navigate(-1)}
        right={<StatusPill status="synced" />}
      />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col md:max-w-lg">
        <div className="flex-1 space-y-4 px-5 py-3">
          <TextField
            label="Full name"
            placeholder="e.g. Amaka Okoro"
            name="staff_name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />

          <div>
            <div className="mb-2.5 text-[13px] font-semibold text-ink-soft">
              Role
            </div>
            <div className="flex flex-wrap gap-2">
              {ROLES.map((option) => (
                <ChoiceChip
                  key={option.value}
                  selected={role === option.value}
                  onClick={() => setRole(option.value)}
                >
                  {option.label}
                  {role === option.value ? " ✓" : ""}
                </ChoiceChip>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2.5 text-[13px] font-semibold text-ink-soft">
              Permission
            </div>
            <div className="flex gap-2.5">
              <PermissionCard
                title="Read only"
                desc="View records"
                selected={permission === "read_only"}
                onClick={() => setPermission("read_only")}
              />
              <PermissionCard
                title="Read & write"
                desc="View & record care"
                selected={permission === "read_write"}
                onClick={() => setPermission("read_write")}
              />
            </div>
          </div>
        </div>

        <footer className="px-5 pb-6 pt-4">
          <Button variant="primary" disabled={!fullName.trim() || saving} loading={saving} onClick={invite}>
            Add staff member
          </Button>
        </footer>
      </div>
    </div>
  );
};
