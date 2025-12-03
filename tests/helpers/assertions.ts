/**
 * Custom Assertions for Integration Tests
 *
 * These helpers validate response structures from API endpoints.
 * They're used in integration tests to ensure API contracts are met.
 */

import { expect } from 'vitest';

/**
 * Validates channel performance data structure
 */
export function expectValidChannelPerformance(data: any) {
  expect(data).toHaveProperty('channel');
  expect(data).toHaveProperty('attributed_revenue');
  expect(data).toHaveProperty('attributed_orders');
  expect(data).toHaveProperty('ad_spend');
  expect(data).toHaveProperty('roas');
  expect(data).toHaveProperty('net_profit');
  expect(data).toHaveProperty('attributed_cogs');
  expect(data).toHaveProperty('first_time_customer_orders');
  expect(data).toHaveProperty('first_time_customer_revenue');

  // Validate types
  expect(typeof data.channel).toBe('string');
  expect(typeof data.attributed_revenue).toBe('number');
  expect(typeof data.attributed_orders).toBe('number');
  expect(typeof data.ad_spend).toBe('number');
  expect(typeof data.roas).toBe('number');
}

/**
 * Validates timeseries data point structure
 */
export function expectValidTimeseriesPoint(data: any) {
  expect(data).toHaveProperty('time_period');
  expect(data).toHaveProperty('ad_spend');
  expect(data).toHaveProperty('attributed_revenue');
  expect(data).toHaveProperty('roas');

  // Validate types
  expect(typeof data.time_period).toBe('string');
  expect(typeof data.ad_spend).toBe('number');
  expect(typeof data.attributed_revenue).toBe('number');
  expect(typeof data.roas).toBe('number');

  // Validate date format (YYYY-MM-DD or YYYY-MM-DD HH:00:00 for hourly)
  expect(data.time_period).toMatch(/^\d{4}-\d{2}-\d{2}/);
}

/**
 * Validates order info structure
 */
export function expectValidOrderInfo(data: any) {
  expect(data).toHaveProperty('order_id');
  expect(data).toHaveProperty('order_number');
  expect(data).toHaveProperty('total_price');

  // Validate types
  expect(typeof data.order_id).toBe('string');
  expect(typeof data.order_number).toBe('string');
  expect(typeof data.total_price).toBe('number');

  // Validate Shopify order ID format
  expect(data.order_id).toMatch(/^gid:\/\/shopify\/Order\/\d+$/);
}

/**
 * Validates API success response structure
 */
export function expectSuccessResponse(response: any) {
  expect(response.body).toHaveProperty('success', true);
  expect(response.body).toHaveProperty('result');
}

/**
 * Validates API error response structure
 */
export function expectErrorResponse(response: any, statusCode: number) {
  expect(response.status).toBe(statusCode);
  expect(response.body).toHaveProperty('error');
  expect(typeof response.body.error).toBe('string');
}

/**
 * Validates channel performance response
 */
export function expectValidChannelPerformanceResponse(response: any) {
  expectSuccessResponse(response);

  const result = response.body.result;
  expect(result).toHaveProperty('data');
  expect(result).toHaveProperty('metadata');
  expect(Array.isArray(result.data)).toBe(true);

  // Validate metadata
  expect(result.metadata).toHaveProperty('shop_name');
  expect(result.metadata).toHaveProperty('start_date');
  expect(result.metadata).toHaveProperty('end_date');
  expect(result.metadata).toHaveProperty('attribution_model');

  // If we have data, validate first item
  if (result.data.length > 0) {
    expectValidChannelPerformance(result.data[0]);
  }
}

/**
 * Validates timeseries response
 */
export function expectValidTimeseriesResponse(response: any) {
  expect(response.body).toHaveProperty('data');
  expect(Array.isArray(response.body.data)).toBe(true);

  // If we have data, validate first item
  if (response.body.data.length > 0) {
    expectValidTimeseriesPoint(response.body.data[0]);
  }
}

/**
 * Validates orders attribution response
 */
export function expectValidOrdersResponse(response: any) {
  expectSuccessResponse(response);

  const result = response.body.result;
  expect(result).toHaveProperty('orders');
  expect(result).toHaveProperty('total');
  expect(Array.isArray(result.orders)).toBe(true);
  expect(typeof result.total).toBe('number');

  // If we have orders, validate first order
  if (result.orders.length > 0) {
    expectValidOrderInfo(result.orders[0]);
  }
}

/**
 * Validates pixel channel performance response (ad hierarchy)
 */
export function expectValidPixelChannelResponse(response: any) {
  expectSuccessResponse(response);

  const result = response.body.result;
  expect(result).toHaveProperty('data');
  expect(result).toHaveProperty('metadata');
  expect(Array.isArray(result.data)).toBe(true);

  // Validate metadata
  expect(result.metadata).toHaveProperty('shop_name');
  expect(result.metadata).toHaveProperty('channel');

  // Check if it's ad hierarchy or campaign list
  if ('total_ads' in result.metadata) {
    // Ad hierarchy response
    expect(result.metadata).toHaveProperty('total_campaigns');
    expect(result.metadata).toHaveProperty('total_ad_sets');
    expect(result.metadata).toHaveProperty('total_ads');
  } else {
    // Campaign list response
    expect(result.metadata).toHaveProperty('total_campaigns');
  }
}

/**
 * Validates validation error response (400)
 */
export function expectValidationError(response: any) {
  expectErrorResponse(response, 400);
  expect(response.body).toHaveProperty('details');
  expect(Array.isArray(response.body.details) || typeof response.body.details === 'object').toBe(
    true
  );
}

/**
 * Validates authentication error response (401)
 */
export function expectAuthenticationError(response: any) {
  expectErrorResponse(response, 401);
}

/**
 * Validates authorization error response (403)
 */
export function expectAuthorizationError(response: any) {
  expectErrorResponse(response, 403);
}
