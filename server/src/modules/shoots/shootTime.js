/**
 * Shoot dates and times are agency-local (India). The production server runs in UTC, so "now" and
 * "when does this shoot start" are always worked out in IST, never from the server's own clock zone.
 */
export const TZ = 'Asia/Kolkata';
const IST_OFFSET = '+05:30';

/** Current IST date and time: { date: 'YYYY-MM-DD', time: 'HH:MM', hour } */
export function istNow(d = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  );
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, hour: Number(p.hour), day: Number(p.day) };
}

/** The real instant a shoot starts, from its IST date ('YYYY-MM-DD') and time ('HH:MM'). */
export const istInstant = (ymd, hm) => new Date(`${ymd}T${hm}:00${IST_OFFSET}`);

/** Hours from `now` until an IST date/time (negative once it has passed). */
export const hoursUntil = (ymd, hm, now = new Date()) => (istInstant(ymd, hm).getTime() - now.getTime()) / 3600000;
