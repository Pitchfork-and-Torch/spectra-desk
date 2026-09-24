import { useState } from "react";
import type { SubjectForm } from "../App";

const EMPTY: SubjectForm = {
  firstName: "",
  lastName: "",
  middleName: "",
  email: "",
  phone: "",
  username: "",
  address: "",
  city: "",
  state: "",
  country: "",
  employer: "",
  notes: "",
  mode: "fast",
};

const COMMON_FIRST = /^(john|james|michael|david|robert|william|jon|chris|matt)$/i;
const COMMON_LAST = /^(smith|johnson|williams|brown|jones|miller|davis|bailey)$/i;

interface Props {
  onSubmit: (data: SubjectForm) => void;
  disabled?: boolean;
}

function Field({ label, name, value, onChange, type = "text", placeholder }: {
  label: string;
  name: keyof SubjectForm;
  value: string;
  onChange: (n: keyof SubjectForm, v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500 uppercase tracking-wider">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(name, e.target.value)}
        className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/30 transition"
      />
    </label>
  );
}

export default function IntakeForm({ onSubmit, disabled }: Props) {
  const [form, setForm] = useState<SubjectForm>(EMPTY);
  const [expanded, setExpanded] = useState(false);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [planText, setPlanText] = useState("");

  const set = (name: keyof SubjectForm, value: string) => setForm((f) => ({ ...f, [name]: value }));

  const canSubmit = form.firstName.trim() || form.lastName.trim() || form.email.trim() || form.username.trim();
  const isCommonName =
    form.firstName && form.lastName && (COMMON_FIRST.test(form.firstName) || COMMON_LAST.test(form.lastName));
  const anchorCount = [form.username, form.email, form.employer].filter((v) => v.trim()).length;
  const needsAnchors = isCommonName && anchorCount < 2;

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (canSubmit) onSubmit(form); }}
      className="glow rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-xl p-6 space-y-4"
    >
      <h3 className="font-semibold text-lg flex items-center gap-2">
        <span className="text-cyan-400">◆</span> Subject Intake
      </h3>

      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" name="firstName" value={form.firstName} onChange={set} placeholder="Jane" />
        <Field label="Last name" name="lastName" value={form.lastName} onChange={set} placeholder="Doe" />
      </div>

      <Field label="Email" name="email" type="email" value={form.email} onChange={set} placeholder="jane@example.com" />

      {needsAnchors && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-400/30 text-amber-200 text-xs">
          Common name detected - add <strong>username</strong> plus <strong>email or domain/employer</strong> for reliable attribution.
        </div>
      )}

      <Field label="Username" name="username" value={form.username} onChange={set} placeholder="janedoe" />
      <Field label="Employer / domain" name="employer" value={form.employer} onChange={set} placeholder="example.com" />

      <label className="block">
        <span className="text-xs text-slate-500 uppercase tracking-wider">Search depth</span>
        <select
          value={form.mode}
          onChange={(e) => set("mode", e.target.value)}
          className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-400/50"
        >
          <option value="fast">Fast - capped at 12 (default)</option>
          <option value="full">Full - capped at 28</option>
          <option value="custom">Custom - families you leave on</option>
          <option value="validation">Quick - 8 queries (smoke)</option>
        </select>
        <p className="text-[10px] text-slate-600 mt-1">Fast is the default. Show the plan before you spend it.</p>
        <button
          type="button"
          className="mt-2 text-xs px-3 py-1.5 rounded-lg border border-cyan-400/30 text-cyan-200"
          onClick={() => {
            void fetch("/api/query-plan", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(form),
            })
              .then((res) => res.json())
              .then((plan: { count?: number; cap?: number; mode?: string; willAsk?: string[]; willNot?: string[] }) => {
                setPlanText(`${plan.mode || form.mode}: ${plan.count ?? 0} of ${plan.cap ?? "?"} queries. ${(plan.willAsk || []).join(" ")} ${(plan.willNot || []).slice(0, 3).join("; ")}`);
              })
              .catch(() => setPlanText("Query plan unavailable."));
          }}
        >
          Show query plan
        </button>
        {planText && <p className="text-[11px] text-slate-400 mt-2">{planText}</p>}
      </label>

      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-violet-400 hover:text-violet-300"
      >
        {expanded ? "Less fields" : "More fields (phone, address, notes)"}
      </button>

      {expanded && (
        <div className="space-y-3 pt-2 border-t border-white/5">
          <Field label="Middle name" name="middleName" value={form.middleName} onChange={set} />
          <Field label="Phone" name="phone" value={form.phone} onChange={set} />
          <Field label="Street address" name="address" value={form.address} onChange={set} />
          <div className="grid grid-cols-3 gap-2">
            <Field label="City" name="city" value={form.city} onChange={set} />
            <Field label="State" name="state" value={form.state} onChange={set} />
            <Field label="Country" name="country" value={form.country} onChange={set} />
          </div>
          <label className="block">
            <span className="text-xs text-slate-500 uppercase tracking-wider">Notes</span>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-400/50"
              placeholder="Known aliases, context, disambiguation hints..."
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500 uppercase tracking-wider">Reference photo (optional)</span>
            <p className="text-[10px] text-slate-600 mb-1">Upload a known photo for visual matching - stored locally in case file only.</p>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) {
                  setReferencePreview(null);
                  setForm((f) => ({ ...f, referencePhoto: undefined }));
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                  const data = String(reader.result || "");
                  setReferencePreview(data);
                  setForm((f) => ({ ...f, referencePhoto: data }));
                };
                reader.readAsDataURL(file);
              }}
              className="mt-1 w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-violet-500/20 file:text-violet-200"
            />
            {referencePreview && (
              <img src={referencePreview} alt="Reference preview" className="mt-2 w-20 h-20 rounded-lg object-cover border border-violet-400/30" />
            )}
          </label>
        </div>
      )}

      <button
        type="submit"
        disabled={disabled || !canSubmit}
        className="w-full py-3 rounded-xl font-semibold text-black bg-gradient-to-r from-cyan-400 to-violet-500 hover:from-cyan-300 hover:to-violet-400 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-lg shadow-cyan-500/20"
      >
        {disabled ? "Investigating..." : "⚡ Generate OSINT Report"}
      </button>

      <p className="text-[10px] text-slate-600 text-center">
        Public index search only · Evidence archived with SHA-256 hashes
      </p>
    </form>
  );
}