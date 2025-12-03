import { Request, Response } from 'express';
import { ProductsService } from '@/services/products.js';
import { productsQuerySchema } from '@/types/products.js';
import logger from '@/config/logger.js';
import { AppError } from '@/middleware/error.js';

export class ProductsController {
  private productsService: ProductsService;

  constructor() {
    this.productsService = new ProductsService();
  }

  getProducts = async (req: Request & { user?: { id: string } }, res: Response) => {
    try {
      // Validate request
      const validation = productsQuerySchema.safeParse({
        query: req.query,
      });

      if (!validation.success) {
        throw new AppError('Invalid query parameters', 400);
      }

      const { query } = validation.data;

      logger.info('Products request', {
        shop_name: query.shop_name,
        user_id: req.user?.id,
      });

      // Get products data
      const result = await this.productsService.getProducts(query);

      return res.json({
        success: true,
        result,
      });
    } catch (error) {
      logger.error('Error in products controller', {
        error: error instanceof Error ? error.message : 'Unknown error',
        user_id: req.user?.id,
        query: req.query,
      });

      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Internal server error while fetching products',
      });
    }
  };
}
