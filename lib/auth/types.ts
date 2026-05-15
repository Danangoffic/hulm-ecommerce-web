export type Role = "customer" | "admin" | "super_admin";

export interface JwtPayload {
  sub: string;   // user id
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
}

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}
