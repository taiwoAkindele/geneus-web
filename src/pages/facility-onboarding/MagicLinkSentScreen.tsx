import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/ui";

type LinkState = { method?: "email" | "phone"; contact?: string };

export const MagicLinkSentScreen = () => {
  const navigate = useNavigate();
  const { state } = useLocation() as { state: LinkState | null };
  const method = state?.method ?? "email";
  const isEmail = method === "email";
  const contact = state?.contact?.trim();
  const target = contact || (isEmail ? "your email" : "your phone");

  return (
    <div className="flex min-h-screen flex-col bg-brand px-7 pb-8 pt-12 text-white sm:min-h-0">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        {/* Logo — mint square with a green plus */}
        <div className="relative mb-7 h-14 w-14 flex-none rounded-2xl bg-brand-accent-soft">
          <div className="absolute left-1/2 top-1/2 h-[7px] w-6 -translate-x-1/2 -translate-y-1/2 rounded bg-brand" />
          <div className="absolute left-1/2 top-1/2 h-6 w-[7px] -translate-x-1/2 -translate-y-1/2 rounded bg-brand" />
        </div>

        <div className="rounded-[22px] bg-white p-6 text-ink">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-tint text-2xl font-extrabold text-brand">
            ✓
          </div>
          <h1 className="mt-5 text-2xl font-extrabold tracking-[-0.02em]">
            {isEmail ? "Check your email" : "Check your phone"}
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            We sent a secure link {isEmail ? "to" : "by SMS to"}{" "}
            <b className="text-ink">{target}</b>. Open it on this device to
            continue setting up your facility.
          </p>
          <p className="mt-3 text-[13px] text-ink-muted">
            The link expires in 15 minutes.
          </p>

          <div className="mt-6">
            <Button
              variant="outlined"
              onClick={() => navigate("/onboarding/start")}
            >
              Resend link
            </Button>
          </div>
        </div>

        <div className="mt-auto pt-8 text-center text-sm text-brand-on-dark">
          Entered the wrong {isEmail ? "address" : "number"}?{" "}
          <button
            type="button"
            onClick={() => navigate("/onboarding/start")}
            className="min-h-0 font-bold text-white underline"
          >
            Start over
          </button>
        </div>
      </div>
    </div>
  );
};
