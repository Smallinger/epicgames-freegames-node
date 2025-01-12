/* eslint-disable class-methods-use-this */
import { Page, Protocol } from 'puppeteer';
import { STORE_CART_EN } from '../common/constants';
import PuppetBase from './base';
import { getCookiesRaw, userHasValidCookie } from '../common/cookie';
import {
  toughCookieFileStoreToPuppeteerCookie,
  safeLaunchBrowser,
  safeNewPage,
  getDevtoolsUrl,
} from '../common/puppeteer';
import { generateLoginRedirect } from '../purchase';

export default class PuppetLogin extends PuppetBase {
  async refreshCookieLogin(): Promise<boolean> {
    if (!userHasValidCookie(this.email, 'EPIC_SSO_RM')) return false;
    const page = await this.setupPage();
    try {
      const url = generateLoginRedirect(STORE_CART_EN);
      this.L.trace({ url }, 'Visiting login cart redirect');
      await page.goto(url, {
        waitUntil: 'networkidle0',
      });
      const cdpClient = await page.target().createCDPSession();
      const currentUrlCookies = (await cdpClient.send('Network.getAllCookies')) as {
        cookies: Protocol.Network.Cookie[];
      };
      if (currentUrlCookies.cookies.find((c) => c.name === 'EPIC_BEARER_TOKEN')) {
        this.L.debug('Successfully refreshed cookie auth');
        await this.teardownPage(page);
        return true;
      }
    } catch (err) {
      await this.handlePageError(err, page);
    }
    await this.teardownPage(page);
    return false;
  }

  protected override async setupPage(): Promise<Page> {
    this.L.debug('Setting auth from cookies');
    const userCookies = await getCookiesRaw(this.email);
    const puppeteerCookies = toughCookieFileStoreToPuppeteerCookie(userCookies);

    this.L.debug('Logging in with puppeteer');
    const browser = await safeLaunchBrowser(this.L);
    const page = await safeNewPage(browser, this.L);
    try {
      this.L.trace(getDevtoolsUrl(page));
      const cdpClient = await page.target().createCDPSession();
      await cdpClient.send('Network.setCookies', {
        cookies: puppeteerCookies,
      });
      await cdpClient.detach();
      await page.setCookie(...puppeteerCookies);
      return page;
    } catch (err) {
      await this.handlePageError(err, page);
      throw err;
    }
  }
}
