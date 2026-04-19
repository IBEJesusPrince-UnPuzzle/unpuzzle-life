import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
// @ts-ignore - no type declarations available
import BetterSqlite3SessionStore from "better-sqlite3-session-store";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import type { Express, Request, Response, NextFunction } from "express";
import { storage, sqlite } from "./storage";
import type { User } from "@shared/schema";

const SqliteStore = BetterSqlite3SessionStore(session);

declare global {
  namespace Express {
    interface User {
      id: number;
      email: string;
      displayName: string;
      role: string;
      status: string;
      impersonating?: boolean;
      originalUserId?: number;
    }
  }
}

declare module "express-session" {
  interface SessionData {
    originalUserId?: number;
    impersonatedUserId?: number;
  }
}

const SALT_ROUNDS = 12;

export function setupAuth(app: Express) {
  // Session configuration
  const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

  app.use(
    session({
      store: new SqliteStore({
        client: sqlite,
        expired: { clear: true, intervalMs: 900000 },
      }),
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        httpOnly: true,
        sameSite: "lax",
        secure: false, // Set to true behind HTTPS proxy
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  // Passport LocalStrategy
  passport.use(
    new LocalStrategy(
      { usernameField: "email", passwordField: "password" },
      async (email, password, done) => {
        try {
          const user = storage.getUserByEmail(email.toLowerCase().trim());
          if (!user) {
            return done(null, false, { message: "Invalid email or password" });
          }
          if (user.status !== "active") {
            return done(null, false, { message: "Account is not active" });
          }
          if (!user.passwordHash) {
            return done(null, false, { message: "Password login not available" });
          }
          const match = await bcrypt.compare(password, user.passwordHash);
          if (!match) {
            return done(null, false, { message: "Invalid email or password" });
          }
          // Update last login
          storage.updateUser(user.id, { lastLoginAt: new Date().toISOString() } as any);
          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
  );

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser((id: number, done) => {
    try {
      const user = storage.getUserById(id);
      if (!user) return done(null, false);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  // Seed: create Super Admin if no users exist
  seedSuperAdmin();

  // Auth routes
  registerAuthRoutes(app);
}

function seedSuperAdmin() {
  const email = (process.env.ADMIN_EMAIL || "ibejesusprince@gmail.com").toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(16).toString("hex");
  const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);

  const allUsers = storage.getAllUsers();

  if (allUsers.length === 0) {
    // First run — create Super Admin
    storage.createUser({
      email,
      passwordHash,
      displayName: "Super Admin",
      role: "super_admin",
      status: "active",
      createdAt: new Date().toISOString(),
    });

    if (!process.env.ADMIN_PASSWORD) {
      console.log(`\n=== Super Admin Created ===`);
      console.log(`Email: ${email}`);
      console.log(`Password: ${password}`);
      console.log(`(Set ADMIN_PASSWORD env var to use a fixed password)\n`);
    }
    return;
  }

  // Sync existing Super Admin with env vars (handles credential changes)
  if (process.env.ADMIN_EMAIL || process.env.ADMIN_PASSWORD) {
    const superAdmin = allUsers.find(u => u.role === "super_admin");
    if (superAdmin) {
      const needsUpdate = 
        (process.env.ADMIN_EMAIL && superAdmin.email !== email) ||
        (process.env.ADMIN_PASSWORD && !bcrypt.compareSync(password, superAdmin.passwordHash || ""));

      if (needsUpdate) {
        storage.updateUser(superAdmin.id, {
          email,
          passwordHash,
        } as any);
        console.log(`\n=== Super Admin Updated ===`);
        console.log(`Email: ${email}`);
        console.log(`Password synced from ADMIN_PASSWORD env var\n`);
      }
    }
  }
}

function registerAuthRoutes(app: Express) {
  // Login
  app.post("/api/auth/login", (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Login failed" });
      req.logIn(user, (err) => {
        if (err) return next(err);
        res.json({
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
        });
      });
    })(req, res, next);
  });

  // Register (invite-only)
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { email, password, displayName, token } = req.body;
      if (!email || !password || !token) {
        return res.status(400).json({ message: "Email, password, and invite token are required" });
      }

      const normalizedEmail = email.toLowerCase().trim();

      // Validate invitation
      const invitation = storage.getInvitationByToken(token);
      if (!invitation) {
        return res.status(400).json({ message: "Invalid invitation token" });
      }
      if (invitation.status !== "pending") {
        return res.status(400).json({ message: "Invitation has already been used" });
      }
      if (new Date(invitation.expiresAt) < new Date()) {
        return res.status(400).json({ message: "Invitation has expired" });
      }
      if (invitation.email.toLowerCase().trim() !== normalizedEmail) {
        return res.status(400).json({ message: "Email does not match the invitation" });
      }

      // Check if user already exists
      if (storage.getUserByEmail(normalizedEmail)) {
        return res.status(400).json({ message: "An account with this email already exists" });
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      const user = storage.createUser({
        email: normalizedEmail,
        passwordHash,
        displayName: displayName || normalizedEmail.split("@")[0],
        role: "user",
        status: "active",
        invitedBy: invitation.invitedBy,
        createdAt: new Date().toISOString(),
      });

      // Mark invitation as accepted
      storage.updateInvitation(invitation.id, { status: "accepted" });

      // Create default preferences for new user
      storage.updatePreferences(user.id, { displayName: user.displayName, timeFormat: "12h" });

      // Auto-login
      req.logIn(user, (err) => {
        if (err) return res.status(500).json({ message: "Registration succeeded but login failed" });
        res.json({
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
        });
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Registration failed" });
    }
  });

  // Logout
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      req.session.destroy(() => {
        res.json({ ok: true });
      });
    });
  });

  // Get current user
  app.get("/api/auth/me", (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.json(null);
    }
    const user = req.user!;
    const impersonating = !!req.session.impersonatedUserId;
    const effectiveUserId = req.session.impersonatedUserId || user.id;
    const effectiveUser = impersonating ? storage.getUserById(effectiveUserId) : user;

    res.json({
      id: effectiveUser?.id || user.id,
      email: effectiveUser?.email || user.email,
      displayName: effectiveUser?.displayName || user.displayName,
      role: user.role, // Always show the real user's role
      impersonating,
      originalUserId: impersonating ? user.id : undefined,
    });
  });

  // Change password
  app.post("/api/auth/change-password", requireAuth, async (req: Request, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current and new passwords are required" });
      }
      const user = storage.getUserById(req.user!.id);
      if (!user || !user.passwordHash) {
        return res.status(400).json({ message: "Cannot change password" });
      }
      const match = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!match) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }
      const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
      storage.updateUser(user.id, { passwordHash } as any);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to change password" });
    }
  });

  // Admin routes
  registerAdminRoutes(app);
}

