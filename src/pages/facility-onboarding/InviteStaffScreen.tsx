import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, Button, ChoiceChip, StatusPill, TextField } from "@/ui";

const ROLES = ["CHEW", "Nurse", "Doctor", "Records", "Admin"];

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
  const [role, setRole] = useState("CHEW");
  const [perm, setPerm] = useState<"read" | "write">("write");

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
          />
          <TextField
            label="Email or phone"
            placeholder="e.g. 0803 555 0147"
            name="staff_contact"
          />

          <div>
            <div className="mb-2.5 text-[13px] font-semibold text-ink-soft">
              Role
            </div>
            <div className="flex flex-wrap gap-2">
              {ROLES.map((r) => (
                <ChoiceChip
                  key={r}
                  selected={role === r}
                  onClick={() => setRole(r)}
                >
                  {r}
                  {role === r ? " ✓" : ""}
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
                selected={perm === "read"}
                onClick={() => setPerm("read")}
              />
              <PermissionCard
                title="Read & write"
                desc="View & record care"
                selected={perm === "write"}
                onClick={() => setPerm("write")}
              />
            </div>
          </div>
        </div>

        <footer className="px-5 pb-6 pt-4">
          <Button variant="primary" onClick={() => navigate("/admin/staff")}>
            Send invite
          </Button>
        </footer>
      </div>
    </div>
  );
};
