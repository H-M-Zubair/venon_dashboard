// src/routes/auth.ts (or wherever your auth routes are)
import { Router, Request, Response } from 'express';
import { supabaseConnection } from '@/database/supabase/connection';

const router = Router();

// Temporary endpoint for getting tokens during development
// ⚠️ Remove or protect this in production!
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required',
        usage: {
          method: 'POST',
          body: {
            email: 'your-email@example.com',
            password: 'your-password',
          },
        },
      });
    }

    const supabase = supabaseConnection.getServiceClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(401).json({
        error: 'Login failed',
        message: error.message,
      });
    }

    // Return token and user info
    res.json({
      success: true,
      access_token: data.session?.access_token,
      refresh_token: data.session?.refresh_token,
      expires_at: data.session?.expires_at,
      expires_in: data.session?.expires_in,
      user: {
        id: data.user?.id,
        email: data.user?.email,
        role: data.user?.role,
      },
      usage: {
        postman: `Bearer ${data.session?.access_token}`,
        header: 'Authorization: Bearer <access_token>',
      },
    });
  } catch (err: any) {
    res.status(500).json({
      error: 'Internal server error',
      message: err.message,
    });
  }
});

export default router;
