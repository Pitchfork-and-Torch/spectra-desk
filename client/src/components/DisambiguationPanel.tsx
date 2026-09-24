import { useState } from "react";

interface Question {
  id: string;
  type: string;
  question: string;
  required: boolean;
  options?: Array<{ id: string; label: string; value: string }>;
  hint?: string;
}

interface Props {
  reportId: string;
  questions: Question[];
  score: number;
  homonymRisk: string;
  onRefined: (report: unknown) => void;
  onSkip: () => void;
}

export default function DisambiguationPanel({ reportId, questions, score, homonymRisk, onRefined, onSkip }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [extraEmployer, setExtraEmployer] = useState("");
  const [extraCity, setExtraCity] = useState("");

  if (!questions.length) return null;

  async function submit() {
    setLoading(true);
    const payload = {
      answers: Object.entries(answers).map(([questionId, value]) => ({
        questionId,
        value,
        selectedOptionId: value,
      })),
      extraFields: {
        ...(extraEmployer ? { employer: extraEmployer } : {}),
        ...(extraCity ? { city: extraCity } : {}),
      },
    };
    const res = await fetch(`/api/reports/${reportId}/refine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) onRefined(await res.json());
    setLoading(false);
  }

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 backdrop-blur-xl p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-amber-200 flex items-center gap-2">
            <span>◎</span> Disambiguation Assist
            <span className="text-xs font-normal text-slate-500">(optional)</span>
          </h3>
          <p className="text-sm text-slate-400 mt-1">
            Score <span className="text-amber-300 font-mono">{score}</span>/100 · Homonym risk:{" "}
            <span className="capitalize">{homonymRisk}</span>
          </p>
        </div>
        <button onClick={onSkip} className="text-xs text-slate-500 hover:text-slate-300 shrink-0">
          Skip →
        </button>
      </div>

      {questions.map((q) => (
        <div key={q.id} className="space-y-2">
          <p className="text-sm text-slate-200">{q.question}</p>
          {q.hint && <p className="text-xs text-slate-500">{q.hint}</p>}
          {q.options ? (
            <div className="flex flex-wrap gap-2">
              {q.options.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setAnswers((a) => ({ ...a, [q.id]: opt.value }))}
                  className={`text-xs px-3 py-2 rounded-lg border transition ${
                    answers[q.id] === opt.value
                      ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-200"
                      : "border-white/10 hover:border-white/20 text-slate-400"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ))}

      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
        <input
          placeholder="Add employer (optional)"
          value={extraEmployer}
          onChange={(e) => setExtraEmployer(e.target.value)}
          className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs"
        />
        <input
          placeholder="Add city (optional)"
          value={extraCity}
          onChange={(e) => setExtraCity(e.target.value)}
          className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs"
        />
      </div>

      <button
        onClick={submit}
        disabled={loading}
        className="w-full py-2.5 rounded-xl text-sm font-medium bg-amber-500/20 border border-amber-500/40 text-amber-200 hover:bg-amber-500/30 disabled:opacity-50"
      >
        {loading ? "Refining report..." : "Apply answers & refine report"}
      </button>
    </div>
  );
}