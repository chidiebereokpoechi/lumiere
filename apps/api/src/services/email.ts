// Email sending via Nodemailer + Handlebars templates. Wired through the job
// queue (`send_email` handler) so requests never block on SMTP. When SMTP isn't
// configured we fall back to `jsonTransport` — messages are logged instead of
// sent, which keeps the rest of the system testable without real SMTP.

import nodemailer, { type Transporter } from 'nodemailer';
import Handlebars from 'handlebars';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../lib/config';
import { log } from '../lib/logger';

export type EmailTemplate = 'gallery_viewed' | 'download' | 'favorites_received';

const TEMPLATE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'emails');

interface CompiledTemplate {
  subject: HandlebarsTemplateDelegate;
  body: HandlebarsTemplateDelegate;
}
const compiled = new Map<EmailTemplate, CompiledTemplate>();

/**
 * Templates use a `Subject: ...\n\n<body>` header so the subject line is
 * Handlebars-rendered alongside the body. Splitting at the first blank line
 * is enough — Subject can't span multiple lines anyway per RFC.
 */
function loadTemplate(name: EmailTemplate): CompiledTemplate {
  const cached = compiled.get(name);
  if (cached) return cached;

  const path = join(TEMPLATE_DIR, `${name}.hbs`);
  const src = readFileSync(path, 'utf8');
  const sepIdx = src.indexOf('\n\n');
  if (sepIdx < 0) throw new Error(`template ${name} missing Subject/body separator`);
  const header = src.slice(0, sepIdx);
  const body = src.slice(sepIdx + 2);
  const subjectMatch = header.match(/^Subject:\s*(.+)$/m);
  if (!subjectMatch) throw new Error(`template ${name} missing Subject line`);
  const result: CompiledTemplate = {
    subject: Handlebars.compile(subjectMatch[1]!.trim()),
    body: Handlebars.compile(body),
  };
  compiled.set(name, result);
  return result;
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
    log.info('email transport: smtp', { host: env.SMTP_HOST, port: env.SMTP_PORT });
  } else {
    transporter = nodemailer.createTransport({ jsonTransport: true });
    log.warn('email transport: jsonTransport (SMTP unconfigured; emails will be logged, not sent)');
  }
  return transporter;
}

export async function renderEmail(
  template: EmailTemplate,
  data: Record<string, unknown>,
): Promise<{ subject: string; html: string }> {
  const tpl = loadTemplate(template);
  return { subject: tpl.subject(data), html: tpl.body(data) };
}

export async function sendEmail(
  template: EmailTemplate,
  to: string,
  data: Record<string, unknown>,
): Promise<{ messageId: string; subject: string }> {
  const { subject, html } = await renderEmail(template, data);
  const info = await getTransporter().sendMail({
    from: env.FROM_EMAIL,
    to,
    subject,
    html,
  });
  return { messageId: info.messageId, subject };
}
