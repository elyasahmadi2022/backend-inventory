import type { Request } from "express";

export type AuthUser = {
  id: string;
  sessionId: string;
  username: string;
  email: string | null;
  fullName: string;
  permissions: string[];
  roles: string[];
};

export type AuthRequest = Request & {
  user?: AuthUser;
};
