export type TunnelRunMode = "foreground" | "background";

const isValidAppName = (value: string): boolean => /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value);
const isValidEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export interface TunnelPublishInput {
  zone: string;
  app: string;
  port: number | string;
  emails: string[] | string;
  runMode: TunnelRunMode;
}

export interface TunnelPublishPlan {
  zone: string;
  app: string;
  port: number;
  emails: string[];
  runMode: TunnelRunMode;
  hostname: string;
  publicUrl: string;
  localOrigin: string;
  commands: { setup: string; create: string; run: string; status: string };
}

export function validateTunnelPublishInput(input: TunnelPublishInput): string[] {
  const errors: string[] = [];
  const zone = input.zone.trim().toLowerCase().replace(/\.$/, "");
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(zone)) {
    errors.push("Enter a valid Cloudflare zone such as repoos.org.");
  }
  const app = input.app.trim().toLowerCase();
  if (!isValidAppName(app)) errors.push("App name must use letters, numbers, hyphens, or underscores.");
  const port = Number(input.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push("Local port must be an integer from 1 to 65535.");
  }
  const rawEmails = Array.isArray(input.emails) ? input.emails : input.emails.split(",");
  const emails = rawEmails.map((email) => email.trim()).filter(Boolean);
  if (!emails.length) errors.push("Add at least one allowed email address.");
  if (emails.some((email) => !isValidEmail(email))) errors.push("Every allowed email must be a valid email address.");
  if (input.runMode !== "foreground" && input.runMode !== "background") {
    errors.push("Choose foreground or background run mode.");
  }
  return errors;
}

export function buildTunnelPublishPlan(input: TunnelPublishInput): TunnelPublishPlan {
  const errors = validateTunnelPublishInput(input);
  if (errors.length) throw new Error(errors.join(" "));
  const zone = input.zone.trim().toLowerCase().replace(/\.$/, "");
  const app = input.app.trim().toLowerCase();
  const port = Number(input.port);
  const rawEmails = Array.isArray(input.emails) ? input.emails : input.emails.split(",");
  const emails = [...new Set(rawEmails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  const hostname = `${app}.${zone}`;
  const allow = emails.join(",");
  return {
    zone, app, port, emails, runMode: input.runMode, hostname,
    publicUrl: `https://${hostname}`,
    localOrigin: `http://localhost:${port}`,
    commands: {
      setup: "repoos tunnel setup",
      create: `repoos tunnel create ${app} --port ${port} --domain ${hostname} --allow ${allow}`,
      run: input.runMode === "background" ? "repoos tunnel install" : "repoos tunnel start",
      status: "repoos tunnel status",
    },
  };
}
