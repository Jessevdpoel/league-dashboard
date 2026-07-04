'use client';

export default function ProfileError({ error: _error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="text-frost-100 p-8">
      <p>Something went wrong loading this profile.</p>
      <button
        onClick={reset}
        className="mt-2 rounded-lg bg-gradient-to-br from-cyan-400 to-indigo-500 text-ink-950 font-bold px-3 py-2"
      >
        Try again
      </button>
    </div>
  );
}
