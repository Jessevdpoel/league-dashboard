'use server';

import { revalidatePath } from 'next/cache';

/** Profile paths look like /euw1/name-tag — one region segment, one riot-id segment. */
const PROFILE_PATH = /^\/[a-z0-9]+\/[^/]+$/;

/**
 * Busts the Data Cache for a profile page so its Riot fetches (league,
 * summoner, match ids) re-run on the next render. `router.refresh()` alone
 * cannot do this — it re-renders but still reads cached fetch responses.
 * The path comes from the client, so validate its shape before revalidating.
 */
export async function refreshProfile(path: string): Promise<void> {
  if (!PROFILE_PATH.test(path)) return;
  revalidatePath(path);
}
