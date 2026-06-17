// Types for tables the ERP READS from the mill list's existing `public`
// schema. Only include the fields the ERP actually needs — this is a
// soft reference, not a full mirror of their types.ts. Do not add
// foreign keys from new ERP tables to these; store the id as a plain
// uuid column instead (see supabase/migrations/00001_create_erp_schema.sql).

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