function registerAdminRoutes(app: Express) {
  // List users
  app.get("/api/admin/users", requireAdmin, (_req: Request, res: Response) => {
    const allUsers = storage.getAllUsers().map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      status: u.status,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
    }));
    res.json(allUsers);
  });

  // Update user role/status
  app.patch("/api/admin/users/:id", requireAdmin, (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const { role, status } = req.body;
    const update: any = {};
    if (role !== undefined) update.role = role;
    if (status !== undefined) update.status = status;
    const result = storage.updateUser(id, update);
    if (!result) return res.status(404).json({ message: "User not found" });
    res.json({
      id: result.id,
      email: result.email,
      displayName: result.displayName,
      role: result.role,
      status: result.status,
    });
  });

  // Create invitation
  app.post("/api/admin/invitations", requireAdmin, (req: Request, res: Response) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    if (storage.getUserByEmail(normalizedEmail)) {
      return res.status(400).json({ message: "A user with this email already exists" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const invitation = storage.createInvitation({
      email: normalizedEmail,
      token,
      invitedBy: req.user!.id,
      status: "pending",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    });
    res.json(invitation);
  });

  // List invitations
  app.get("/api/admin/invitations", requireAdmin, (_req: Request, res: Response) => {
    res.json(storage.getInvitations());
  });

  // Delete invitation
  app.delete("/api/admin/invitations/:id", requireAdmin, (req: Request, res: Response) => {
    storage.deleteInvitation(Number(req.params.id));
    res.json({ ok: true });
  });

  // Reset user password (admin only)
  app.post("/api/admin/users/:id/reset-password", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const { newPassword } = req.body;
      if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ message: "New password must be at least 8 characters" });
      }
      const target = storage.getUserById(id);
      if (!target) return res.status(404).json({ message: "User not found" });
      const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
      storage.updateUser(id, { passwordHash } as any);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to reset password" });
    }
  });

  // Impersonate user
  app.post("/api/admin/impersonate/:id", requireAdmin, (req: Request, res: Response) => {
    const targetId = Number(req.params.id);
    const target = storage.getUserById(targetId);
    if (!target) return res.status(404).json({ message: "User not found" });

    req.session.originalUserId = req.user!.id;
    req.session.impersonatedUserId = targetId;

    res.json({
      id: target.id,
      email: target.email,
      displayName: target.displayName,
      role: target.role,
      impersonating: true,
    });
  });

  // Stop impersonating
  app.post("/api/admin/stop-impersonating", requireAuth, (req: Request, res: Response) => {
    delete req.session.impersonatedUserId;
    delete req.session.originalUserId;
    const user = req.user!;
    res.json({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      impersonating: false,
    });
  });
}

// Middleware exports
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated() || req.user!.role !== "super_admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
}

// Helper to get the effective userId (supports impersonation)
export function getEffectiveUserId(req: Request): number {
  if (req.session.impersonatedUserId) {
    return req.session.impersonatedUserId;
  }
  return req.user!.id;
}
