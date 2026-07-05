import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, Avatar, Button, Card, StatusPill, Tag } from "@/ui";

type Tone = "green" | "slate" | "amber" | "muted";

const StaffRow = ({
  initials,
  tone,
  name,
  detail,
  trailing,
  onClick,
}: {
  initials: string;
  tone: Tone;
  name: string;
  detail: string;
  trailing: ReactNode;
  onClick?: () => void;
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
    >
      <Avatar tone={tone} size="sm">
        {initials}
      </Avatar>
      <div className="flex-1">
        <div className="text-[15px] font-bold">{name}</div>
        <div className="text-xs text-ink-muted">{detail}</div>
      </div>
      {trailing}
    </button>
  );
};

const GroupLabel = ({
  children,
  tone,
}: {
  children: string;
  tone: "green" | "muted";
}) => {
  return (
    <div
      className={`text-xs font-bold uppercase tracking-[0.06em] ${
        tone === "green" ? "text-brand-strong" : "text-ink-muted"
      }`}
    >
      {children}
    </div>
  );
};

export const ManageStaffScreen = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-surface">
      <AppBar
        title="Staff"
        onBack={() => navigate(-1)}
        right={
          <div className="flex items-center gap-2">
            <StatusPill status="synced" />
            <button
              type="button"
              onClick={() => navigate("/admin/staff/invite")}
              className="min-h-0 rounded-full bg-brand-tint px-3 py-1.5 text-[13px] font-bold text-brand"
            >
              ＋ Invite
            </button>
          </div>
        }
      />
      <div className="mx-auto max-w-md space-y-4 px-5 py-3 pb-24 md:max-w-2xl">
        <GroupLabel tone="green">On shift now · 2</GroupLabel>
        <Card padded={false} className="divide-y divide-outline-soft">
          <StaffRow
            initials="AO"
            tone="green"
            name="Amaka Okoro"
            detail="CHEW · Read & write"
            trailing={<Tag tone="green">07–15</Tag>}
            onClick={() => navigate("/admin/staff/access")}
          />
          <StaffRow
            initials="TB"
            tone="slate"
            name="Dr. Tunde Bello"
            detail="Doctor · Read & write"
            trailing={<Tag tone="green">07–15</Tag>}
          />
        </Card>

        <GroupLabel tone="muted">Off shift & pending</GroupLabel>
        <Card padded={false} className="divide-y divide-outline-soft">
          <StaffRow
            initials="GN"
            tone="muted"
            name="Grace Nwosu"
            detail="Records · Read only"
            trailing={
              <span className="text-[11px] font-semibold text-ink-muted">
                Off
              </span>
            }
          />
          <StaffRow
            initials="?"
            tone="amber"
            name="Ngozi Ali"
            detail="Nurse · invite sent"
            trailing={<Tag tone="amber">Pending</Tag>}
          />
        </Card>

        <div className="pt-2">
          <Button variant="danger" fullWidth={false} className="px-0">
            Remove a staff member
          </Button>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            Removing revokes access immediately, on every device — their past
            records stay intact.
          </p>
        </div>
      </div>
    </div>
  );
};
