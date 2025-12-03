# Authentication & Authorization System Documentation

**Version:** 2.0
**Last Updated:** 2025-11-16
**Status:** ✅ Refactored - JWT-only authentication, security vulnerabilities fixed

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Authentication Flow](#authentication-flow)
4. [Authorization (RBAC)](#authorization-rbac)
5. [Database Schema](#database-schema)
6. [Developer Guide](#developer-guide)
7. [Code Examples](#code-examples)
8. [Troubleshooting](#troubleshooting)

---

## Overview

The Venon Dashboard backend implements a **two-layer security model**:

1. **Authentication Layer** - Validates JWT tokens and identifies users
2. **Authorization Layer** - Controls access to resources using Role-Based Access Control (RBAC)

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `authenticateUser` | `/src/middleware/auth.ts` | Validates JWT and identifies user (authentication only) |
| `requireRole` | `/src/middleware/rbac.ts` | Validates shop-level permissions and roles (authorization) |
| `validateUserAccountAccess` | `/src/utils/account-helpers.ts` | Utility for account ownership validation (optional use) |
| Supabase Auth | External service | JWT signing and validation |

### Technology Stack

- **JWT Provider:** Supabase Auth
- **Database:** PostgreSQL (via Supabase)
- **ORM:** Supabase JavaScript Client
- **Token Format:** JWT (JSON Web Tokens)

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Application                       │
│                  (Next.js Dashboard)                         │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ HTTP Request + Authorization: Bearer <JWT>
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                   Express.js Backend                         │
│                                                              │
│  ┌────────────────────────────────────────────────┐         │
│  │  1. authenticateUser Middleware                │         │
│  │     - Extract JWT from header                  │         │
│  │     - Validate with Supabase Auth             │         │
│  │     - Set req.user = { id, email }            │         │
│  └────────────┬───────────────────────────────────┘         │
│               │                                              │
│               ▼                                              │
│  ┌────────────────────────────────────────────────┐         │
│  │  2. requireRole Middleware (Optional)          │         │
│  │     - Resolve shop_name from request           │         │
│  │     - Check user_roles table                   │         │
│  │     - Validate permissions                     │         │
│  │     - Add role & shop_name to req.user        │         │
│  └────────────┬───────────────────────────────────┘         │
│               │                                              │
│               ▼                                              │
│  ┌────────────────────────────────────────────────┐         │
│  │  3. Route Handler / Controller                 │         │
│  │     - Business logic                           │         │
│  │     - Data access                              │         │
│  └────────────────────────────────────────────────┘         │
│                                                              │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│               Supabase PostgreSQL Database                   │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ auth.users   │  │   accounts   │  │ user_roles   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Request Flow

```
1. Client Request
   ├── Headers: { Authorization: "Bearer eyJ..." }
   └── URL: /api/analytics/channel-performance?account_id=123

2. authenticateUser Middleware
   ├── Extract token from Authorization header
   ├── Call supabase.auth.getUser(token)
   └── Set req.user = { id, email }

3. requireRole Middleware (if present)
   ├── Resolve shop_name from request
   ├── Query user_roles table
   ├── Verify user has required role (admin/editor/viewer)
   └── Add role & shop_name to req.user

4. Controller/Route Handler
   ├── Access req.user for authenticated user info
   └── Perform business logic

5. Response
   └── Return data or error
```

---

## Authentication Flow

### Implementation: `authenticateUser` Middleware

**Location:** `/src/middleware/auth.ts`

### Step-by-Step Flow

#### Step 1: Extract JWT from Authorization Header

```typescript
const authHeader = req.headers.authorization;
if (!authHeader || !authHeader.startsWith('Bearer ')) {
  return res.status(401).json({ error: 'Missing or invalid authorization header' });
}

const token = authHeader.substring(7); // Remove "Bearer " prefix
```

**Expected Format:** `Authorization: Bearer <jwt_token>`

#### Step 2: Validate JWT Token

```typescript
const supabase = supabaseConnection.getClient();
const { data: { user }, error } = await supabase.auth.getUser(token);

if (error || !user) {
  return res.status(401).json({ error: 'Invalid or expired token' });
}
```

**What Happens:**
- Supabase validates JWT signature using its internal JWT secret
- Checks token expiration
- Returns user object from `auth.users` table

**User Object Contains:**
- `id` (UUID) - Unique user identifier
- `email` - User's email address
- `aud` - Audience claim (should be "authenticated")
- Other Supabase Auth metadata

#### Step 3: Set Authenticated User Context

```typescript
// Set minimal authenticated user context
// Authorization (shop access, roles) handled by RBAC middleware
req.user = {
  id: user.id,
  email: user.email!,
};

logger.debug('User authenticated', {
  userId: user.id,
  email: user.email,
});

next();
```

**What Changed in v2.0:**
- ✅ **No database queries** - Authentication is now JWT-only
- ✅ **No account_id** - Removed from req.user (authorization is separate)
- ✅ **Faster** - Single API call instead of API call + database query
- ✅ **Simpler** - 33 lines removed from middleware

**Downstream Usage:**
Controllers access `req.user.id` and `req.user.email` for authenticated user info. For shop/account access, use `requireRole()` middleware which validates permissions and adds `role` and `shop_name` to `req.user`.

**Philosophy:**
Authentication middleware is responsible ONLY for validating identity (JWT validation). Authorization (access control to shops/resources) is delegated to the RBAC middleware layer.

### JWT Token Structure

**Issued by:** Supabase Auth
**Algorithm:** HS256 (HMAC with SHA-256)
**Secret:** `SUPABASE_JWT_SECRET` (configured in Supabase dashboard)

**Example JWT Payload:**
```json
{
  "aud": "authenticated",
  "exp": 1700000000,
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "role": "authenticated",
  "iat": 1699990000
}
```

**Claims:**
- `sub` - Subject (user ID)
- `email` - User's email
- `exp` - Expiration timestamp
- `iat` - Issued at timestamp
- `aud` - Audience (should be "authenticated")

### Token Lifecycle

1. **Token Issuance:** User logs in via Supabase Auth → Receives JWT
2. **Token Validation:** Every API request validates token via `auth.getUser()`
3. **Token Expiration:** Default 1 hour (configurable in Supabase)
4. **Token Refresh:** Client should refresh before expiration (handled by Supabase client libraries)
5. **Token Revocation:** Not currently implemented - tokens remain valid until expiration

---

## Authorization (RBAC)

### Role-Based Access Control System

**Location:** `/src/middleware/rbac.ts`

The RBAC system provides **shop-level permissions** using the `user_roles` table.

### User Roles

| Role | Permissions |
|------|-------------|
| `admin` | Full access - manage shop, users, integrations |
| `editor` | Modify data - analytics, campaigns, products |
| `viewer` | Read-only access - view analytics and reports |

### Database Schema: `user_roles`

```sql
CREATE TABLE public.user_roles (
  user_id UUID REFERENCES auth.users(id),
  shop_name TEXT REFERENCES shopify_shops(shop_name),
  role TEXT CHECK (role IN ('admin', 'editor', 'viewer')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, shop_name)
);
```

**Key Points:**
- **Many-to-many relationship:** One user can have roles in multiple shops
- **Unique constraint:** One role per user per shop
- **Auditable:** Tracks who created the role assignment

### Implementation: `requireRole` Middleware

```typescript
export const requireRole = (allowedRoles: Role[] = ['admin', 'editor', 'viewer']) => {
  return asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.id;

    // Resolve shop_name from request
    const shopName = req.query.shop_name || req.body.shop_name || req.params.shop_name;

    // Get user's role for this shop
    const role = await getUserRoleForShop(userId, shopName);

    // Check if user has required role
    if (!role || !allowedRoles.includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Attach role to request
    req.user!.role = role;
    req.user!.shop_name = shopName;

    next();
  });
};
```

### Usage Example

```typescript
// Route requiring admin role
router.delete(
  '/integrations/:id',
  authenticateUser,
  requireRole(['admin']),
  integrationsController.delete
);

// Route allowing editors and admins
router.post(
  '/campaigns',
  authenticateUser,
  requireRole(['admin', 'editor']),
  campaignsController.create
);

// Route allowing all authenticated users
router.get(
  '/analytics',
  authenticateUser,
  requireRole(['admin', 'editor', 'viewer']),
  analyticsController.getData
);
```

### Account Validation Utility

**Location:** `/src/utils/account-helpers.ts`

```typescript
export async function validateUserAccountAccess(
  userId: string,
  accountId: string
): Promise<void> {
  const serviceSupabase = supabaseConnection.getServiceClient();

  // Check if user owns the account
  const { data: account } = await serviceSupabase
    .from('accounts')
    .select('id')
    .eq('id', accountId)
    .eq('user_id', userId)
    .single();

  if (account) return; // User owns account

  // Check if user has role in associated shop
  const { data: shop } = await serviceSupabase
    .from('shopify_shops')
    .select('shop_name')
    .eq('account_id', accountId)
    .single();

  if (!shop) {
    throw new AppError('Account not found', 404);
  }

  const { data: userRole } = await serviceSupabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('shop_name', shop.shop_name)
    .single();

  if (!userRole) {
    throw new AppError('Access denied to this account', 403);
  }
}
```

**Purpose:** Verifies user has access to requested account via either:
1. Direct ownership (`accounts.user_id = userId`)
2. Shop-level role (`user_roles` entry for the shop)

---

## Database Schema

### Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     auth.users                              │
│                  (Supabase Auth Schema)                     │
│  ┌──────────────────────────────────────────────┐           │
│  │ id (UUID) PRIMARY KEY                        │           │
│  │ email TEXT UNIQUE                            │           │
│  │ created_at TIMESTAMP                         │           │
│  └──────────────────────────────────────────────┘           │
└────────┬──────────────────────────────────────┬─────────────┘
         │                                      │
         │ user_id                              │ user_id
         │ (one-to-many)                        │ (many-to-many via user_roles)
         │                                      │
         ▼                                      ▼
┌─────────────────────────────┐      ┌──────────────────────────┐
│    public.accounts          │      │   public.user_roles      │
│  ┌────────────────────────┐ │      │  ┌─────────────────────┐ │
│  │ id INTEGER PK          │ │      │  │ user_id UUID FK     │ │
│  │ user_id UUID FK        │ │      │  │ shop_name TEXT FK   │ │
│  │ name TEXT              │ │      │  │ role TEXT           │ │
│  │ type TEXT              │ │      │  │ PRIMARY KEY (user,  │ │
│  │ domain TEXT            │ │      │  │   shop_name)        │ │
│  └────────────────────────┘ │      │  └─────────────────────┘ │
└──────────┬──────────────────┘      └──────────┬───────────────┘
           │                                    │
           │ account_id                         │ shop_name
           │ (one-to-one)                       │ (many-to-one)
           │                                    │
           ▼                                    │
┌──────────────────────────────────────────────┼──────────────┐
│         public.shopify_shops                 │              │
│  ┌───────────────────────────────────────────┼────────────┐ │
│  │ id UUID PRIMARY KEY                       │            │ │
│  │ account_id INTEGER FK UNIQUE ─────────────┘            │ │
│  │ shop_name TEXT UNIQUE ─────────────────────────────────┘ │
│  │ shop_domain TEXT                                         │
│  │ access_token TEXT (encrypted)                            │
│  │ is_active BOOLEAN                                        │
│  └──────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

### Table Definitions

#### `auth.users` (Supabase Managed)

Authentication table managed by Supabase Auth. Not directly queried in application code.

**Columns:**
- `id` (UUID) - Primary key, user identifier
- `email` (TEXT) - User's email address
- `encrypted_password` - Password hash (managed by Supabase)
- `email_confirmed_at` - Email verification timestamp
- `created_at`, `updated_at` - Audit timestamps

#### `public.accounts`

Represents business accounts/organizations.

**Columns:**
- `id` (INTEGER) - Primary key, auto-increment
- `user_id` (UUID) - Foreign key to `auth.users(id)` (**⚠️ No UNIQUE constraint**)
- `name` (TEXT) - Account display name
- `type` (TEXT) - Account type (e.g., "shopify", "woocommerce")
- `domain` (TEXT) - Account domain/URL

**Cardinality:**
- **Current Schema:** One user can have **MULTIPLE** accounts (one-to-many)
- **Middleware Assumption:** One user has **ONE** account (one-to-one)
- **⚠️ Mismatch causes the bug**

#### `public.shopify_shops`

Shopify store configurations linked to accounts.

**Columns:**
- `id` (UUID) - Primary key
- `account_id` (INTEGER) - Foreign key to `accounts(id)` (**UNIQUE constraint**)
- `shop_name` (TEXT) - Shopify shop identifier (e.g., "my-store") (**UNIQUE**)
- `shop_domain` (TEXT) - Full domain (e.g., "my-store.myshopify.com")
- `access_token` (TEXT) - Shopify API access token (encrypted)
- `is_active` (BOOLEAN) - Whether shop is currently active

**Cardinality:**
- One account → One shop (one-to-one via UNIQUE constraint on `account_id`)
- One shop → One account

#### `public.user_roles`

Role assignments for users in shops (RBAC).

**Columns:**
- `user_id` (UUID) - Foreign key to `auth.users(id)`
- `shop_name` (TEXT) - Foreign key to `shopify_shops(shop_name)`
- `role` (TEXT) - User's role: 'admin', 'editor', or 'viewer'
- `created_by` (UUID) - Who created this role assignment
- `created_at` (TIMESTAMP) - When role was created

**Constraints:**
- **Primary Key:** `(user_id, shop_name)` - One role per user per shop
- **CHECK constraint:** `role IN ('admin', 'editor', 'viewer')`

**Cardinality:**
- Many-to-many: Users can have roles in multiple shops, shops can have multiple users

### Relationship Summary

```
User (1) ──────────→ (N) Accounts
User (N) ←─roles─→ (N) Shops
Account (1) ──────→ (1) Shop
Shop (N) ←─roles──→ (N) Users
```

**Key Insight:** As of v2.0, the system uses **shop-based access control exclusively**:
- **Authentication:** JWT-only (no database queries)
- **Authorization:** RBAC via `user_roles` table (many-to-many: users ↔ shops)
- **Accounts table:** Still exists for application use but NOT used in authentication middleware

---

## Developer Guide

### Adding a New Authenticated Endpoint

#### Step 1: Apply Authentication Middleware

```typescript
// src/routes/my-feature.ts
import { authenticateUser } from '@/middleware/auth';
import { requireRole } from '@/middleware/rbac';

router.get(
  '/my-endpoint',
  authenticateUser,        // Validates JWT, sets req.user
  requireRole(['admin']),  // Optional: Check role
  myController.handler
);
```

#### Step 2: Access User Context in Controller

```typescript
// src/controllers/my-controller.ts
import { AuthenticatedRequestWithRole } from '@/middleware/rbac';

export const handler = asyncHandler(
  async (req: AuthenticatedRequestWithRole, res: Response) => {
    // Authentication data (always available after authenticateUser middleware)
    const userId = req.user!.id;
    const userEmail = req.user!.email;

    // Authorization data (available when requireRole middleware is used)
    const shopName = req.user!.shop_name;  // Set by RBAC middleware
    const userRole = req.user!.role;        // Set by RBAC middleware

    // Get shop-specific data using shop_name from RBAC
    const data = await myService.getData(shopName);

    res.json({ data });
  }
);
```

**v2.0 Changes:**
- ✅ No need for `validateUserAccountAccess()` - RBAC middleware handles authorization
- ✅ Use `req.user.shop_name` (from RBAC) instead of `account_id`
- ✅ Use `AuthenticatedRequestWithRole` type when using RBAC middleware

#### Step 3: Error Handling (Automatic with RBAC)

```typescript
// With RBAC middleware, authorization errors are handled automatically
router.get(
  '/my-endpoint',
  authenticateUser,
  requireRole(['admin', 'editor']),  // Returns 403 if user lacks access
  myController.handler                // Only called if authorized
);

// In controller, you can focus on business logic
export const handler = asyncHandler(
  async (req: AuthenticatedRequestWithRole, res: Response) => {
    // No try-catch needed for authorization - RBAC already validated
    const data = await myService.getData(req.user!.shop_name);
    res.json({ data });
  }
);
```

### Best Practices

#### ✅ DO:

- **Always use `authenticateUser` middleware** on protected routes
- **Always use `requireRole()` middleware** for shop-based authorization (recommended)
- **Use `req.user.shop_name`** from RBAC middleware for shop-specific queries
- **Use `AuthenticatedRequestWithRole` type** when using RBAC middleware
- **Return `401`** for authentication failures
- **Return `403`** for authorization failures
- **Log security events** (failed auth, access denied) at WARNING level
- **Use `asyncHandler`** wrapper for async route handlers

#### ❌ DON'T:

- **Don't expect `req.user.account_id`** - it was removed in v2.0
- **Don't query accounts table in middleware** - authentication is JWT-only
- **Don't manually call `validateUserAccountAccess()`** in controllers - use RBAC middleware instead
- **Don't log sensitive data** (emails, tokens, passwords)
- **Don't implement custom JWT validation** - use Supabase Auth
- **Don't skip authentication** on endpoints that access user data

### TypeScript Types

```typescript
// Available types (v2.0)

import type { AuthenticatedRequest } from '@/middleware/auth';
import type { AuthenticatedRequestWithRole } from '@/middleware/rbac';

// Basic authentication (after authenticateUser middleware)
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;        // UUID from auth.users
    email: string;     // User's email
  };
}

// With RBAC authorization (after requireRole middleware)
interface AuthenticatedRequestWithRole extends Request {
  user: {
    id: string;           // UUID from auth.users
    email: string;        // User's email
    role: Role;           // User's role for the shop (set by RBAC)
    shop_name: string;    // Shop being accessed (set by RBAC)
  };
}

type Role = 'admin' | 'editor' | 'viewer';
```

### Testing Authentication

```typescript
// tests/helpers/auth.ts
import { supabaseConnection } from '@/database/supabase/connection';

export async function getTestAuthToken(email: string): Promise<string> {
  const supabase = supabaseConnection.getClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: 'test-password'
  });

  if (error) throw error;
  return data.session!.access_token;
}

// In tests
describe('Protected Endpoint', () => {
  it('should require authentication', async () => {
    const response = await request(app).get('/api/protected');
    expect(response.status).toBe(401);
  });

  it('should allow authenticated users', async () => {
    const token = await getTestAuthToken('test@example.com');

    const response = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
  });
});
```

---

## Code Examples

### Example 1: Simple Authenticated Route

```typescript
// src/routes/analytics.ts
import { Router } from 'express';
import { authenticateUser } from '@/middleware/auth';
import { getChannelPerformance } from '@/controllers/analytics';

const router = Router();

router.get(
  '/channel-performance',
  authenticateUser,
  getChannelPerformance
);

export default router;
```

### Example 2: Role-Based Access

```typescript
// src/routes/admin.ts
import { authenticateUser } from '@/middleware/auth';
import { requireRole } from '@/middleware/rbac';
import { adminController } from '@/controllers/admin';

router.post(
  '/users/invite',
  authenticateUser,
  requireRole(['admin']),  // Only admins can invite users
  adminController.inviteUser
);

router.get(
  '/reports',
  authenticateUser,
  requireRole(['admin', 'editor', 'viewer']),  // All roles
  adminController.getReports
);
```

### Example 3: Shop-Based Access with RBAC (v2.0)

```typescript
// src/controllers/analytics.ts
import { AuthenticatedRequestWithRole } from '@/middleware/rbac';

// Route definition
router.get(
  '/channel-performance',
  authenticateUser,
  requireAnyRole,  // Validates shop access via RBAC
  getChannelPerformance
);

// Controller implementation
export const getChannelPerformance = asyncHandler(
  async (req: AuthenticatedRequestWithRole, res: Response) => {
    // RBAC middleware has already validated shop access
    // shop_name is available from req.user
    const shopName = req.user!.shop_name;
    const accountId = req.query.account_id as string;

    // Fetch data using shop_name (recommended) or account_id (legacy support)
    const data = await analyticsService.getChannelPerformance(
      accountId,
      {
        startDate: req.query.start_date as string,
        endDate: req.query.end_date as string,
      }
    );

    res.json({ data });
  }
);
```

**v2.0 Benefits:**
- No manual `validateUserAccountAccess()` calls needed
- Authorization handled by RBAC middleware at route level
- Cleaner controller code focused on business logic

2. Invalid token signature
3. Token from different Supabase project
4. Missing `Authorization` header

**Solutions:**
```typescript
// Check token validity
const token = 'your-jwt-token';
const decoded = jwt.decode(token);
console.log('Token expires:', new Date(decoded.exp * 1000));
console.log('Token issued:', new Date(decoded.iat * 1000));

// Refresh token (client-side)
const { data, error } = await supabase.auth.refreshSession();
```

### Issue: "Account not found"

**Symptoms:** 403 Forbidden after successful authentication

**Causes:**
1. User has no account in `accounts` table
2. User-account relationship broken
3. User has multiple accounts (triggers different error)

**Solutions:**
```sql
-- Check if user has account
SELECT a.*
FROM accounts a
WHERE a.user_id = 'user-id-here';

-- Create account if missing
INSERT INTO accounts (user_id, name, type)
VALUES ('user-id', 'Account Name', 'shopify');
```

### Issue: "Multiple (or no) rows returned"

**Symptoms:** PostgreSQL error "JSON object requested, multiple (or no) rows returned"

**Likely Causes:**
- Using `.single()` query on a table that has multiple rows for a user
- Usually occurs in `validateUserAccountAccess()` utility or custom controllers
- May indicate legacy code that hasn't been updated to use RBAC middleware

**Solutions:**
1. **Use RBAC middleware** instead of manual validation:
   ```typescript
   // ✅ Recommended: Use RBAC middleware
   router.get('/endpoint', authenticateUser, requireAnyRole, controller);
   ```

2. **If using validateUserAccountAccess()**, ensure it's appropriate for your use case
3. **Check your query** - avoid `.single()` when multiple rows are expected

### Issue: "Insufficient permissions"

**Symptoms:** 403 Forbidden from `requireRole` middleware

**Causes:**
1. User has no role for the requested shop
2. User has viewer role but endpoint requires admin/editor
3. shop_name parameter missing or incorrect

**Solutions:**
```sql
-- Check user's roles
SELECT * FROM user_roles WHERE user_id = 'user-id';

-- Grant role
INSERT INTO user_roles (user_id, shop_name, role, created_by)
VALUES ('user-id', 'shop-name', 'admin', 'admin-user-id');
```

### Issue: Token works in development but not production

**Causes:**
1. Different Supabase projects (dev vs prod)
2. Different JWT secrets
3. Environment variables not set correctly

**Solutions:**
```bash
# Verify environment variables
echo $SUPABASE_URL
echo $SUPABASE_ANON_KEY
# DO NOT echo SUPABASE_SERVICE_ROLE_KEY in production logs

# Ensure matching Supabase project
# JWT from dev project won't work in prod project
```

### Debug Logging

**Enable verbose logging:**

```typescript
// src/middleware/auth.ts
logger.debug('Auth debug', {
  hasAuthHeader: !!req.headers.authorization,
  authHeaderPrefix: req.headers.authorization?.substring(0, 10),
  userId: user?.id,
  accountCount: accounts?.length,
});
```

**Check GCP logs:**

```bash
# View recent auth errors
gcloud logging read "resource.type=cloud_run_revision AND jsonPayload.message=~'Authentication failed'" --limit 50

# Filter by user
gcloud logging read "jsonPayload.userId='user-id-here'" --limit 20
```

---

## Related Documentation

- [Security Audit](./SECURITY_AUDIT.md) - Detailed security vulnerability analysis
- [API Documentation](../README.md) - General API usage
- [Database Schema](./DATABASE.md) - Complete database documentation
- [RBAC Guide](./RBAC.md) - Role-based access control details

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2025-11-16 | JWT-only authentication with RBAC authorization |

---

**For questions or issues, please contact the development team.**
