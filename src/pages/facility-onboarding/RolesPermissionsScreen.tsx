import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, Avatar, Button, Card, StatusPill, ToggleSwitch } from "@/ui";

type Permission = { key: string; label: string; locked?: boolean };

const PERMISSIONS: Permission[] = [
  { key: "view", label: "View patient records" },
  { key: "edit", label: "Create & edit records" },
  { key: "refer", label: "Refer to other facilities" },
  // Reserved for admin / records roles — shown but not toggleable here.
  { key: "stock", label: "Manage medicine stock", locked: true },
  { key: "staff", label: "Invite / manage staff", locked: true },
];

export const RolesPermissionsScreen = () => {
  const navigate = useNavigate();
  const [granted, setGranted] = useState<Record<string, boolean>>({
    view: true,
    edit: true,
    refer: true,
    stock: false,
    staff: false,
  });

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <AppBar
        title="Amaka's access"
        onBack={() => navigate(-1)}
        right={<StatusPill status="synced" />}
      />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col md:max-w-lg">
        <div className="flex-1 space-y-4 px-5 py-3">
          {/* Person */}
          <Card className="flex items-center gap-3">
            <Avatar tone="green">AO</Avatar>
            <div>
              <div className="text-base font-bold">Amaka Okoro</div>
              <div className="text-[13px] text-ink-muted">
                CHEW · Read &amp; write
              </div>
            </div>
          </Card>

          <div className="text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">
            What she can do
          </div>

          <Card padded={false} className="divide-y divide-outline-soft">
            {PERMISSIONS.map((p) => (
              <div
                key={p.key}
                className="flex items-center justify-between px-4 py-3.5"
              >
                <span
                  className={`text-[15px] font-semibold ${p.locked ? "text-ink-muted" : "text-ink"}`}
                >
                  {p.label}
                </span>
                <ToggleSwitch
                  checked={granted[p.key]}
                  disabled={p.locked}
                  ariaLabel={p.label}
                  onChange={(v) => setGranted((g) => ({ ...g, [p.key]: v }))}
                />
              </div>
            ))}
          </Card>

          <p className="text-xs leading-relaxed text-ink-muted">
            Staff-management &amp; stock toggles are reserved for the admin and
            records roles.
          </p>
        </div>

        <footer className="px-5 pb-6 pt-4">
          <Button variant="primary" onClick={() => navigate(-1)}>
            Save permissions
          </Button>
        </footer>
      </div>
    </div>
  );
};
