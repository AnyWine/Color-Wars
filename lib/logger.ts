type LogFields = Record<string, unknown>;

function shortAddress(address: unknown): string | undefined {
  if (typeof address !== "string") return undefined;
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function emit(level: "info" | "warn" | "error", event: string, fields?: LogFields) {
  const out: LogFields = { ts: new Date().toISOString(), level, event };
  if (fields) {
    for (const [k, v] of Object.entries(fields)) {
      if (k === "wallet" || k === "address" || k === "from" || k === "user") {
        out[k] = shortAddress(v) ?? v;
      } else {
        out[k] = v;
      }
    }
  }
  const line = JSON.stringify(out);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (event: string, fields?: LogFields) => emit("info", event, fields),
  warn: (event: string, fields?: LogFields) => emit("warn", event, fields),
  error: (event: string, fields?: LogFields) => emit("error", event, fields),
};
