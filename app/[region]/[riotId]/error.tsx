'use client';

export default function ProfileError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="text-gold-100">
      <p>Something went wrong loading this profile.</p>
      <button onClick={reset} className="mt-2 rounded bg-gold-500 text-charcoal-900 px-3 py-2">
        Try again
      </button>
    </div>
  );
}
