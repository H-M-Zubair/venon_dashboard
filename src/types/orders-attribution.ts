export interface OrdersAttributionRequest {
  accountId: string;
  startDate: string;
  endDate: string;
  attributionModel: string;
  attributionWindow: string;
  channel: string;

  // For non-ad-spend channels
  campaign?: string;

  // For ad-spend channels (meta-ads, google-ads)
  adCampaignPk?: string;
  adSetPk?: string;
  adPk?: string;

  // Filter for first-time customers only
  firstTimeCustomersOnly?: boolean;
}

/**
 * Event-based orders attribution request
 * Similar to OrdersAttributionRequest but without attribution_window
 * (event-based attribution is always lifetime - only event date matters)
 */
export interface EventBasedOrdersAttributionRequest {
  accountId: string;
  startDate: string;
  endDate: string;
  attributionModel: 'first_click' | 'last_click' | 'last_paid_click' | 'linear_all' | 'linear_paid';
  channel: string;

  // For non-ad-spend channels
  campaign?: string;

  // For ad-spend channels (meta-ads, google-ads)
  adCampaignPk?: string;
  adSetPk?: string;
  adPk?: string;

  // Filter for first-time customers only
  firstTimeCustomersOnly?: boolean;
}

export interface OrderInfo {
  order_id: string;
  order_number: string;
  order_timestamp: string;
  is_first_customer_order?: boolean;
}

export interface OrdersAttributionResponse {
  success: boolean;
  result?: {
    orders: OrderInfo[];
    total: number;
  };
  error?: string;
}
