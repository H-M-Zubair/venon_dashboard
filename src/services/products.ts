import logger from '@/config/logger.js';
import type {
  ProductsQuery,
  ProductsResponse,
  Product,
  ProductRow,
  ProductVariantRow,
} from '@/types/products.js';

export class ProductsService {
  async getProducts(params: ProductsQuery['query']): Promise<ProductsResponse> {
    const startTime = Date.now();

    try {
      logger.info('Fetching products for shop', { shop_name: params.shop_name });

      // Import Supabase connection
      const { supabaseConnection } = await import('@/database/supabase/connection.js');
      const supabase = supabaseConnection.getServiceClient();

      // Fetch products for the shop
      const { data: products, error: productsError } = await supabase
        .from('shopify_products')
        .select('*')
        .eq('shopify_shop', params.shop_name)
        .order('name');

      if (productsError) {
        logger.error('Failed to fetch products', {
          error: productsError,
          shop_name: params.shop_name,
        });
        throw new Error('Failed to fetch products');
      }

      if (!products || products.length === 0) {
        return {
          products: [],
          metadata: {
            shop_name: params.shop_name,
            total_products: 0,
            total_variants: 0,
            query_timestamp: new Date().toISOString(),
          },
        };
      }

      // Get all product IDs
      const productIds = products.map((p) => p.id);

      // Fetch all variants for these products
      const { data: variants, error: variantsError } = await supabase
        .from('shopify_product_variants')
        .select('*')
        .in('shopify_product', productIds)
        .order('title');

      if (variantsError) {
        logger.error('Failed to fetch product variants', {
          error: variantsError,
          shop_name: params.shop_name,
          product_count: products.length,
        });
        throw new Error('Failed to fetch product variants');
      }

      // Group variants by product
      const variantsByProduct = new Map<number, ProductVariantRow[]>();

      if (variants) {
        for (const variant of variants) {
          const productId = variant.shopify_product;
          if (!variantsByProduct.has(productId)) {
            variantsByProduct.set(productId, []);
          }
          variantsByProduct.get(productId)!.push(variant);
        }
      }

      // Build the response with products and their variants
      const productsWithVariants: Product[] = products.map((product: ProductRow) => ({
        id: product.id.toString(),
        name: product.name,
        product_type: product.product_type,
        shopify_shop: product.shopify_shop,
        variants: (variantsByProduct.get(product.id) || []).map((variant) => ({
          id: variant.id.toString(),
          title: variant.title,
          price: variant.price,
          cost: variant.cost,
          shopify_product: variant.shopify_product.toString(),
        })),
      }));

      const totalVariants = variants?.length || 0;
      const elapsedMs = Date.now() - startTime;

      logger.info('Products fetched successfully', {
        shop_name: params.shop_name,
        total_products: productsWithVariants.length,
        total_variants: totalVariants,
        elapsed_ms: elapsedMs,
      });

      return {
        products: productsWithVariants,
        metadata: {
          shop_name: params.shop_name,
          total_products: productsWithVariants.length,
          total_variants: totalVariants,
          query_timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      logger.error('Error in products service', {
        error: error instanceof Error ? error.message : 'Unknown error',
        shop_name: params.shop_name,
      });
      throw error;
    }
  }
}
