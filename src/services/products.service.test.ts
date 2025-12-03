/**
 * Unit tests for ProductsService
 *
 * Testing strategy:
 * - Mock Supabase connection
 * - Test successful product fetch with variants
 * - Test successful product fetch without variants
 * - Test empty product list
 * - Test error scenarios (product fetch error, variant fetch error)
 * - Verify data transformation and grouping logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing
vi.mock('@/database/supabase/connection.js', () => ({
  supabaseConnection: {
    getServiceClient: vi.fn(),
  },
}));

// Import after mocks
import { ProductsService } from './products.js';
import { supabaseConnection } from '@/database/supabase/connection.js';

describe('ProductsService', () => {
  let service: ProductsService;
  let mockSupabaseClient: any;

  const mockProducts = [
    {
      id: 1,
      name: 'Product A',
      product_type: 'T-Shirt',
      shopify_shop: 'test-shop.myshopify.com',
    },
    {
      id: 2,
      name: 'Product B',
      product_type: 'Hoodie',
      shopify_shop: 'test-shop.myshopify.com',
    },
  ];

  const mockVariants = [
    {
      id: 101,
      title: 'Small',
      price: '29.99',
      cost: '15.00',
      shopify_product: 1,
    },
    {
      id: 102,
      title: 'Medium',
      price: '29.99',
      cost: '15.00',
      shopify_product: 1,
    },
    {
      id: 103,
      title: 'Large',
      price: '39.99',
      cost: '20.00',
      shopify_product: 2,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ProductsService();

    // Mock Supabase client with chainable methods
    mockSupabaseClient = {
      from: vi.fn(),
    };

    vi.mocked(supabaseConnection.getServiceClient).mockReturnValue(mockSupabaseClient);
  });

  describe('getProducts', () => {
    describe('Success Scenarios', () => {
      it('should fetch products with variants successfully', async () => {
        // Mock products query
        const productsChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: mockProducts,
            error: null,
          }),
        };

        // Mock variants query
        const variantsChain = {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: mockVariants,
            error: null,
          }),
        };

        mockSupabaseClient.from
          .mockReturnValueOnce(productsChain)
          .mockReturnValueOnce(variantsChain);

        const result = await service.getProducts({
          shop_name: 'test-shop.myshopify.com',
        });

        expect(result.products).toHaveLength(2);
        expect(result.products[0].id).toBe('1');
        expect(result.products[0].name).toBe('Product A');
        expect(result.products[0].variants).toHaveLength(2);
        expect(result.products[1].variants).toHaveLength(1);
        expect(result.metadata.total_products).toBe(2);
        expect(result.metadata.total_variants).toBe(3);
        expect(result.metadata.shop_name).toBe('test-shop.myshopify.com');
      });

      it('should fetch products without variants', async () => {
        const productsChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: mockProducts,
            error: null,
          }),
        };

        const variantsChain = {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        };

        mockSupabaseClient.from
          .mockReturnValueOnce(productsChain)
          .mockReturnValueOnce(variantsChain);

        const result = await service.getProducts({
          shop_name: 'test-shop.myshopify.com',
        });

        expect(result.products).toHaveLength(2);
        expect(result.products[0].variants).toHaveLength(0);
        expect(result.products[1].variants).toHaveLength(0);
        expect(result.metadata.total_variants).toBe(0);
      });

      it('should handle null variants data', async () => {
        const productsChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: mockProducts,
            error: null,
          }),
        };

        const variantsChain = {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        };

        mockSupabaseClient.from
          .mockReturnValueOnce(productsChain)
          .mockReturnValueOnce(variantsChain);

        const result = await service.getProducts({
          shop_name: 'test-shop.myshopify.com',
        });

        expect(result.products).toHaveLength(2);
        expect(result.metadata.total_variants).toBe(0);
      });

      it('should return empty products list when no products found', async () => {
        const productsChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        };

        mockSupabaseClient.from.mockReturnValue(productsChain);

        const result = await service.getProducts({
          shop_name: 'empty-shop.myshopify.com',
        });

        expect(result.products).toHaveLength(0);
        expect(result.metadata.total_products).toBe(0);
        expect(result.metadata.total_variants).toBe(0);
        expect(result.metadata.shop_name).toBe('empty-shop.myshopify.com');
      });

      it('should return empty products list when products data is null', async () => {
        const productsChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        };

        mockSupabaseClient.from.mockReturnValue(productsChain);

        const result = await service.getProducts({
          shop_name: 'empty-shop.myshopify.com',
        });

        expect(result.products).toHaveLength(0);
        expect(result.metadata.total_products).toBe(0);
      });

      it('should correctly group variants by product', async () => {
        const productsChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: mockProducts,
            error: null,
          }),
        };

        const variantsChain = {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: mockVariants,
            error: null,
          }),
        };

        mockSupabaseClient.from
          .mockReturnValueOnce(productsChain)
          .mockReturnValueOnce(variantsChain);

        const result = await service.getProducts({
          shop_name: 'test-shop.myshopify.com',
        });

        // Product 1 should have variants 101 and 102
        const product1 = result.products.find((p) => p.id === '1');
        expect(product1?.variants).toHaveLength(2);
        expect(product1?.variants.map((v) => v.id)).toEqual(['101', '102']);

        // Product 2 should have variant 103
        const product2 = result.products.find((p) => p.id === '2');
        expect(product2?.variants).toHaveLength(1);
        expect(product2?.variants[0].id).toBe('103');
      });

      it('should transform data correctly', async () => {
        const productsChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [mockProducts[0]],
            error: null,
          }),
        };

        const variantsChain = {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [mockVariants[0]],
            error: null,
          }),
        };

        mockSupabaseClient.from
          .mockReturnValueOnce(productsChain)
          .mockReturnValueOnce(variantsChain);

        const result = await service.getProducts({
          shop_name: 'test-shop.myshopify.com',
        });

        const product = result.products[0];
        expect(product.id).toBe('1'); // Converted to string
        expect(product.name).toBe('Product A');
        expect(product.product_type).toBe('T-Shirt');
        expect(product.shopify_shop).toBe('test-shop.myshopify.com');

        const variant = product.variants[0];
        expect(variant.id).toBe('101'); // Converted to string
        expect(variant.title).toBe('Small');
        expect(variant.price).toBe('29.99');
        expect(variant.cost).toBe('15.00');
        expect(variant.shopify_product).toBe('1'); // Converted to string
      });

      it('should include metadata with query timestamp', async () => {
        const productsChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        };

        mockSupabaseClient.from.mockReturnValue(productsChain);

        const result = await service.getProducts({
          shop_name: 'test-shop.myshopify.com',
        });

        expect(result.metadata.query_timestamp).toBeDefined();
        expect(typeof result.metadata.query_timestamp).toBe('string');
        expect(new Date(result.metadata.query_timestamp).toString()).not.toBe('Invalid Date');
      });
    });

    describe('Query Construction', () => {
      it('should query products table with correct shop name', async () => {
        const productsChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        };

        mockSupabaseClient.from.mockReturnValue(productsChain);

        await service.getProducts({
          shop_name: 'my-shop.myshopify.com',
        });

        expect(mockSupabaseClient.from).toHaveBeenCalledWith('shopify_products');
        expect(productsChain.select).toHaveBeenCalledWith('*');
        expect(productsChain.eq).toHaveBeenCalledWith('shopify_shop', 'my-shop.myshopify.com');
        expect(productsChain.order).toHaveBeenCalledWith('name');
      });

      it('should query variants table with product IDs', async () => {
        const productsChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: mockProducts,
            error: null,
          }),
        };

        const variantsChain = {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        };

        mockSupabaseClient.from
          .mockReturnValueOnce(productsChain)
          .mockReturnValueOnce(variantsChain);

        await service.getProducts({
          shop_name: 'test-shop.myshopify.com',
        });

        expect(mockSupabaseClient.from).toHaveBeenCalledWith('shopify_product_variants');
        expect(variantsChain.select).toHaveBeenCalledWith('*');
        expect(variantsChain.in).toHaveBeenCalledWith('shopify_product', [1, 2]);
        expect(variantsChain.order).toHaveBeenCalledWith('title');
      });
    });

    describe('Error Handling', () => {
      it('should throw error when products fetch fails', async () => {
        const productsChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database error' },
          }),
        };

        mockSupabaseClient.from.mockReturnValue(productsChain);

        await expect(
          service.getProducts({ shop_name: 'test-shop.myshopify.com' })
        ).rejects.toThrow('Failed to fetch products');
      });

      it('should throw error when variants fetch fails', async () => {
        const productsChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: mockProducts,
            error: null,
          }),
        };

        const variantsChain = {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Variants query failed' },
          }),
        };

        mockSupabaseClient.from
          .mockReturnValueOnce(productsChain)
          .mockReturnValueOnce(variantsChain);

        await expect(
          service.getProducts({ shop_name: 'test-shop.myshopify.com' })
        ).rejects.toThrow('Failed to fetch product variants');
      });

      it('should propagate unknown errors', async () => {
        mockSupabaseClient.from.mockImplementation(() => {
          throw new Error('Connection failed');
        });

        await expect(
          service.getProducts({ shop_name: 'test-shop.myshopify.com' })
        ).rejects.toThrow('Connection failed');
      });
    });
  });
});
