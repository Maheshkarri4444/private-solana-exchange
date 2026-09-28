import Link from "next/link";

export default function CreateOrderBookPage() {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <p className="text-5xl">📖</p>
      <h1 className="mt-4 text-3xl font-semibold">Private order books</h1>
      <p className="mt-3 text-muted">
        Limit orders whose price, size and side stay encrypted until they match. Coming in the next
        step.
      </p>
      <Link href="/" className="mt-8 inline-block text-accent hover:underline">
        ← Back to pools
      </Link>
    </div>
  );
}
