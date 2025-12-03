import puppeteer from 'puppeteer';
import { Response } from 'express';
import { AuthenticatedRequestWithRole } from '@/middleware/rbac';
import { asyncHandler } from '@/middleware/error';

/**
 * Checks if the Venon tracking script is present on a given Shopify store page.
 * Requires authentication - user must be logged in with shop access.
 *
 * @param req - The authenticated request object containing query parameters for shopUrl and shopDomain.
 * @param res - The response object to send back the result.
 */
export const checkThemeSetup = asyncHandler(
  async (req: AuthenticatedRequestWithRole, res: Response): Promise<void> => {
    // Ensure that account is a string and then parse it
    const targetUrl = typeof req.query.shopUrl === 'string' ? req.query.shopUrl : null;
    const shopDomain = typeof req.query.shopDomain === 'string' ? req.query.shopDomain : null;

    if (!targetUrl || !shopDomain) {
      res.status(400).send({ error: 'Missing required parameters: shopUrl or shopDomain' });
      return;
    }

    const escapedShopDomain = shopDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const scriptRegex = new RegExp(
      `https:\\/\\/storage\\.googleapis\\.com\\/tp_script\\/${escapedShopDomain}\\.myshopify\\.com\\/config\\.js`
    );

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    try {
      await page.goto(targetUrl, { waitUntil: 'networkidle0' });

      const isScriptPresent = await page.evaluate((regexStr) => {
        const regex = new RegExp(regexStr);
        return Array.from(document.scripts).some((script) => regex.test(script.src));
      }, scriptRegex.source);

      console.log(
        isScriptPresent
          ? '✅ Venon tracking script is active.'
          : '❌ Venon tracking script is NOT active.'
      );
    } catch (err) {
      console.error('Error checking site:', err);
    } finally {
      await browser.close();
    }
  }
);
