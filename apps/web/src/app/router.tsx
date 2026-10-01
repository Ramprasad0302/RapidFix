import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate, Outlet, ScrollRestoration, type RouteObject } from 'react-router';
import { ADMIN_ROLES, Role } from '@fixora/shared-types';
import { CenteredSpinner } from '../components/States';
import { AreaFrame, CustomerArea, RequireRole, StripCustomerPrefix } from './guards';
import { RouteError } from './RouteError';

/** Code-split route: each page loads only when first visited. */
function page<M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M): Pick<RouteObject, 'lazy'> {
  return { lazy: async () => ({ Component: (await load())[name] as ComponentType }) };
}

const customer = (m: string) => import(`../features/customer/pages/${m}.tsx`);
const booking = (m: string) => import(`../features/customer/booking/${m}.tsx`);
const tech = (m: string) => import(`../features/technician/pages/${m}.tsx`);
const admin = (m: string) => import(`../features/admin/pages/${m}.tsx`);
const chat = () => import('../features/chat/ChatPage');
const invoice = () => import('../features/invoice/InvoicePage');
const techAccount = () => import('../features/technician/pages/AccountPages');

export const router = createBrowserRouter([
  {
    // New pages start at the top; Back restores the previous scroll position.
    element: (
      <>
        <ScrollRestoration />
        <Outlet />
      </>
    ),
    errorElement: <RouteError />,
    hydrateFallbackElement: <CenteredSpinner />,
    children: [
      { path: '/login', ...page(() => import('../features/auth/LoginPage'), 'LoginPage') },
      { path: '/partner', ...page(() => import('../features/partner/PartnerRegisterPage'), 'PartnerRegisterPage') },
      { path: '/delete-account', ...page(() => import('../features/auth/DeleteAccountPage'), 'DeleteAccountPage') },

      // ── Customer (guest-first) ───────────────────────────────────────
      {
        element: <CustomerArea />,
        children: [
          {
            ...page(() => import('../features/customer/CustomerTabsLayout'), 'CustomerTabsLayout'),
            children: [
              { index: true, ...page(() => customer('HomePage'), 'HomePage') },
              { path: 'bookings', ...page(() => customer('BookingsPage'), 'BookingsPage') },
              { path: 'offers', ...page(() => customer('OffersPage'), 'OffersPage') },
              { path: 'account', ...page(() => customer('AccountPage'), 'AccountPage') },
            ],
          },
          { path: 'welcome', ...page(() => customer('CompleteProfilePage'), 'CompleteProfilePage') },
          { path: 'search', ...page(() => customer('SearchPage'), 'SearchPage') },
          { path: 'location', ...page(() => customer('ConfirmLocationPage'), 'ConfirmLocationPage') },
          { path: 'services', element: <Navigate to="/book" replace /> },
          { path: 'offers/:code', ...page(() => customer('OfferDetailsPage'), 'OfferDetailsPage') },
          { path: 'help', ...page(() => customer('InfoPages'), 'HelpPage') },
          { path: 'about', ...page(() => customer('CompanyPages'), 'AboutPage') },
          { path: 'terms', ...page(() => customer('CompanyPages'), 'TermsPage') },
          { path: 'privacy', ...page(() => customer('InfoPages'), 'PrivacyPage') },

          // Booking flow — open to guests until the final confirm step.
          {
            path: 'book',
            children: [
              { index: true, ...page(() => booking('SelectCategoryPage'), 'SelectCategoryPage') },
              { path: 'c/:slug', ...page(() => booking('SelectServicePage'), 'SelectServicePage') },
              { path: 's/:slug', ...page(() => booking('ServiceStepPage'), 'ServiceStepPage') },
              { path: 'details', ...page(() => booking('DetailsStepPage'), 'DetailsStepPage') },
              { path: 'address', ...page(() => booking('AddressStepPage'), 'AddressStepPage') },
              { path: 'schedule', ...page(() => booking('ScheduleStepPage'), 'ScheduleStepPage') },
              { path: 'review', ...page(() => booking('ReviewStepPage'), 'ReviewStepPage') },
            ],
          },

          // Private customer pages.
          {
            element: <RequireRole roles={[Role.CUSTOMER]} />,
            children: [
              { path: 'book/confirmed/:id', ...page(() => booking('BookingConfirmedPage'), 'BookingConfirmedPage') },
              { path: 'bookings/:id', ...page(() => customer('BookingDetailsPage'), 'BookingDetailsPage') },
              { path: 'bookings/:id/chat', ...page(chat, 'CustomerChatPage') },
              { path: 'bookings/:id/invoice', ...page(invoice, 'CustomerInvoicePage') },
              { path: 'account/edit', ...page(() => customer('EditProfilePage'), 'EditProfilePage') },
              { path: 'account/addresses', ...page(() => customer('AddressesPage'), 'AddressesPage') },
              { path: 'account/addresses/:id', ...page(() => customer('AddressEditPage'), 'AddressEditPage') },
              { path: 'account/refer', ...page(() => customer('InfoPages'), 'ReferPage') },
              { path: 'account/payments', ...page(() => customer('InfoPages'), 'PaymentMethodsPage') },
              { path: 'notifications', ...page(() => customer('NotificationsPage'), 'NotificationsPage') },
            ],
          },
        ],
      },
      { path: '/customer/*', element: <StripCustomerPrefix /> },

      // ── Technician ───────────────────────────────────────────────────
      {
        path: '/technician',
        element: <RequireRole roles={[Role.TECHNICIAN]} />,
        children: [
          {
            element: <AreaFrame area="technician" />,
            children: [
              {
                ...page(() => import('../features/technician/TechnicianLayout'), 'TechnicianLayout'),
                children: [
                  { index: true, ...page(() => tech('DashboardPage'), 'DashboardPage') },
                  { path: 'bookings', ...page(() => tech('JobsPage'), 'JobsPage') },
                  { path: 'earnings', ...page(() => tech('EarningsPage'), 'EarningsPage') },
                  { path: 'profile', ...page(() => tech('ProfilePage'), 'ProfilePage') },
                ],
              },
              { path: 'jobs/:id', ...page(() => tech('JobDetailsPage'), 'JobDetailsPage') },
              { path: 'jobs/:id/chat', ...page(chat, 'TechnicianChatPage') },
              { path: 'jobs/:id/invoice', ...page(invoice, 'TechnicianInvoicePage') },
              { path: 'profile/edit', ...page(techAccount, 'ProfileDetailsPage') },
              { path: 'payout-details', ...page(techAccount, 'PayoutDetailsPage') },
              { path: 'documents', ...page(techAccount, 'DocumentsPage') },
              { path: 'reviews', ...page(techAccount, 'ReviewsPage') },
              { path: 'performance', ...page(techAccount, 'PerformancePage') },
              { path: 'notifications', ...page(() => customer('NotificationsPage'), 'NotificationsPage') },
              { path: 'help', ...page(() => customer('InfoPages'), 'HelpPage') },
            ],
          },
        ],
      },

      // ── Admin ────────────────────────────────────────────────────────
      {
        path: '/admin',
        element: <RequireRole roles={ADMIN_ROLES} />,
        children: [
          {
            ...page(() => import('../features/admin/AdminLayout'), 'AdminLayout'),
            children: [
              { index: true, ...page(() => admin('DashboardPage'), 'DashboardPage') },
              { path: 'users', ...page(() => admin('UsersRolesPage'), 'UsersRolesPage') },
              { path: 'bookings', ...page(() => admin('BookingsPage'), 'BookingsPage') },
              { path: 'customers', ...page(() => admin('CustomersPage'), 'CustomersPage') },
              { path: 'technicians', ...page(() => admin('TechniciansPage'), 'TechniciansPage') },
              { path: 'services', ...page(() => admin('CatalogPages'), 'ServicesPage') },
              { path: 'categories', ...page(() => admin('CatalogPages'), 'CategoriesPage') },
              { path: 'offers', ...page(() => admin('CatalogPages'), 'OffersPage') },
              { path: 'payments', ...page(() => admin('FinancePages'), 'PaymentsPage') },
              { path: 'payouts', ...page(() => admin('FinancePages'), 'PayoutsPage') },
              { path: 'reviews', ...page(() => admin('PlatformPages'), 'ReviewsPage') },
              { path: 'complaints', ...page(() => admin('PlatformPages'), 'ComplaintsPage') },
              { path: 'notifications', ...page(() => admin('PlatformPages'), 'NotificationsPage') },
              { path: 'reports', ...page(() => admin('PlatformPages'), 'ReportsPage') },
              { path: 'settings', ...page(() => admin('PlatformPages'), 'SettingsPage') },
              { path: 'service-area', ...page(() => admin('ServiceAreaPage'), 'ServiceAreaPage') },
              { path: 'audit-logs', ...page(() => admin('PlatformPages'), 'AuditLogsPage') },
              { path: 'system-settings', ...page(() => admin('PlatformPages'), 'SystemSettingsPage') },
              { path: '*', element: <Navigate to="/admin" replace /> },
            ],
          },
        ],
      },

      { path: '*', ...page(() => import('./NotFoundPage'), 'NotFoundPage') },
    ],
  },
]);
