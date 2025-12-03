export function getAttributionTableName(attributionModel: string): string {
  const tableMapping: Record<string, string> = {
    linear_paid: 'int_order_attribution_linear_paid',
    linear_all: 'int_order_attribution_linear_all',
    first_click: 'int_order_attribution_first_click',
    last_click: 'int_order_attribution_last_click',
    all_clicks: 'int_order_attribution_all_clicks',
    last_paid_click: 'int_order_attribution_last_paid_click',
  };

  const tableName = tableMapping[attributionModel];

  if (!tableName) {
    throw new Error(`Unknown attribution model: ${attributionModel}`);
  }

  return tableName;
}
