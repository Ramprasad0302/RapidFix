import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate, Outlet, ScrollRestoration, type RouteObject } from 'react-router';
import { ADMIN_ROLES, Role } from '@fixora/shared-types';
import { CenteredSpinner } from '../components/States';
import { CustomerArea, RequireRole, StripCustomerPrefix } from './guards';
import { RouteError } from './RouteError';

/** Code-split route: each page loads only when first visited. */
function page<M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M): Pick<RouteObject, 'lazy'> {
  return { lazy: async () => ({ Component: (await load())[name] as ComponentType }) };
}

const customer = (m: string) => import(`../features/customer/pages/${m}.tsx`);
const booking = (m: string) => import(`../features/customer/booking/${m}.tsx`);
const tech = (m: string) => import(`../features/technician/pages/${m}.tsx`);
const admin = (m: string) => import(`../features/admin/pages/${m}.tsx`);

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
          { path: 'search', ...page(() => customer('SearchPage'), 'SearchPage') },
          { path: 'location', ...page(() => customer('ConfirmLocationPage'), 'ConfirmLocationPage') },
          { path: 'services', element: <Navigate to="/book" replace /> },
          { path: 'offers/:code', ...page(() => customer('OfferDetailsPage'), 'OfferDetailsPage') },
          { path: 'help', ...page(() => customer('InfoPages'), 'HelpPage') },
          { path: 'about', ...page(() => customer('InfoPages'), 'AboutPage') },
          { path: 'terms', ...page(() => customer('InfoPages'), 'TermsPage') },
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
            ...page(() => import('../features/technician/TechnicianLayout'), 'TechnicianLayout'),
            children: [
              { index: true, ...page(() => tech('DashboardPage'), 'DashboardPage') },
              { path: 'bookings', ...page(() => tech('JobsPage'), 'JobsPage') },
              { path: 'earnings', ...page(() => tech('EarningsPage'), 'EarningsPage') },
              { path: 'profile', ...page(() => tech('ProfilePage'), 'ProfilePage') },
            ],
          },
          { path: 'jobs/:id', ...page(() => tech('JobDetailsPage'), 'JobDetailsPage') },
          { path: 'notifications', ...page(() => customer('NotificationsPage'), 'NotificationsPage') },
          { path: 'help', ...page(() => customer('InfoPages'), 'HelpPage') },
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
              { path: ':section', ...page(() => admin('ComingSoonPage'), 'ComingSoonPage') },
            ],
          },
        ],
      },

      { path: '*', ...page(() => import('./NotFoundPage'), 'NotFoundPage') },
    ],
  },
]);
