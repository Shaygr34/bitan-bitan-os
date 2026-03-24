/**
 * Newsletter preparation from published articles.
 * Renders branded HTML email from article data.
 * Phase 1: generates HTML for manual paste into Summit CRM.
 */

const LOGO_URL = "https://bitancpa.com/logo-light.png";
const SITE_URL = "https://bitancpa.com";

export interface NewsletterInput {
  title: string;
  excerpt: string;
  slug: string;
  imageUrl?: string | null;
}

export interface NewsletterOutput {
  html: string;
  subject: string;
  previewText: string;
}

/**
 * Generate article announcement newsletter HTML.
 */
export function renderArticleNewsletter(input: NewsletterInput): NewsletterOutput {
  const articleUrl = `${SITE_URL}/knowledge/${input.slug}?utm_source=newsletter&utm_medium=email&utm_campaign=article`;
  const subject = `ביטן את ביטן — ${input.title}`;
  const previewText = input.excerpt.slice(0, 120);

  const imageBlock = input.imageUrl
    ? `<tr>
        <td style="padding: 0 32px 24px 32px;">
          <img src="${input.imageUrl}" alt="${input.title}" width="536" style="display: block; width: 100%; max-width: 536px; height: auto; border-radius: 6px; border: 0;" />
        </td>
      </tr>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: Arial, Helvetica, sans-serif; direction: rtl;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f4f4f4;">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <!-- HEADER -->
          <tr>
            <td style="background-color: #102040; padding: 28px 32px; text-align: center;">
              <img src="${LOGO_URL}" alt="ביטן את ביטן — רואי חשבון" width="200" style="display: block; margin: 0 auto; max-width: 200px; height: auto; border: 0;" />
            </td>
          </tr>
          <!-- BODY -->
          <tr>
            <td style="padding: 36px 32px 24px 32px;">
              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.7; color: #333333;">
                שלום רב,<br />פרסמנו מאמר חדש במרכז הידע שלנו שעשוי לעניין אתכם:
              </p>
              <h2 style="margin: 0 0 16px 0; font-size: 22px; line-height: 1.4; color: #102040; font-weight: 700;">
                ${input.title}
              </h2>
            </td>
          </tr>
          ${imageBlock}
          <tr>
            <td style="padding: 0 32px 32px 32px;">
              <p style="margin: 0 0 28px 0; font-size: 15px; line-height: 1.8; color: #555555;">
                ${input.excerpt}
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-radius: 6px; background-color: #C5A572;">
                    <a href="${articleUrl}" target="_blank" style="display: inline-block; padding: 14px 36px; font-size: 16px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 6px;">
                      לקריאת המאמר המלא →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- FOOTER -->
          <tr>
            <td style="background-color: #f9f9f9; padding: 24px 32px; text-align: center; border-top: 1px solid #eeeeee;">
              <p style="margin: 0 0 8px 0; font-size: 13px; color: #999999;">
                ביטן את ביטן — רואי חשבון | תל אביב
              </p>
              <p style="margin: 0; font-size: 12px; color: #bbbbbb;">
                <a href="${SITE_URL}" style="color: #C5A572; text-decoration: none;">bitancpa.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { html, subject, previewText };
}
