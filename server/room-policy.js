import { createHash, timingSafeEqual } from 'node:crypto';

/** Server-only configuration. Never serialize the key to the client. */
export function roomPolicy(env = process.env) {
  const mode = (env.SP_ROOM_CREATION || 'public').trim().toLowerCase();
  if (!['public', 'owner', 'disabled'].includes(mode)) {
    throw new Error('SP_ROOM_CREATION must be public, owner, or disabled');
  }
  const key = env.SP_OWNER_KEY || '';
  if (mode === 'owner' && (key.length < 32 || key.length > 256 || !key.trim())) {
    throw new Error('SP_OWNER_KEY must contain 32–256 characters in owner mode');
  }
  const digest = (value) => createHash('sha256').update(value).digest();
  const expected = digest(key);
  return Object.freeze({
    mode,
    allows(candidate) {
      if (mode === 'public') return true;
      return mode === 'owner' && typeof candidate === 'string' && candidate.length <= 256
        && timingSafeEqual(expected, digest(candidate));
    },
  });
}
