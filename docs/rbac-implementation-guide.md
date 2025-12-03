# RBAC Implementation Guide

## Role Definitions

1. **Admin** - Full access to all features
2. **Editor** - Can view all data and modify ad status/budgets only
3. **Viewer** - Read-only access to all data

## Database Setup

1. Run the migration script to create the `user_roles` table:
```sql
-- Location: /src/database/migrations/001_user_roles.sql
-- This creates the user_roles table with proper constraints and RLS policies
```

2. The table structure links users directly to shops:
- `user_id` → references `auth.users`
- `shop_name` → references `shopify_shops.shop_name`
- `role` → enum of 'admin', 'editor', 'viewer'

## Implementation Details

### New Backend (`/src`)

#### 1. Middleware Setup
The RBAC middleware is already created at `/src/middleware/rbac.ts`:

```typescript
// Available middleware functions:
requireAdmin      // Only admin users
requireEditor     // Admin and editor users
requireAnyRole    // All authenticated users with any role
```

#### 2. Update Route Files
Example for analytics routes (`/src/routes/analytics.ts`):
```typescript
import { requireAnyRole } from '@/middleware/rbac.js';

// Apply to all routes in this router
router.use(authenticateUser);
router.use(requireAnyRole); // All roles can view analytics
```

#### 3. Controller Updates
Controllers should use the `AuthenticatedRequestWithRole` interface:
```typescript
import { AuthenticatedRequestWithRole } from '@/middleware/rbac.js';

export const someController = async (
  req: AuthenticatedRequestWithRole,
  res: Response
) => {
  // Access user role and shop
  const { role, shop_name } = req.user;
  
  // Role-specific logic
  if (role === 'viewer') {
    // Read-only operations
  }
};
```

### Old Backend (`/venon-backend`)

#### 1. Middleware Setup
The RBAC middleware is at `/venon-backend/middlewares/rbac.ts`:

```typescript
// Available middleware functions:
requireAdmin      // Only admin users  
requireEditor     // Admin and editor users
requireAnyRole    // All authenticated users with any role
```

#### 2. Update Routes

##### For Ad Management Routes (`/venon-backend/routes/ads.ts`):
```typescript
import { requireEditor } from '../middlewares/rbac';

// Add requireEditor after authenticateJWT
router.patch(
  '/:provider/campaigns/:campaignId/status',
  authenticateJWT,
  requireEditor, // Only admin/editor can modify ads
  blockAdStatusAndBudgetChanges,
  providerValidator,
  validateStatusUpdate,
  campaignStatusController
);
```

##### For Protected Routes (`/venon-backend/routes/protected.ts`):
This file organizes all protected routes with proper RBAC:
```typescript
// Admin only routes
router.post('/connectIntegration', requireAdmin, connectIntegration);

// Editor routes (admin + editor)
router.post('/updateShippingCountries', requireEditor, updateShippingCountries);

// Viewer routes (all authenticated users)
router.get('/getStats', requireAnyRole, getStats);
```

##### Update Main Router (`/venon-backend/routes/index.ts`):
Replace with the updated version that separates public and protected routes:
```typescript
import protectedRouter from './protected';

// Public routes (no auth needed)
index.post('/track', track);

// Protected routes with RBAC
index.use('/', protectedRouter);
```

#### 3. Controller Updates
Update controller signatures to use the new interface:
```typescript
import { AuthenticatedRequestWithRole } from '../middlewares/rbac';

export const updateCampaignStatus = async (
  req: AuthenticatedRequestWithRole,
  res: Response
) => {
  const { role, shop_name } = req.user;
  // Implementation
};
```

## Route Protection Matrix

### New Backend (`/src`)

#### Analytics Routes (`/api/analytics/*`)
All routes require authentication + any role (admin/editor/viewer):
- `/channel-performance` - View channel metrics
- `/channel-performance/summary` - View aggregated summary
- `/pixel/:channel` - View pixel/campaign data
- `/dashboard-metrics` - View dashboard timeseries

#### Timeseries Routes (`/api/timeseries`)
Requires authentication + any role (admin/editor/viewer)

