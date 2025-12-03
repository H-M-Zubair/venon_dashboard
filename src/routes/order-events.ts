import { Router, Response } from 'express';
import { validateRequest } from '@/middleware/validation';
import { authenticateUser } from '@/middleware/auth';
import { requireAnyRole, AuthenticatedRequestWithRole } from '@/middleware/rbac';
import { asyncHandler } from '@/middleware/error';
import { z } from 'zod';
import { OrderEventsService } from '@/services/order-events';
import { GetOrderEventsResponse } from '@/types/order-events';

const router = Router();
const orderEventsService = new OrderEventsService();

const getOrderEventsSchema = z.object({
  query: z.object({
    orderId: z.string().regex(/^\d+$/, 'Order ID must be a valid number'),
    shop_name: z.string().min(1, 'Shop name is required'),
  }),
});

router.get(
  '/order-events',
  authenticateUser,
  requireAnyRole,
  validateRequest(getOrderEventsSchema),
  asyncHandler(async (req: AuthenticatedRequestWithRole, res: Response) => {
    try {
      const { orderId, shop_name } = req.query;

      // Convert orderId to number
      const orderIdNumber = parseInt(orderId as string, 10);

      // Get order events, passing the shop_name from the authenticated request
      // The RBAC middleware has already validated the user has access to this shop
      const events = await orderEventsService.getOrderEvents(orderIdNumber, shop_name as string);

      const response: GetOrderEventsResponse = {
        success: true,
        result: {
          events,
        },
      };

      res.json(response);
    } catch (error) {
      console.error('Error in /order-events:', error);

      let errorMessage = 'Internal server error';
      if (error instanceof Error) {
        if (error.message === 'Order not found') {
          res.status(404).json({
            success: false,
            error: 'Order not found',
          });
          return;
        }
        errorMessage = error.message;
      }

      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  })
);

export default router;
