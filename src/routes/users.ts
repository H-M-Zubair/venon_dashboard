import { Router } from 'express';
import { authenticateUser } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { UsersController } from '../controllers/users';

const router = Router();
const usersController = new UsersController();

// All routes require authentication
router.use(authenticateUser);

// Current user endpoint - accessible to all authenticated users
router.get('/me', usersController.getCurrentUser);

// All routes below require admin role
router.use(requireAdmin);

// User management routes
router.get('/shop-users', usersController.getShopUsers);
router.post('/invite', usersController.inviteUser);
router.patch('/role', usersController.updateUserRole);
router.delete('/remove', usersController.removeUser);

export default router;