#### Order Events Routes (`/api/order-events`)
Requires authentication + any role (admin/editor/viewer)

### Old Backend (`/venon-backend`)

#### Ad Management Routes (`/api/*`)
Requires authentication + editor role (admin/editor):
- `/:provider/campaigns/:id/status` - Pause/resume campaigns
- `/:provider/campaigns/:id/budget` - Update campaign budgets
- `/:provider/ad-sets/:id/status` - Pause/resume ad sets
- `/:provider/ad-sets/:id/budget` - Update ad set budgets
- `/:provider/ads/:id/status` - Pause/resume individual ads

#### Integration Management Routes
Requires authentication + admin role only:
- `/connectIntegration` - Connect new ad platforms
- `/disconnectIntegration` - Disconnect ad platforms
- `/saveMetaConversionApiSettings` - Modify Meta API settings
- `/connectTaboola` - Connect Taboola
- `/connectShopify` - Connect Shopify stores
- `/connectTelegram` - Configure Telegram notifications

#### Settings/Configuration Routes
Requires authentication + admin role only:
- `/updatePaymentGateways` - Modify payment gateway settings
- `/addShippingProfiles` - Add shipping profiles
- `/saveConversionEvents` - Save conversion event mappings

#### Cost/COGS Management Routes
Requires authentication + editor role (admin/editor):
- `/fetchShippingCountries` - Update shipping country settings

#### Read-Only Routes
Requires authentication + any role (admin/editor/viewer):
- `/getStats` - View general statistics
- `/getIntegrations` - View connected integrations
- `/getCampaigns` - View campaigns
- `/getAdSets` - View ad sets
- `/getAds` - View ads
- `/getProducts` - View products
- `/getShippingCountries` - View shipping countries
- `/getPaymentGateways` - View payment gateways
- `/getConversionEvents` - View conversion events
- `/fetchIntegrationDetails` - View integration details
- `/getShopifyOrders` - View Shopify orders
- `/getOrderEvents` - View order events
- `/getTelegramSettings` - View Telegram settings

#### Public Routes (No Auth Required)
- `/track` - Tracking endpoint for pixels
- `/receiveShopifyWebPixelEvents` - Webhook receiver
- OAuth callback endpoints:
  - `/receiveGoogleCallback`
  - `/receiveMetaCallback`
  - `/receiveTikTokCallback`
  - `/receiveMicrosoftCallback`
  - `/shopifyCallback`

#### Special Routes
- `/stripe/*` - Handled by Stripe router (needs separate RBAC)

## Implementation Steps

1. **Update Old Backend Routes**:
   ```typescript
   // Example for integration routes
   index.post('/connectIntegration', authenticateJWT, requireAdmin, connectIntegration);
   index.post('/disconnectIntegration', authenticateJWT, requireAdmin, disconnectIntegration);
   
   // Example for read-only routes
   index.get('/getIntegrations', authenticateJWT, requireAnyRole, getIntegrations);
   ```

2. **Update Controllers**:
   - Ensure controllers use `AuthenticatedRequestWithRole` interface
   - Access user role via `req.user.role`
   - Access shop context via `req.user.shop_name`

3. **Frontend Updates**:
   - Check user role before showing UI elements
   - Disable buttons/forms for insufficient permissions
   - Handle 403 responses gracefully

## Common Implementation Patterns

### 1. Role-Specific UI Rendering (Frontend)
```typescript
// Check user role before showing UI elements
const userRole = user?.role || 'viewer';

// Conditionally render based on role
{userRole === 'admin' && (
  <Button onClick={connectIntegration}>Connect Integration</Button>
)}

{['admin', 'editor'].includes(userRole) && (
  <Button onClick={pauseCampaign}>Pause Campaign</Button>
)}
```

### 2. Handling 403 Errors (Frontend)
```typescript
try {
  const response = await api.updateCampaignStatus(campaignId, 'paused');
} catch (error) {
  if (error.response?.status === 403) {
    toast.error('You do not have permission to perform this action');
  }
}
```

