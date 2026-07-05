import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, SegmentedControl, Tag, TextField } from "@/ui";

type Level = "primary" | "secondary" | "tertiary";

export const RegisterFacilityScreen = () => {
  const navigate = useNavigate();
  const [level, setLevel] = useState<Level>("primary");

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col md:max-w-lg">
        <header className="px-5 pb-3 pt-5">
          <h1 className="text-[22px] font-extrabold tracking-[-0.02em]">
            Register your facility
          </h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            This creates your facility code &amp; admin account.
          </p>
        </header>

        <div className="flex-1 space-y-4 px-5 py-2">
          <TextField
            label="Facility name"
            placeholder="e.g. Odo-Ona Elewe PHC"
            name="facility_name"
          />
          <TextField
            label="Location (State / LGA)"
            placeholder="e.g. Oyo · Ibadan SW"
            name="facility_location"
          />
          <TextField
            label="Community"
            placeholder="e.g. Odo-Ona Elewe"
            name="facility_community"
          />

          <div>
            <div className="mb-2 text-[13px] font-semibold text-ink-soft">
              Level of care
            </div>
            <SegmentedControl
              ariaLabel="Level of care"
              value={level}
              onChange={setLevel}
              options={[
                { value: "primary", label: "Primary" },
                { value: "secondary", label: "Secondary" },
                { value: "tertiary", label: "Tertiary" },
              ]}
            />
          </div>

          {/* Genuinely pre-filled from the magic link — read-only, not an input. */}
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-ink-soft">
              Email{" "}
              <span className="font-normal text-ink-muted">
                — one of email / phone required
              </span>
            </label>
            <div className="flex items-center justify-between rounded-field border-[1.5px] border-outline bg-surface-muted px-4 py-3.5 text-base">
              <span>admin@odoona-phc.ng</span>
              <Tag tone="green" className="font-mono lowercase">
                from link
              </Tag>
            </div>
          </div>
        </div>

        <footer className="border-t border-outline-soft bg-surface px-5 pb-6 pt-4">
          <Button variant="primary" onClick={() => navigate("/admin")}>
            Create facility
          </Button>
        </footer>
      </div>
    </div>
  );
};
