import { Navigate, createBrowserRouter } from "react-router-dom";
import { App } from "../App";
import { AppShell } from "../components/layout/AppShell";
import { authStore } from "../context/AuthContext";
import { ForgotPasswordPage } from "../pages/auth/ForgotPasswordPage";
import { LoginPage } from "../pages/auth/LoginPage";
import { RegisterPage } from "../pages/auth/RegisterPage";
import { LandingPage } from "../pages/marketing/LandingPage";
import { ApplicationsPage } from "../pages/member/ApplicationsPage";
import { ConnectionsPage } from "../pages/member/ConnectionsPage";
import { FeedPage } from "../pages/member/FeedPage";
import { InvitationsManagementPage } from "../pages/member/InvitationsManagementPage";
import { JobDetailPage } from "../pages/member/JobDetailPage";
import { JobSearchPage } from "../pages/member/JobSearchPage";
import { SearchResultsPage } from "../pages/member/SearchResultsPage";
import { MemberDashboardPage } from "../pages/member/MemberDashboardPage";
import { ProfilePage } from "../pages/member/ProfilePage";
import { ProfileSectionDetailsPage } from "../pages/member/ProfileSectionDetailsPage";
import { PublicProfileSlugPage } from "../pages/member/PublicProfileSlugPage";
import { SavedJobsPage } from "../pages/member/SavedJobsPage";
import { MessagesPage } from "../pages/messages/MessagesPage";
import { AIHiringPage } from "../pages/recruiter/AIHiringPage";
import { ApplicantReviewPage } from "../pages/recruiter/ApplicantReviewPage";
import { JobManagementPage } from "../pages/recruiter/JobManagementPage";
import { RecruiterDashboardPage } from "../pages/recruiter/RecruiterDashboardPage";
import { RecruiterProfilePage } from "../pages/recruiter/RecruiterProfilePage";
import type { UserRole } from "../types/common";
import { getHomePath } from "../utils/navigation";

function RootPage() {
  const { token, role } = authStore.getState();
  if (token) {
    return <Navigate to={getHomePath(role)} replace />;
  }
  return <LandingPage />;
}

function ProtectedRoute({ children, allowedRoles }: { children: JSX.Element; allowedRoles?: UserRole[] }) {
  const { token, role } = authStore.getState();
  if (!token) return <Navigate to="/login" replace />;
  if (allowedRoles?.length && (!role || !allowedRoles.includes(role))) {
    return <Navigate to={getHomePath(role)} replace />;
  }
  return children;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <RootPage /> },
      { path: "/login", element: <LoginPage /> },
      { path: "/forgot-password", element: <ForgotPasswordPage /> },
      { path: "/register", element: <RegisterPage /> },
      {
        element: (
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        ),
        children: [
          { path: "/connections", element: <ConnectionsPage /> },
          { path: "/my-network/invitations", element: <InvitationsManagementPage /> },
          { path: "/messages", element: <MessagesPage /> },
          { path: "/search", element: <SearchResultsPage /> },
          { path: "/profile/:member_id", element: <ProfilePage /> },
          { path: "/in/:profile_slug", element: <PublicProfileSlugPage /> },
          { path: "/recruiters/:recruiter_id", element: <RecruiterProfilePage /> },

          { path: "/ai-test/:job_id", element: <AIHiringPage /> }
        ]
      },
      {
        element: (
          <ProtectedRoute allowedRoles={["member", "recruiter"]}>
            <AppShell />
          </ProtectedRoute>
        ),
        children: [
          { path: "/jobs", element: <JobSearchPage /> },
          { path: "/jobs/:job_id", element: <JobDetailPage /> }
        ]
      },
      {
        element: (
          <ProtectedRoute allowedRoles={["member"]}>
            <AppShell />
          </ProtectedRoute>
        ),
        children: [
          { path: "/feed", element: <FeedPage /> },
          { path: "/profile/:member_id/details/:section", element: <ProfileSectionDetailsPage /> },
          { path: "/saved-jobs", element: <SavedJobsPage /> },
          { path: "/applications", element: <ApplicationsPage /> },
          { path: "/dashboard", element: <MemberDashboardPage /> }
        ]
      },
      {
        element: (
          <ProtectedRoute allowedRoles={["recruiter"]}>
            <AppShell />
          </ProtectedRoute>
        ),
        children: [
          { path: "/recruiter/dashboard", element: <RecruiterDashboardPage /> },
          { path: "/recruiter/jobs", element: <JobManagementPage /> },
          { path: "/recruiter/jobs/:job_id/applicants", element: <ApplicantReviewPage /> },
          { path: "/recruiter/ai/:job_id", element: <AIHiringPage /> }
        ]
      }
    ]
  }
]);