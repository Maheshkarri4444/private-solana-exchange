import Link from "next/link";

const steps = [
  {
    title: "Sign once",
    text: "Your wallet signs a message. Your browser turns it into your private encryption key.",
  },
  {
    title: "Encrypted balances",
    text: "Every token balance is stored on-chain encrypted. Only you can read yours.",
  },
  {
    title: "Computed by Arcium",
    text: "Arcium's MPC network updates balances without ever seeing the numbers.",
  },
];

export default function Home() {
  return (
    <div className="py-12">
      <p className="mb-4 text-sm font-medium text-accent">Solana devnet · Arcium MPC</p>
      <h1 className="max-w-2xl text-5xl font-semibold leading-tight tracking-tight">
        Trade without showing your balance.
      </h1>
      <p className="mt-5 max-w-xl text-lg text-muted">
        A private exchange on Solana. Token supplies are public. What you hold and trade is not.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/profile"
          className="inline-flex h-11 items-center rounded-xl bg-accent px-5 text-sm font-medium text-white hover:bg-accent-strong"
        >
          Open your profile
        </Link>
        <Link
          href="/profile/creator"
          className="inline-flex h-11 items-center rounded-xl border border-line px-5 text-sm font-medium hover:bg-white/5"
        >
          Creator page
        </Link>
      </div>

      <div className="mt-16 grid gap-4 md:grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.title} className="rounded-2xl border border-line bg-card p-6">
            <p className="font-mono text-xs text-muted">0{i + 1}</p>
            <h3 className="mt-2 font-semibold">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
