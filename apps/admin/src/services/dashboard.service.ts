import { unwrap } from '@fixora/web-core';
import { api } from './api';

export interface DashboardSummary {
  kpis: {
    totalCustomers: number;
    totalTechnicians: number;
    totalBookings: number;
    /** paise */
    totalRevenue: number;
  };
}

export const getDashboard = () => unwrap<DashboardSummary>(api.get('/admin/dashboard'));
