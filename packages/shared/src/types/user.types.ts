import type { Resume } from "./resume.types";

export interface AIUsage {
  aiCallsToday: number;
  aiCallsThisMonth: number;
  dailyLimit: number;
  monthlyLimit: number;
  lastAiCallDate?: string | null;
  lastMonthReset: string;
  isAdmin: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  googleId?: string | null;
  password?: string | null;
  aiCallsToday: number;
  aiCallsThisMonth: number;
  lastAiCallDate?: string | null;
  lastMonthReset: string;
  isAdmin: boolean;
  createdAt: string;
  updatedAt: string;
  resumes?: Resume[];
}

export interface AuthResponse {
  token: string;
  user: User;
}
