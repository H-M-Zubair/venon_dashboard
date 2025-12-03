import { supabaseConnection } from '@/database/supabase/connection.js';
import logger from '@/config/logger.js';
import moment from 'moment-timezone';

interface OrderEvent {
  referrer: string | null;
  source: string | null;
}

interface Order {
  id: string;
  name: string;
  total_price: number;
  customer_first_name: string | null;
  customer_last_name: string | null;
  created_at: string;
  events: OrderEvent[];
}

interface FormattedOrder {
  id: string;
  name: string;
  customerFirstName: string | null;
  customerLastName: string | null;
  time: string;
  totalPrice: number;
  sources: string[];
}

export class OrdersService {
  async getRecentOrdersByShop(
    shopName: string,
    startDate: string,
    endDate: string,
    timezone: string
  ): Promise<FormattedOrder[]> {
    const supabase = supabaseConnection.getServiceClient();

    logger.info('Fetching recent orders', { shopName, startDate, endDate, timezone });

    // Fetch the 10 most recent orders for the shop within the date range
    const { data: orderIds, error: orderIdsError } = await supabase
      .from('orders')
      .select('id, shopify_shops!inner ( shop_name )')
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .eq('shopify_shops.shop_name', shopName)
      .order('created_at', { ascending: false })
      .limit(10);

    if (orderIdsError) {
      logger.error('Failed to fetch order IDs', { error: orderIdsError });
      throw orderIdsError;
    }

    if (!orderIds || orderIds.length === 0) {
      logger.info('No orders found for the given criteria');
      return [];
    }

    // Fetch full order details with events
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select(
        `
        id,
        name,
        total_price,
        customer_first_name,
        customer_last_name,
        created_at,
        events (
          referrer,
          source
        )
      `
      )
      .in(
        'id',
        orderIds.map((order) => order.id)
      )
      .order('created_at', { ascending: false });

    if (ordersError) {
      logger.error('Failed to fetch order details', { error: ordersError });
      throw ordersError;
    }

    // Format the orders
    const formattedOrders = (orders as Order[]).map((order) => {
      // Extract unique sources from events
      const sources = order.events
        .map((event) => event.source)
        .filter((source): source is string => source !== null)
        .filter((source, index, self) => self.indexOf(source) === index); // Remove duplicates

      return {
        id: order.id,
        name: order.name,
        customerFirstName: order.customer_first_name,
        customerLastName: order.customer_last_name,
        time: moment(order.created_at).tz(timezone).format('HH:mm'),
        totalPrice: order.total_price,
        sources: sources,
      };
    });

    logger.info('Successfully formatted orders', { count: formattedOrders.length });
    return formattedOrders;
  }

  async getShopTimezone(shopName: string): Promise<string> {
    const supabase = supabaseConnection.getServiceClient();

    const { data, error } = await supabase
      .from('shopify_shops')
      .select('timezone')
      .eq('shop_name', shopName)
      .single();

    if (error || !data || !data.timezone) {
      logger.warn('Failed to fetch timezone, using default', { shopName, error });
      return 'UTC';
    }

    return data.timezone;
  }
}
