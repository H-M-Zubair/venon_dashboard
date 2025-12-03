import { supabaseConnection } from '@/database/supabase/connection';
import moment from 'moment-timezone';
import {
  Event,
  EventWithTime,
  EventsByDay,
  OrderWithShop,
  EventOrder,
  AdDetail,
} from '@/types/order-events';

export class OrderEventsService {
  async getOrderEvents(orderId: number, shopName: string): Promise<EventsByDay[]> {
    try {
      const supabase = supabaseConnection.getServiceClient();

      // Fetch the order with shop information
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('id, shopify_shop, shopify_shops(timezone, shop_name)')
        .eq('id', orderId)
        .single<OrderWithShop>();

      if (orderError || !order) {
        throw new Error('Order not found');
      }

      // Validate that the order belongs to the specified shop
      if (order.shopify_shops.shop_name !== shopName) {
        throw new Error('Order does not belong to the specified shop');
      }

      const timezone = order.shopify_shops.timezone || 'Europe/Berlin';

      // Fetch the related events for the order
      const { data: eventOrders, error: eventOrdersError } = await supabase
        .from('events_orders')
        .select(
          `
          events(
            id,
            type,
            ad_id,
            page_url,
            timestamp,
            domains(
              domain
            ),
            page_title,
            referrer,
            source
          )
        `
        )
        .eq('order_id', orderId)
        .returns<EventOrder[]>();

      if (eventOrdersError) {
        throw new Error('Error fetching event orders');
      }

      // Extract the events from eventOrders
      let allEvents: Event[] = eventOrders.flatMap((eo) => eo.events);

      // Collect all unique ad_ids
      const adIds = Array.from(
        new Set(allEvents.filter((event) => event.ad_id).map((event) => event.ad_id!))
      );

      // Fetch ad details
      const adDetails = await this.getAdDetails(adIds);

      // Enhance events with ad details
      let events: EventWithTime[] = allEvents.map((event) => ({
        ...event,
        ...(event.ad_id ? adDetails[event.ad_id] : {}),
        pageUrl: event.domains?.domain ? event.domains.domain + event.page_url : event.page_url,
        time: moment(event.timestamp).tz(timezone).format('HH:mm'),
        pageTitle: event.page_title,
      }));

      // Sort them by timestamp
      events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Filter out consecutive events with the same pageUrl
      events = events.filter((event, index, array) => {
        return index === 0 || event.pageUrl !== array[index - 1]?.pageUrl;
      });

      // Group events by day
      const eventsByDay = events.reduce((acc: EventsByDay[], event) => {
        // Extract the date part of the timestamp
        const date = new Date(event.timestamp).toISOString().split('T')[0]!;

        // Find if the date already exists in the accumulator
        let existingDay = acc.find((d) => d.day === date);

        if (existingDay) {
          // If the date already exists, push the current event to the 'events' array of that date
          existingDay.events.push(event);
        } else {
          // If the date does not exist, create a new entry for that date
          acc.push({
            day: date,
            events: [event],
          });
        }

        return acc;
      }, []);

      return eventsByDay;
    } catch (error) {
      console.error('Error in getOrderEvents:', error);
      throw error;
    }
  }

  private async getAdDetails(
    adIds: string[]
  ): Promise<Record<string, { ad_name?: string; ad_set_name?: string; campaign_name?: string }>> {
    if (adIds.length === 0) {
      return {};
    }

    const supabase = supabaseConnection.getServiceClient();

    const { data: ads, error: adsError } = await supabase
      .from('ads')
      .select(
        `
        ad_id,
        name,
        ad_sets (
          name,
          ad_campaigns (
            name
          )
        )
      `
      )
      .in('ad_id', adIds)
      .returns<AdDetail[]>();

    if (adsError) {
      console.error('Error fetching ad details', adsError);
      throw adsError;
    }

    return ads.reduce(
      (
        acc: Record<string, { ad_name?: string; ad_set_name?: string; campaign_name?: string }>,
        ad
      ) => {
        acc[ad.ad_id] = {
          ad_name: ad.name,
          ad_set_name: ad.ad_sets?.name,
          campaign_name: ad.ad_sets?.ad_campaigns?.name,
        };
        return acc;
      },
      {}
    );
  }
}
