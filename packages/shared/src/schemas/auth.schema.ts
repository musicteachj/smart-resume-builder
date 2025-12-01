import { z } from "zod";

export const PasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[0-9]/, "Password must include a number");

export const RegisterSchema = z
  .object({
    name: z.string().min(1).max(100),
    email: z.string().email(),
    password: PasswordSchema,
    confirmPassword: z.string(),
  })
  .refine(
    (data: { password: string; confirmPassword: string }) =>
      data.password === data.confirmPassword,
    {
      message: "Passwords must match",
      path: ["confirmPassword"],
    }
  );

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
