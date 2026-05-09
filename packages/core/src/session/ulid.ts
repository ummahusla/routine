import { randomBytes } from "node:crypto";

const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ENCODING_LEN = ENCODING.length;
const TIME_LEN = 10;
const RANDOM_LEN = 16;

export const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function encodeTime(now: number, len: number): string {
  let mod;
  let str = "";
  for (let i = len - 1; i >= 0; i--) {
    mod = now % ENCODING_LEN;
    str = ENCODING[mod]! + str;
    now = (now - mod) / ENCODING_LEN;
  }
  return str;
}

function encodeRandom(len: number): string {
  const bytes = randomBytes(len);
  let str = "";
  for (let i = 0; i < len; i++) {
    str += ENCODING[bytes[i]! % ENCODING_LEN];
  }
  return str;
}

let lastTime = -1;
let lastRandom = "";

export function ulid(now: number = Date.now()): string {
  if (now === lastTime) {
    // monotonic increment of last random part — increments by treating the
    // last char's index as a counter; collision-safe enough for our use.
    const incremented = bumpRandom(lastRandom);
    lastRandom = incremented;
    return encodeTime(now, TIME_LEN) + incremented;
  }
  lastTime = now;
  lastRandom = encodeRandom(RANDOM_LEN);
  return encodeTime(now, TIME_LEN) + lastRandom;
}

function bumpRandom(s: string): string {
  const chars = s.split("");
  for (let i = chars.length - 1; i >= 0; i--) {
    const idx = ENCODING.indexOf(chars[i]!);
    if (idx < ENCODING_LEN - 1) {
      chars[i] = ENCODING[idx + 1]!;
      return chars.join("");
    }
    chars[i] = ENCODING[0]!;
  }
  return chars.join("");
}
