import {
  CheckCircle2,
  Clock3,
  FileText,
  RefreshCw,
  Settings2,
  XCircle,
} from "lucide-react";

import type { Metric, StatusBreakdown, TrendPoint } from "@/types/dashboard";

export const adminMetrics: readonly Metric[] = [
  {
    label: "Total Applications",
    value: "1,248",
    detail: "vs last month",
    trend: "12%",
    tone: "blue",
    icon: FileText,
  },
  {
    label: "Pending",
    value: "320",
    detail: "vs last month",
    trend: "5%",
    tone: "amber",
    icon: Clock3,
  },
  {
    label: "With Job Order",
    value: "276",
    detail: "vs last month",
    trend: "8%",
    tone: "blue",
    icon: FileText,
  },
  {
    label: "Ongoing",
    value: "418",
    detail: "vs last month",
    trend: "14%",
    tone: "indigo",
    icon: Settings2,
  },
  {
    label: "Installed",
    value: "234",
    detail: "vs last month",
    trend: "20%",
    tone: "green",
    icon: CheckCircle2,
  },
];

export const adminTrend: readonly TrendPoint[] = [
  { label: "Nov 2024", applications: 98 },
  { label: "Dec 2024", applications: 132 },
  { label: "Jan 2025", applications: 176 },
  { label: "Feb 2025", applications: 201 },
  { label: "Mar 2025", applications: 189 },
  { label: "Apr 2025", applications: 248 },
];

export const adminStatus: readonly StatusBreakdown[] = [
  { label: "Pending", value: 320, tone: "amber" },
  { label: "With Job Order", value: 276, tone: "blue" },
  { label: "Ongoing", value: 418, tone: "indigo" },
  { label: "Installed", value: 234, tone: "green" },
];

export const adminApplications = [
  {
    customer: "Maria Santos",
    address: "Quezon City, Metro Manila",
    agent: "John Dela Cruz",
    processor: "Ana Reyes",
    status: "Installed",
    date: "Apr 22, 2025",
  },
  {
    customer: "Ramon Villanueva",
    address: "Makati City, Metro Manila",
    agent: "Cris Lagonoy",
    processor: "Mark Taneo",
    status: "Ongoing",
    date: "Apr 21, 2025",
  },
  {
    customer: "Jessa Lim",
    address: "Taguig City, Metro Manila",
    agent: "John Dela Cruz",
    processor: "Ana Reyes",
    status: "With Job Order",
    date: "Apr 21, 2025",
  },
  {
    customer: "Michael Tan",
    address: "Pasig City, Metro Manila",
    agent: "Leah Mendoza",
    processor: "Mark Taneo",
    status: "Pending",
    date: "Apr 20, 2025",
  },
  {
    customer: "Kristine Flores",
    address: "Mandaluyong City, Metro Manila",
    agent: "Cris Lagonoy",
    processor: "Ana Reyes",
    status: "Installed",
    date: "Apr 19, 2025",
  },
] as const;

export const agentMetrics: readonly Metric[] = [
  {
    label: "My Applications",
    value: "28",
    detail: "Total submissions",
    tone: "blue",
    icon: FileText,
  },
  {
    label: "Pending",
    value: "10",
    detail: "Awaiting processing",
    tone: "amber",
    icon: Clock3,
  },
  {
    label: "Ongoing",
    value: "9",
    detail: "In progress",
    tone: "blue",
    icon: RefreshCw,
  },
  {
    label: "Installed",
    value: "8",
    detail: "Successfully completed",
    tone: "green",
    icon: CheckCircle2,
  },
  {
    label: "Cancelled",
    value: "1",
    detail: "Did not proceed",
    tone: "red",
    icon: XCircle,
  },
];

export const agentStatus: readonly StatusBreakdown[] = [
  { label: "Pending", value: 10, tone: "amber" },
  { label: "Ongoing", value: 9, tone: "blue" },
  { label: "Installed", value: 8, tone: "green" },
  { label: "Cancelled", value: 1, tone: "red" },
];

export const agentTrend: readonly TrendPoint[] = [
  {
    label: "Jan",
    applications: 4,
    pending: 1,
    ongoing: 3,
    installed: 4,
    cancelled: 0,
  },
  {
    label: "Feb",
    applications: 7,
    pending: 2,
    ongoing: 5,
    installed: 7,
    cancelled: 0,
  },
  {
    label: "Mar",
    applications: 9,
    pending: 3,
    ongoing: 7,
    installed: 9,
    cancelled: 1,
  },
  {
    label: "Apr",
    applications: 11,
    pending: 4,
    ongoing: 7,
    installed: 11,
    cancelled: 2,
  },
  {
    label: "May",
    applications: 14,
    pending: 9,
    ongoing: 12,
    installed: 16,
    cancelled: 2,
  },
  {
    label: "Jun",
    applications: 18,
    pending: 12,
    ongoing: 15,
    installed: 18,
    cancelled: 2,
  },
];

