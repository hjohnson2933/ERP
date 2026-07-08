import type { Role } from "@/lib/auth/roles";

export interface Profile {
  id: string;
  full_name: string;
  initials: string;
  role: Role;
  active: boolean;
  created_at: string;
}

export type JobStatus = "hold" | "partial" | "approval" | "ready" | "inmill" | "complete";

export interface Job {
  id: string;
  job_number: string;
  client: string;
  title: string;
  install_date: string | null;
  status: JobStatus;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}
