export interface Event {
  id: number;
  type: string;
  page_url: string;
  timestamp: string;
  domains?: {
    domain: string;
  };
  page_title?: string;
  referrer: string;
  source: string;
  ad_id?: string;
  ad_name?: string;
  ad_set_name?: string;
  campaign_name?: string;
}

export interface EventWithTime extends Event {
  time: string;
  pageUrl: string;
  pageTitle?: string;
}

export interface EventsByDay {
  day: string;
  events: EventWithTime[];
}

export interface GetOrderEventsParams {
  orderId: string;
  shop_name: string;
}

export interface GetOrderEventsResponse {
  success: boolean;
  result?: {
    events: EventsByDay[];
  };
  error?: string;
}

// Database types for order-events service
export interface ShopifyShop {
  timezone: string;
  shop_name: string;
}

export interface OrderWithShop {
  id: number;
  shopify_shop: string;
  shopify_shops: ShopifyShop;
}

export interface EventOrder {
  events: Event;
}

export interface AdDetail {
  ad_id: string;
  name: string;
  ad_sets?: {
    name: string;
    ad_campaigns?: {
      name: string;
    };
  };
}