export const agentSubmissions = [
  {
    applicant: "Juan Dela Cruz",
    plan: "GFiber Unli 1499",
    status: "Installed",
    date: "Jun 12, 2024",
  },
  {
    applicant: "Ana Reyes",
    plan: "GFiber Unli 1299",
    status: "Ongoing",
    date: "Jun 11, 2024",
  },
  {
    applicant: "Mark Villanueva",
    plan: "GFiber Unli 1699",
    status: "Pending",
    date: "Jun 10, 2024",
  },
  {
    applicant: "Kristine Lopez",
    plan: "GFiber Unli 1299",
    status: "Installed",
    date: "Jun 8, 2024",
  },
  {
    applicant: "Ramon Santiago",
    plan: "GFiber Unli 999",
    status: "Ongoing",
    date: "Jun 7, 2024",
  },
] as const;

export const processorMetrics: readonly Metric[] = [
  {
    label: "Assigned Applications",
    value: "124",
    detail: "Assigned to you",
    tone: "blue",
    icon: FileText,
  },
  {
    label: "For Processing",
    value: "48",
    detail: "Needs attention",
    tone: "amber",
    icon: Clock3,
  },
  {
    label: "With Job Order",
    value: "32",
    detail: "Ready to move",
    tone: "blue",
    icon: FileText,
  },
  {
    label: "Ongoing",
    value: "28",
    detail: "In progress",
    tone: "indigo",
    icon: RefreshCw,
  },
  {
    label: "Installed",
    value: "16",
    detail: "Completed",
    tone: "green",
    icon: CheckCircle2,
  },
];

export const processorQueue = [
  {
    applicant: "Maria Santos",
    city: "Quezon City",
    agent: "Kevin Reyes",
    partner: "KRL Telecom",
    plan: "GFiber Unli 1299",
    speed: "100 Mbps",
    status: "For Processing",
    date: "Apr 27, 2025",
    time: "10:24 AM",
  },
  {
    applicant: "John Carlo Dela Cruz",
    city: "Makati City",
    agent: "Rhea Mendoza",
    partner: "ConnectNow PH",
    plan: "GFiber Unli 1699",
    speed: "300 Mbps",
    status: "With Job Order",
    date: "Apr 26, 2025",
    time: "03:17 PM",
  },
  {
    applicant: "Angela Reyes",
    city: "Pasig City",
    agent: "Mark Villanueva",
    partner: "FiberLink",
    plan: "GFiber Unli 1299",
    speed: "100 Mbps",
    status: "For Processing",
    date: "Apr 26, 2025",
    time: "11:03 AM",
  },
  {
    applicant: "Daniel Lim",
    city: "Mandaluyong City",
    agent: "Kristine Salazar",
    partner: "Globe Partner",
    plan: "GFiber Unli 2499",
    speed: "500 Mbps",
    status: "With Job Order",
    date: "Apr 25, 2025",
    time: "04:21 PM",
  },
  {
    applicant: "Nicole Garcia",
    city: "Taguig City",
    agent: "Paolo Santos",
    partner: "NextGen PH",
    plan: "GFiber Unli 1299",
    speed: "100 Mbps",
    status: "Ongoing",
    date: "Apr 25, 2025",
    time: "01:08 PM",
  },
  {
    applicant: "Ramon Bautista",
    city: "Parañaque City",
    agent: "Leah Cruz",
    partner: "Metro Connect",
    plan: "GFiber Unli 1699",
    speed: "300 Mbps",
    status: "For Processing",
    date: "Apr 24, 2025",
    time: "09:12 AM",
  },
  {
    applicant: "Criselda Tan",
    city: "Manila City",
    agent: "Adrian Torres",
    partner: "Globe Partners",
    plan: "GFiber Unli 2499",
    speed: "500 Mbps",
    status: "Ongoing",
    date: "Apr 24, 2025",
    time: "11:46 AM",
  },
  {
    applicant: "Miguel Santos",
    city: "Pasay City",
    agent: "Bianca Reyes",
    partner: "ClickNet",
    plan: "GFiber Unli 1299",
    speed: "100 Mbps",
    status: "Installed",
    date: "Apr 23, 2025",
    time: "05:33 PM",
  },
] as const;

export const processorProductivity = [
  { label: "Mon", applications: 11 },
  { label: "Tue", applications: 15 },
  { label: "Wed", applications: 20 },
  { label: "Thu", applications: 26 },
  { label: "Fri", applications: 26 },
  { label: "Sat", applications: 32 },
  { label: "Sun", applications: 25 },
] as const;
