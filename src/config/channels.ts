/**
 * Central configuration for channel types in the Venon dashboard.
 * This file defines which channels are considered ad spend (paid advertising) channels.
 */

// Define which channels are considered ad spend (paid advertising) channels
// All other channels are implicitly non-ad spend channels
export const AD_SPEND_CHANNELS = ['meta-ads', 'google-ads', 'taboola', 'tiktok-ads'] as const;

export type AdSpendChannel = (typeof AD_SPEND_CHANNELS)[number];

// Define which channels support API-based management (budget editing, status toggles)
// These are ad spend channels that we have direct API integration with
export const MANAGED_AD_CHANNELS = ['meta-ads', 'google-ads'] as const;

export type ManagedAdChannel = (typeof MANAGED_AD_CHANNELS)[number];

/**
 * Check if a channel is an ad spend channel
 * @param channel The channel name to check
 * @returns true if the channel is an ad spend channel, false otherwise
 */
export function isAdSpendChannel(channel: string): boolean {
  return AD_SPEND_CHANNELS.includes(channel.toLowerCase() as AdSpendChannel);
}

/**
 * Check if a channel is a non-ad spend channel
 * @param channel The channel name to check
 * @returns true if the channel is NOT an ad spend channel, false otherwise
 */
export function isNonAdSpendChannel(channel: string): boolean {
  return !isAdSpendChannel(channel);
}

/**
 * Check if a channel supports API-based management (budget, status toggles)
 * @param channel The channel name to check
 * @returns true if the channel is a managed ad channel, false otherwise
 */
export function isManagedAdChannel(channel: string): boolean {
  return MANAGED_AD_CHANNELS.includes(channel.toLowerCase() as ManagedAdChannel);
}
