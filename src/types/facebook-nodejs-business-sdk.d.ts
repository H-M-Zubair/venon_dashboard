declare module 'facebook-nodejs-business-sdk' {
  export class FacebookAdsApi {
    static init(accessToken: string): FacebookAdsApi;
  }

  export class Campaign {
    constructor(id: string, options?: { api?: FacebookAdsApi });
    update(fields: string[], params: { status?: string; daily_budget?: number }): Promise<any>;
  }

  export class AdSet {
    constructor(id: string, options?: { api?: FacebookAdsApi });
    update(
      fields: string[],
      params: { status?: string; daily_budget?: number }
    ): Promise<any>;
  }

  export class Ad {
    constructor(id: string, options?: { api?: FacebookAdsApi });
    update(fields: string[], params: { status?: string }): Promise<any>;
  }
}
