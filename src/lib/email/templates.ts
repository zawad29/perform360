const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// ─── Helpers ───

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function emailWrapper(subtitle: string, bodyContent: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #F5F5F5; font-family: 'Helvetica Neue', 'Arial Narrow', Arial, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding: 48px 24px;">
        <tr>
          <td align="center">
            <table width="520" cellpadding="0" cellspacing="0" style="background: #FFFFFF; border: 1px solid #111111; padding: 0;">
              <!-- Accent rule -->
              <tr>
                <td style="background: #E63946; height: 3px; font-size: 0; line-height: 0;">&nbsp;</td>
              </tr>
              <!-- Header -->
              <tr>
                <td style="padding: 32px 40px 0 40px; border-bottom: 1px solid #DDDDDD;">
                  <h1 style="margin: 0 0 4px; font-size: 14px; font-weight: 700; color: #111111; font-family: 'Helvetica Neue', 'Arial Narrow', Arial, sans-serif; text-transform: uppercase; letter-spacing: 0.15em;">Performs360</h1>
                  <p style="margin: 0 0 24px; font-size: 12px; font-weight: 400; color: #888888; font-family: 'Helvetica Neue', 'Arial Narrow', Arial, sans-serif; text-transform: uppercase; letter-spacing: 0.05em;">${subtitle}</p>
                </td>
              </tr>
              <!-- Body -->
              <tr>
                <td style="padding: 32px 40px 40px 40px;">
                  ${bodyContent}
                </td>
              </tr>
            </table>
            <!-- Footer -->
            <table width="520" cellpadding="0" cellspacing="0" style="padding: 24px 0 0 0;">
              <tr>
                <td style="border-top: 1px solid #DDDDDD; padding-top: 16px; text-align: center;">
                  <a href="${APP_URL}" style="display: inline-block; text-decoration: none;">
                    <img src="${APP_URL}/logo.png" alt="Performs360" width="120" height="auto" style="display: block; margin: 0 auto 12px;" />
                  </a>
                  <p style="margin: 0; font-size: 11px; color: #888888; font-family: 'Helvetica Neue', 'Arial Narrow', Arial, sans-serif; text-transform: uppercase; letter-spacing: 0.05em;">Performs360 &mdash; 360&deg; Performance Evaluation</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

function ctaButton(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="display: inline-block; background: #E63946; color: #FFFFFF; text-decoration: none; padding: 14px 32px; font-size: 12px; font-weight: 700; font-family: 'Helvetica Neue', 'Arial Narrow', Arial, sans-serif; text-transform: uppercase; letter-spacing: 0.15em; border: none;">${escapeHtml(label)}</a>`;
}

// ─── Magic Link Login ───

export function getMagicLinkEmail(url: string): { html: string; text: string } {
  const html = emailWrapper(
    "Sign In",
    `
    <p style="margin: 0 0 16px; font-size: 16px; color: #111111; line-height: 1.7; font-family: Georgia, 'Times New Roman', serif;">Hi,</p>
    <p style="margin: 0 0 24px; font-size: 16px; color: #555555; line-height: 1.7; font-family: Georgia, 'Times New Roman', serif;">Click the button below to sign in to your Performs360 account. This link expires in 24 hours.</p>
    ${ctaButton(url, "Sign In to Performs360")}
    <p style="margin: 24px 0 4px; font-size: 12px; color: #888888; line-height: 1.5; font-family: 'Helvetica Neue', 'Arial Narrow', Arial, sans-serif;">If you didn't request this email, you can safely ignore it.</p>
    <p style="margin: 0; font-size: 12px; color: #888888; line-height: 1.5; font-family: 'Helvetica Neue', 'Arial Narrow', Arial, sans-serif; word-break: break-all;">Or copy this link: ${escapeHtml(url)}</p>
    `
  );

  const text = `Sign in to Performs360\n\nClick the link below to sign in:\n${url}\n\nThis link expires in 24 hours.\n\nIf you didn't request this email, you can safely ignore it.`;

  return { html, text };
}

// ─── OTP Verification ───

export function getOTPEmail(otp: string, recipientName: string): { html: string; text: string } {
  const html = emailWrapper(
    "Verification Code",
    `
    <p style="margin: 0 0 16px; font-size: 16px; color: #111111; line-height: 1.7; font-family: Georgia, 'Times New Roman', serif;">Hi ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 24px; font-size: 16px; color: #555555; line-height: 1.7; font-family: Georgia, 'Times New Roman', serif;">Use the following code to verify your identity and access the evaluation form:</p>
    <div style="background: #F5F5F5; border: 1px solid #DDDDDD; padding: 24px; text-align: center; margin-bottom: 24px;">
      <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #111111; font-family: 'Helvetica Neue', 'Arial Narrow', Arial, sans-serif; font-variant-numeric: tabular-nums;">${escapeHtml(otp)}</span>
    </div>
    <p style="margin: 0 0 4px; font-size: 12px; color: #888888; line-height: 1.5; font-family: 'Helvetica Neue', 'Arial Narrow', Arial, sans-serif;">This code expires in 10 minutes.</p>
    <p style="margin: 0; font-size: 12px; color: #888888; line-height: 1.5; font-family: 'Helvetica Neue', 'Arial Narrow', Arial, sans-serif;">If you didn't request this code, please ignore this email.</p>
    `
  );

  const text = `Hi ${recipientName},\n\nYour verification code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this code, please ignore this email.`;

  return { html, text };
}

// ─── Evaluation Invitation ───

export function getEvaluationInviteEmail(
  recipientName: string,
  subjectName: string,
  cycleName: string,
  evaluationUrl: string
): { html: string; text: string } {
  const html = emailWrapper(
    "Evaluation Invitation",
    `
    <p style="margin: 0 0 16px; font-size: 16px; color: #111111; line-height: 1.7; font-family: Georgia, 'Times New Roman', serif;">Hi ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 24px; font-size: 16px; color: #555555; line-height: 1.7; font-family: Georgia, 'Times New Roman', serif;">You've been invited to provide feedback for <strong>${escapeHtml(subjectName)}</strong> as part of the <strong>${escapeHtml(cycleName)}</strong> evaluation cycle.</p>
    ${ctaButton(evaluationUrl, "Start Evaluation")}
    <p style="margin: 24px 0 0; font-size: 12px; color: #888888; line-height: 1.5; font-family: 'Helvetica Neue', 'Arial Narrow', Arial, sans-serif;">You'll be asked to verify your identity with a one-time code before starting.</p>
    `
  );

  const text = `Hi ${recipientName},\n\nYou've been invited to provide feedback for ${subjectName} as part of the ${cycleName} evaluation cycle.\n\nStart your evaluation: ${evaluationUrl}\n\nYou'll be asked to verify your identity with a one-time code before starting.`;

  return { html, text };
}

// ─── Evaluation Reminder ───

export function getEvaluationReminderEmail(
  recipientName: string,
  subjectName: string,
  cycleName: string,
  deadline: string,
  evaluationUrl: string
): { html: string; text: string } {
  const html = emailWrapper(
    "Evaluation Reminder",
    `
    <p style="margin: 0 0 16px; font-size: 16px; color: #111111; line-height: 1.7; font-family: Georgia, 'Times New Roman', serif;">Hi ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px; font-size: 16px; color: #555555; line-height: 1.7; font-family: Georgia, 'Times New Roman', serif;">This is a friendly reminder that your evaluation for <strong>${escapeHtml(subjectName)}</strong> as part of the <strong>${escapeHtml(cycleName)}</strong> cycle is still pending.</p>
    <p style="margin: 0 0 24px; font-size: 16px; color: #555555; line-height: 1.7; font-family: Georgia, 'Times New Roman', serif;">The deadline is <strong>${escapeHtml(deadline)}</strong>. Please complete it before then.</p>
    ${ctaButton(evaluationUrl, "Complete Evaluation")}
    <p style="margin: 24px 0 0; font-size: 12px; color: #888888; line-height: 1.5; font-family: 'Helvetica Neue', 'Arial Narrow', Arial, sans-serif;">You'll be asked to verify your identity with a one-time code before starting.</p>
    `
  );

  const text = `Hi ${recipientName},\n\nThis is a friendly reminder that your evaluation for ${subjectName} as part of the ${cycleName} cycle is still pending.\n\nThe deadline is ${deadline}. Please complete it before then.\n\nComplete your evaluation: ${evaluationUrl}`;

  return { html, text };
}

// ─── Summary Evaluation Invitation ───

export function getSummaryInviteEmail(
  recipientName: string,
  cycleName: string,
  assignments: Array<{ subjectName: string; direction: string }>,
  summaryUrl: string
): { html: string; text: string } {
  const assignmentListHtml = assignments
    .map(
      (a) =>
        `<li style="margin: 4px 0; font-size: 14px; color: #555555; font-family: 'Helvetica Neue', 'Arial Narrow', Arial, sans-serif;"><strong>${escapeHtml(a.subjectName)}</strong> <span style="color: #888888;">&middot; ${escapeHtml(a.direction)}</span></li>`
    )
    .join("");

  const count = assignments.length;
  const html = emailWrapper(
    "Evaluation Invitation",
    `
    <p style="margin: 0 0 16px; font-size: 16px; color: #111111; line-height: 1.7; font-family: Georgia, 'Times New Roman', serif;">Hi ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px; font-size: 16px; color: #555555; line-height: 1.7; font-family: Georgia, 'Times New Roman', serif;">You have <strong>${count}</strong> evaluation${count === 1 ? "" : "s"} to complete for the <strong>${escapeHtml(cycleName)}</strong> cycle:</p>
    <ul style="margin: 0 0 24px; padding-left: 20px;">${assignmentListHtml}</ul>
    ${ctaButton(summaryUrl, "View All Evaluations")}
    <p style="margin: 24px 0 0; font-size: 12px; color: #888888; line-height: 1.5; font-family: 'Helvetica Neue', 'Arial Narrow', Arial, sans-serif;">You'll verify your identity once, then have 4 hours to complete all evaluations.</p>
    `
  );

  const assignmentListText = assignments
    .map((a) => `  - ${a.subjectName} (${a.direction})`)
    .join("\n");

  const text = `Hi ${recipientName},\n\nYou have ${count} evaluation${count === 1 ? "" : "s"} to complete for the ${cycleName} cycle:\n\n${assignmentListText}\n\nView all evaluations: ${summaryUrl}\n\nYou'll verify your identity once, then have 4 hours to complete all evaluations.`;

  return { html, text };
}

// ─── Summary Evaluation Reminder ───

export function getSummaryReminderEmail(
  recipientName: string,
  cycleName: string,
  deadline: string,
  assignments: Array<{ subjectName: string; direction: string }>,
  summaryUrl: string
): { html: string; text: string } {
  const assignmentListHtml = assignments
    .map(
      (a) =>
        `<li style="margin: 4px 0; font-size: 14px; color: #555555; font-family: 'Helvetica Neue', 'Arial Narrow', Arial, sans-serif;"><strong>${escapeHtml(a.subjectName)}</strong> <span style="color: #888888;">&middot; ${escapeHtml(a.direction)}</span></li>`
    )
    .join("");

  const count = assignments.length;
  const html = emailWrapper(
    "Evaluation Reminder",
    `
    <p style="margin: 0 0 16px; font-size: 16px; color: #111111; line-height: 1.7; font-family: Georgia, 'Times New Roman', serif;">Hi ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px; font-size: 16px; color: #555555; line-height: 1.7; font-family: Georgia, 'Times New Roman', serif;">You still have <strong>${count}</strong> pending evaluation${count === 1 ? "" : "s"} for the <strong>${escapeHtml(cycleName)}</strong> cycle:</p>
    <ul style="margin: 0 0 16px; padding-left: 20px;">${assignmentListHtml}</ul>
    <p style="margin: 0 0 24px; font-size: 16px; color: #555555; line-height: 1.7; font-family: Georgia, 'Times New Roman', serif;">The deadline is <strong>${escapeHtml(deadline)}</strong>. Please complete them before then.</p>
    ${ctaButton(summaryUrl, "View All Evaluations")}
    <p style="margin: 24px 0 0; font-size: 12px; color: #888888; line-height: 1.5; font-family: 'Helvetica Neue', 'Arial Narrow', Arial, sans-serif;">You'll verify your identity once, then have 4 hours to complete all evaluations.</p>
    `
  );

  const assignmentListText = assignments
    .map((a) => `  - ${a.subjectName} (${a.direction})`)
    .join("\n");

  const text = `Hi ${recipientName},\n\nYou still have ${count} pending evaluation${count === 1 ? "" : "s"} for the ${cycleName} cycle:\n\n${assignmentListText}\n\nThe deadline is ${deadline}. Please complete them before then.\n\nView all evaluations: ${summaryUrl}\n\nYou'll verify your identity once, then have 4 hours to complete all evaluations.`;

  return { html, text };
}

// ─── Data Export Ready ───

export function getDataExportEmail(
  companyName: string,
  exportedAt: string
): { html: string; text: string } {
  const html = emailWrapper(
    "Data Export",
    `
    <p style="margin: 0 0 16px; font-size: 16px; color: #111111; line-height: 1.7; font-family: Georgia, 'Times New Roman', serif;">Hi,</p>
    <p style="margin: 0 0 16px; font-size: 16px; color: #555555; line-height: 1.7; font-family: Georgia, 'Times New Roman', serif;">Your data export for <strong>${escapeHtml(companyName)}</strong> is ready. The JSON file is attached to this email.</p>
    <p style="margin: 0 0 4px; font-size: 12px; color: #888888; line-height: 1.5; font-family: 'Helvetica Neue', 'Arial Narrow', Arial, sans-serif;">Exported on ${escapeHtml(exportedAt)}.</p>
    <p style="margin: 0; font-size: 12px; color: #888888; line-height: 1.5; font-family: 'Helvetica Neue', 'Arial Narrow', Arial, sans-serif;">This file contains decrypted evaluation responses. Please store it securely and delete it when no longer needed.</p>
    `
  );

  const text = `Hi,\n\nYour data export for ${companyName} is ready. The JSON file is attached to this email.\n\nExported on ${exportedAt}.\n\nThis file contains decrypted evaluation responses. Please store it securely and delete it when no longer needed.`;

  return { html, text };
}

// ─── User Invitation (Welcome) ───

export function getUserInviteEmail(
  recipientName: string,
  companyName: string,
  loginUrl: string
): { html: string; text: string } {
  const html = emailWrapper(
    "Welcome",
    `
    <p style="margin: 0 0 16px; font-size: 16px; color: #111111; line-height: 1.7; font-family: Georgia, 'Times New Roman', serif;">Hi ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 24px; font-size: 16px; color: #555555; line-height: 1.7; font-family: Georgia, 'Times New Roman', serif;">You've been invited to join <strong>${escapeHtml(companyName)}</strong> on Performs360, a 360-degree performance evaluation platform.</p>
    ${ctaButton(loginUrl, "Sign In to Get Started")}
    <p style="margin: 24px 0 0; font-size: 12px; color: #888888; line-height: 1.5; font-family: 'Helvetica Neue', 'Arial Narrow', Arial, sans-serif;">You'll sign in using a magic link sent to your email — no password needed.</p>
    `
  );

  const text = `Hi ${recipientName},\n\nYou've been invited to join ${companyName} on Performs360, a 360-degree performance evaluation platform.\n\nSign in to get started: ${loginUrl}\n\nYou'll sign in using a magic link sent to your email — no password needed.`;

  return { html, text };
}

// ─── Cycle Completion ───

export function getCycleCompletionEmail(
  cycleName: string,
  totalAssignments: number
): { html: string; text: string } {
  const html = emailWrapper(
    "Cycle Complete",
    `
    <p style="margin: 0 0 16px; font-size: 16px; color: #111111; line-height: 1.7; font-family: Georgia, 'Times New Roman', serif;">Hi,</p>
    <p style="margin: 0 0 16px; font-size: 16px; color: #555555; line-height: 1.7; font-family: Georgia, 'Times New Roman', serif;">The <strong>${escapeHtml(cycleName)}</strong> evaluation cycle has reached <strong>100% completion</strong>. All ${totalAssignments} evaluation${totalAssignments !== 1 ? "s" : ""} have been submitted.</p>
    <p style="margin: 0; font-size: 12px; color: #888888; line-height: 1.5; font-family: 'Helvetica Neue', 'Arial Narrow', Arial, sans-serif;">You can now view the full results in your Performs360 dashboard.</p>
    `
  );

  const text = `Hi,\n\nThe ${cycleName} evaluation cycle has reached 100% completion. All ${totalAssignments} evaluation${totalAssignments !== 1 ? "s" : ""} have been submitted.\n\nYou can now view the full results in your Performs360 dashboard.`;

  return { html, text };
}

// ─── Reports Export ───

export function getReportsExportEmail(
  cycleName: string,
  subjectCount: number
): { html: string; text: string } {
  const html = emailWrapper(
    "Reports Export",
    `
    <p style="margin: 0 0 16px; font-size: 16px; color: #111111; line-height: 1.7; font-family: Georgia, 'Times New Roman', serif;">Hi,</p>
    <p style="margin: 0 0 16px; font-size: 16px; color: #555555; line-height: 1.7; font-family: Georgia, 'Times New Roman', serif;">
      Your report export for the <strong>${escapeHtml(cycleName)}</strong> cycle is ready.
      The attached ZIP contains ${subjectCount} individual report PDF${subjectCount !== 1 ? "s" : ""}.
    </p>
    <p style="margin: 0; font-size: 12px; color: #888888; line-height: 1.5; font-family: 'Helvetica Neue', 'Arial Narrow', Arial, sans-serif;">
      This file contains evaluation scores and feedback. Please store it securely.
    </p>
    `
  );

  const text = `Hi,\n\nYour report export for the ${cycleName} cycle is ready. The attached ZIP contains ${subjectCount} individual report PDF${subjectCount !== 1 ? "s" : ""}.\n\nThis file contains evaluation scores and feedback. Please store it securely.`;

  return { html, text };
}

export function getReportsExportExcelEmail(
  cycleName: string,
  subjectCount: number,
): { html: string; text: string } {
  const html = emailWrapper(
    "Excel Scores Export",
    `
    <p style="margin: 0 0 16px; font-size: 16px; color: #111111; line-height: 1.7; font-family: Georgia, 'Times New Roman', serif;">Hi,</p>
    <p style="margin: 0 0 16px; font-size: 16px; color: #555555; line-height: 1.7; font-family: Georgia, 'Times New Roman', serif;">
      Your Excel scores export for the <strong>${escapeHtml(cycleName)}</strong> cycle is ready.
      The attached spreadsheet contains scores for ${subjectCount} individual${subjectCount !== 1 ? "s" : ""} across multiple sheets.
    </p>
    <p style="margin: 0; font-size: 12px; color: #888888; line-height: 1.5; font-family: 'Helvetica Neue', 'Arial Narrow', Arial, sans-serif;">
      This file contains evaluation scores. Please store it securely.
    </p>
    `,
  );

  const text = `Hi,\n\nYour Excel scores export for the ${cycleName} cycle is ready. The attached spreadsheet contains scores for ${subjectCount} individual${subjectCount !== 1 ? "s" : ""} across multiple sheets.\n\nThis file contains evaluation scores. Please store it securely.`;

  return { html, text };
}