### 3. Shop Context Handling
The RBAC middleware automatically extracts shop context from:
1. Query parameters: `?shop_name=example-shop`
2. Request body: `{ shop_name: 'example-shop' }`
3. URL parameters: `/shops/:shop_name/data`
4. **Legacy support**: `?account_id=123` (automatically converts to shop_name)

The middleware supports both approaches:
- **New**: Direct `shop_name` parameter
- **Legacy**: `account_id` parameter (looks up corresponding shop_name)

This ensures backward compatibility with existing frontend code that uses account_id.

### 4. Error Responses
The middleware returns standardized error responses:

```json
// 401 - Not authenticated
{
  "error": "Authentication required"
}

// 400 - Missing parameters
{
  "error": "Either shop_name or account_id is required"
}

// 404 - Shop not found (when using account_id)
{
  "error": "Shop not found for the provided account_id"
}

// 403 - No role for shop
{
  "error": "Access denied: No permissions for this shop"
}

// 403 - Insufficient permissions
{
  "error": "Access denied: Insufficient permissions",
  "required": ["admin", "editor"],
  "current": "viewer"
}
```

## Migration Strategy

1. **Phase 1: Deploy Database Changes**
   - Run migration to create `user_roles` table
   - Existing users automatically get admin role for their shops

2. **Phase 2: Deploy Backend Changes**
   - Deploy updated middleware and routes
   - Existing users continue to work as admins
   - No breaking changes

3. **Phase 3: Deploy Frontend Changes**
   - Add role checks to UI components
   - Handle 403 errors gracefully
   - Add role management UI for admins

4. **Phase 4: Enable Role Management**
   - Allow admins to invite users with specific roles
   - Monitor usage and permissions

## Testing Checklist

- [ ] Admin can access all endpoints
- [ ] Editor can modify ad status/budgets but not integrations
- [ ] Editor cannot connect/disconnect integrations
- [ ] Viewer can only read data, no modifications
- [ ] All roles can view analytics and reports
- [ ] Unauthenticated requests are rejected with 401
- [ ] Insufficient permissions return 403 with clear error
- [ ] Shop context is properly determined from requests
- [ ] Users can have different roles in different shops
- [ ] At least one admin always remains for each shop

## Old Backend Migration Instructions

### Testing the New Router

1. **Backup Current Setup**:
   - The original router is preserved in `/routes/index.ts`
   - The new router with RBAC is in `/routes/index-updated.ts`
   - The protected routes are in `/routes/protected.ts`

2. **Test in Development**:
   ```typescript
   // In server.ts, temporarily change:
   import { index } from './routes/index-updated';
   ```

3. **Verify Endpoints**:
   - Test public endpoints (OAuth callbacks, tracking)
   - Test protected endpoints with different roles
   - Ensure Stripe checkout remains public

4. **Production Migration**:
   ```bash
   # Once tested, replace the router
   mv routes/index.ts routes/index-backup.ts
   mv routes/index-updated.ts routes/index.ts
   ```

### Endpoint Protection Summary

**Public Endpoints** (No auth):
- Health check, tracking pixels, OAuth callbacks
- Stripe checkout, account creation
- Chrome extension stats

**Admin Only**:
- Integration management (connect/disconnect)
- Settings (payment gateways, telegram)
- Manual operations (updateAllWebPixels)

**Editor** (Admin + Editor):
- Ad status/budget changes
- Shipping country updates

**Viewer** (All authenticated):
- All read operations (stats, campaigns, orders)
- Integration views, product lists

## Troubleshooting

### Issue: "Could not determine shop context"
**Solution**: Ensure shop_name is provided in the request:
- Add to query params: `/api/endpoint?shop_name=my-shop`
- Add to request body: `{ shop_name: 'my-shop', ...data }`

### Issue: User has no access after implementation
**Solution**: Run the migration script which grants admin role to existing users

### Issue: TypeScript errors with AuthenticatedRequestWithRole
**Solution**: Import from the correct RBAC middleware file:
```typescript
// New backend
import { AuthenticatedRequestWithRole } from '@/middleware/rbac.js';

// Old backend  
import { AuthenticatedRequestWithRole } from '../middlewares/rbac';
```