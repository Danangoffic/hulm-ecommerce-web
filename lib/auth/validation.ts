import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().check(z.email("Invalid email address")),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password too long") // bcrypt max
    .refine((v) => /[A-Z]/.test(v), "Password must contain at least one uppercase letter")
    .refine((v) => /\d/.test(v), "Password must contain at least one number"),
});

export const loginSchema = z.object({
  email: z.string().check(z.email("Invalid email address")),
  password: z.string().min(1, "Password is required"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
