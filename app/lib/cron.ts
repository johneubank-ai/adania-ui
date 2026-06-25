// Minimal standard 5-field cron, evaluated in the machine's LOCAL timezone (so "every day at 9am" means
// 9am where the member is). No npm dependency — the UI builder only emits a constrained subset, and this
// matcher/describer/preview is hand-written to keep the deno-desktop bundle clean.
//
// Fields:  minute(0-59)  hour(0-23)  day-of-month(1-31)  month(1-12)  day-of-week(0-7, 0/7=Sun)
// Per field we support: *  a  a,b,c  a-b  */n  a-b/n  a/n. Day-of-month/day-of-week use the standard OR
// semantics when BOTH are restricted (i.e. either may match).

const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Compiled = {
  minute: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  month: Set<number>;
  dow: Set<number>;
  domStar: boolean;
  dowStar: boolean;
} | null;

function parseField(field: string, min: number, max: number): Set<number> {
  const out = new Set<number>();
  for (const partRaw of field.split(",")) {
    const part = partRaw.trim();
    if (!part) continue;
    let lo = min;
    let hi = max;
    let step = 1;
    const [rangePart, stepPart] = part.split("/");
    if (stepPart !== undefined) {
      step = Number(stepPart);
      if (!Number.isInteger(step) || step <= 0) return new Set(); // invalid → no matches
    }
    if (rangePart !== "*" && rangePart !== undefined) {
      const [a, b] = rangePart.split("-");
      lo = Number(a);
      hi = b !== undefined ? Number(b) : stepPart !== undefined ? max : Number(a); // "a/n" → a..max
      if (!Number.isInteger(lo) || !Number.isInteger(hi)) return new Set();
    }
    if (lo < min || hi > max || lo > hi) return new Set();
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

export function compileCron(expr: string): Compiled {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const [mi, ho, dm, mo, dw] = fields;
  const minute = parseField(mi, 0, 59);
  const hour = parseField(ho, 0, 23);
  const dom = parseField(dm, 1, 31);
  const month = parseField(mo, 1, 12);
  const dow = parseField(dw, 0, 7);
  if (dow.has(7)) dow.add(0); // normalize 7 → Sunday
  if (!minute.size || !hour.size || !dom.size || !month.size || !dow.size) return null;
  return { minute, hour, dom, month, dow, domStar: dm === "*", dowStar: dw === "*" };
}

function matchesCompiled(c: NonNullable<Compiled>, d: Date): boolean {
  if (!c.minute.has(d.getMinutes())) return false;
  if (!c.hour.has(d.getHours())) return false;
  if (!c.month.has(d.getMonth() + 1)) return false;
  const domHit = c.dom.has(d.getDate());
  const dowHit = c.dow.has(d.getDay());
  // Standard cron: if both dom and dow are restricted, match when EITHER matches.
  if (c.domStar && c.dowStar) return true;
  if (!c.domStar && !c.dowStar) return domHit || dowHit;
  return c.domStar ? dowHit : domHit;
}

export function cronMatches(expr: string, date: Date): boolean {
  const c = compileCron(expr);
  return c ? matchesCompiled(c, date) : false;
}

export function isValidCron(expr: string): boolean {
  return compileCron(expr) !== null;
}

// First fire strictly after `from`, scanning minute-by-minute up to ~366 days. Null if none / invalid.
export function nextRun(expr: string, from: Date = new Date()): Date | null {
  const c = compileCron(expr);
  if (!c) return null;
  const d = new Date(from.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  const limit = 366 * 24 * 60;
  for (let i = 0; i < limit; i++) {
    if (matchesCompiled(c, d)) return new Date(d.getTime());
    d.setMinutes(d.getMinutes() + 1);
  }
  return null;
}

// Local "YYYY-MM-DDTHH:mm" — the per-minute key used as the scheduler's duplicate-fire guard.
export function minuteKey(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function formatTime(h: number, m: number): string {
  const ampm = h < 12 ? "AM" : "PM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${ampm}`;
}

function describeDays(set: number[]): string {
  const s = [...set].sort((a, b) => a - b);
  if (s.length === 7) return "every day";
  if (s.length === 5 && s.every((d) => d >= 1 && d <= 5)) return "weekdays";
  if (s.length === 2 && s.includes(0) && s.includes(6)) return "weekends";
  return s.map((d) => DOW_NAMES[d % 7]).join(", ");
}

// Human-readable summary. Recognizes the shapes the builder emits; falls back to the raw expression.
export function describeCron(expr: string): string {
  const c = compileCron(expr);
  if (!c) return `Invalid: ${expr}`;
  const fields = expr.trim().split(/\s+/);
  const [mi, ho, dm, , dw] = fields;

  // Every minute / every N minutes
  if (ho === "*" && dm === "*" && dw === "*") {
    if (mi === "*") return "Every minute";
    const m = /^\*\/(\d+)$/.exec(mi);
    if (m) return `Every ${m[1]} minutes`;
  }
  const oneMinute = c.minute.size === 1;
  const oneHour = c.hour.size === 1;
  const minVal = [...c.minute][0];
  const hourVal = [...c.hour][0];

  // Hourly at :MM
  if (oneMinute && ho === "*" && dm === "*" && dw === "*") {
    return `Every hour at :${String(minVal).padStart(2, "0")}`;
  }
  if (oneMinute && oneHour) {
    const at = formatTime(hourVal, minVal);
    // Weekly (dow restricted)
    if (dm === "*" && dw !== "*") return `On ${describeDays([...c.dow])} at ${at}`;
    // Monthly (dom restricted)
    if (dm !== "*" && dw === "*" && c.dom.size === 1) return `Monthly on day ${[...c.dom][0]} at ${at}`;
    // Daily
    if (dm === "*" && dw === "*") return `Every day at ${at}`;
  }
  return expr; // custom / unrecognized → show the raw cron
}

// ---- friendly builder → cron ----

export type CronForm =
  | { freq: "minutes"; every: number }
  | { freq: "hourly"; minute: number }
  | { freq: "daily"; hour: number; minute: number }
  | { freq: "weekly"; days: number[]; hour: number; minute: number }
  | { freq: "monthly"; day: number; hour: number; minute: number }
  | { freq: "custom"; cron: string };

// Best-effort inverse of buildCron — recognize the shapes the builder emits so editing prefills the right
// controls; anything else opens as a raw "custom" expression.
export function cronToForm(expr: string): CronForm {
  const c = compileCron(expr);
  const fields = expr.trim().split(/\s+/);
  if (c && fields.length === 5) {
    const [mi, ho, dm, mo, dw] = fields;
    if (mo === "*") {
      if (ho === "*" && dm === "*" && dw === "*") {
        if (mi === "*") return { freq: "minutes", every: 1 };
        const m = /^\*\/(\d+)$/.exec(mi);
        if (m) return { freq: "minutes", every: Number(m[1]) };
      }
      const oneMin = c.minute.size === 1;
      const oneHour = c.hour.size === 1;
      const minute = [...c.minute][0];
      const hour = [...c.hour][0];
      if (oneMin && ho === "*" && dm === "*" && dw === "*") return { freq: "hourly", minute };
      if (oneMin && oneHour && dm === "*" && dw === "*") return { freq: "daily", hour, minute };
      if (oneMin && oneHour && dm === "*" && dw !== "*") {
        return { freq: "weekly", days: [...c.dow].filter((d) => d < 7), hour, minute };
      }
      if (oneMin && oneHour && dm !== "*" && dw === "*" && c.dom.size === 1) {
        return { freq: "monthly", day: [...c.dom][0], hour, minute };
      }
    }
  }
  return { freq: "custom", cron: expr };
}

export function buildCron(form: CronForm): string {
  switch (form.freq) {
    case "minutes": {
      const n = Math.max(1, Math.floor(form.every));
      return n === 1 ? "* * * * *" : `*/${n} * * * *`;
    }
    case "hourly":
      return `${form.minute} * * * *`;
    case "daily":
      return `${form.minute} ${form.hour} * * *`;
    case "weekly": {
      const days = [...new Set(form.days)].sort((a, b) => a - b);
      return `${form.minute} ${form.hour} * * ${days.length ? days.join(",") : "*"}`;
    }
    case "monthly":
      return `${form.minute} ${form.hour} ${form.day} * *`;
    case "custom":
      return form.cron.trim();
  }
}
