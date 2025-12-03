import { z } from 'zod';

// Request validation schemas
export const productsQuerySchema = z.object({
  query: z.object({
    shop_name: z.string().min(1, 'Shop name is required'),
  }),
});

export type ProductsQuery = z.infer<typeof productsQuerySchema>;

// Database types (from Supabase)
export interface ProductVariant {
  id: string;
  title: string | null;
  price: number | null;
  cost: number | null;
  shopify_product: string;
}

export interface Product {
  id: string;
  name: string;
  product_type: string | null;
  shopify_shop: string;
  variants: ProductVariant[];
}

// Response types
export interface ProductsResponse {
  products: Product[];
  metadata: {
    shop_name: string;
    total_products: number;
    total_variants: number;
    query_timestamp: string;
  };
}

// Internal Supabase result types
export interface ProductRow {
  id: number;
  name: string;
  product_type: string | null;
  shopify_shop: string;
}

export interface ProductVariantRow {
  id: number;
  title: string | null;
  price: number | null;
  cost: number | null;
  shopify_product: number;
}
