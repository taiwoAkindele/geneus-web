import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, TextField } from "@/ui";

export const MagicLinkScreen = () => {
  const navigate = useNavigate();
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [contact, setContact] = useState("");

  const sendLink = () => {
    navigate("/onboarding/link-sent", { state: { method, contact } });
  };

  return (
    <div className="flex min-h-screen flex-col bg-brand px-7 pb-8 pt-12 text-white sm:min-h-0">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        {/* Logo — mint square with a green plus */}
        <div className="relative mb-7 h-14 w-14 flex-none rounded-2xl bg-brand-accent-soft">
          <div className="absolute left-1/2 top-1/2 h-[7px] w-6 -translate-x-1/2 -translate-y-1/2 rounded bg-brand" />
          <div className="absolute left-1/2 top-1/2 h-6 w-[7px] -translate-x-1/2 -translate-y-1/2 rounded bg-brand" />
        </div>

        <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.02em]">
          Set up your facility
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-brand-on-dark">
          Enter an email or phone number. We&rsquo;ll send a secure link to
          begin — no password to remember.
        </p>

        <form
          className="mt-8 rounded-[22px] bg-white p-5 text-ink"
          onSubmit={(e) => {
            e.preventDefault();
            sendLink();
          }}
        >
          <div className="mb-4 flex gap-1 rounded-xl bg-surface-container p-1">
            {(["email", "phone"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={`min-h-0 flex-1 rounded-lg py-2.5 text-sm font-bold capitalize ${
                  method === m
                    ? "bg-white text-brand shadow-card"
                    : "text-ink-muted"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <TextField
            label={method === "email" ? "Work email" : "Phone number"}
            type={method === "email" ? "email" : "tel"}
            inputMode={method === "email" ? "email" : "tel"}
            placeholder={
              method === "email" ? "admin@odoona-phc.ng" : "0803 555 0147"
            }
            name="magic_contact"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
          />
          <div className="mt-4">
            <Button type="submit" variant="primary">
              Send magic link
            </Button>
          </div>
        </form>

        <div className="mt-auto pt-8 text-center text-sm text-brand-on-dark">
          Already set up? <b className="font-bold text-white">Sign in</b>
        </div>
      </div>
    </div>
  );
}
