import { useNavigate } from "react-router-dom";
import { Stat, StatusPill, Tag } from "@/ui";

/** A setup-checklist row: done = filled amber check, todo = amber ring. */
const ChecklistItem = ({
  done,
  children,
}: {
  done?: boolean;
  children: string;
}) => {
  return (
    <div className="flex items-center gap-2.5 text-[13px] text-amber-text">
      {done ? (
        <span className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-amber text-[11px] font-extrabold text-white">
          ✓
        </span>
      ) : (
        <span className="h-[18px] w-[18px] flex-none rounded-full border-2 border-[#c9a24a]" />
      )}
      {children}
    </div>
  );
};

const ActionTile = ({
  label,
  primary,
  onClick,
}: {
  label: string;
  primary?: boolean;
  onClick?: () => void;
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-card p-4 text-left text-[15px] font-bold ${
        primary
          ? "bg-brand text-white"
          : "border border-outline-soft bg-white text-ink"
      }`}
    >
      {label}
    </button>
  );
};

export const AdminDashboardScreen = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto max-w-md md:max-w-2xl">
        <div className="flex justify-end px-5 pt-4">
          <StatusPill status="synced" />
        </div>

        <main className="space-y-4 px-5 pb-24 pt-2">
          {/* Heading */}
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[13px] text-ink-muted">Facility admin</div>
              <h1 className="text-[21px] font-extrabold tracking-[-0.02em]">
                Odo-Ona Elewe PHC
              </h1>
            </div>
            <Tag tone="amber">ADMIN</Tag>
          </div>

          {/* Facility code */}
          <div className="flex items-center justify-between rounded-[18px] bg-brand px-5 py-4 text-white">
            <div>
              <div className="text-xs text-brand-accent-soft">
                Your facility code
              </div>
              <div className="mt-0.5 font-mono text-[22px] font-semibold">
                OOE-PHC
              </div>
            </div>
            <span className="rounded-full bg-white/15 px-2.5 py-1.5 text-[11px]">
              Primary · Oyo
            </span>
          </div>

          {/* Setup checklist */}
          <div className="rounded-card border border-amber-border bg-amber-bg p-4">
            <div className="text-sm font-bold text-amber-text">
              Finish setting up your facility
            </div>
            <div className="mt-3 space-y-2">
              <ChecklistItem done>Facility registered</ChecklistItem>
              <ChecklistItem>Invite your staff</ChecklistItem>
              <ChecklistItem>Upload this week&rsquo;s roster</ChecklistItem>
            </div>
          </div>

          {/* Counts */}
          <div className="flex gap-6 px-1 py-1">
            <Stat value="3" label="Staff" />
            <Stat value="1" label="Pending invite" tone="amber" />
            <Stat value="2" label="On shift now" />
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <ActionTile
              label="＋ Invite staff"
              primary
              onClick={() => navigate("/admin/staff/invite")}
            />
            <ActionTile
              label="Manage staff"
              onClick={() => navigate("/admin/staff")}
            />
            <ActionTile label="Roster & shifts" />
            <ActionTile label="Units & rooms" />
          </div>
        </main>
      </div>
    </div>
  );
};
