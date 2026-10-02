import { Navigate, createBrowserRouter } from "react-router-dom";
import { AccountPage, ConsentOnboardingPage, DashboardPage, NotificationsPage, ReportPage } from "../features/account/AccountPages";
import { LoginScreen } from "../features/auth/LoginScreen";
import { GoogleCallbackPage, RegisterPage } from "../features/auth/RegisterPage";
import { BookPage } from "../features/booking/BookPage";
import { BookingDetailPage, MyBookingsPage } from "../features/booking/BookingPages";
import { ConversationPage } from "../features/chat/ConversationPage";
import {
  LibraryAdminPage, OrganizationsAdminPage, ProvidersAdminPage, ReportsAdminPage, SafetyAlertsPage, StaffIndex, StaffLayout, UsersAdminPage,
  VerificationQueuePage,
} from "../features/coordinator-portal/StaffPortal";
import { RuqyahDuasAdminPage } from "../features/coordinator-portal/RuqyahDuasAdmin";
import { CompanionEmergencyAdminPage, CompanionPlansAdminPage, CompanionStatsPage } from "../features/coordinator-portal/CompanionAdmin";
import { DirectoryPage, OrganizationPage, ProviderPage } from "../features/directory/DirectoryPages";
import { FavoritesPage, LibraryPage, PublicSharePage } from "../features/library/LibraryPages";
import { HealthHubPage } from "../features/health/HealthPages";
import { RuqyahCollectionPage, RuqyahGuidePage, RuqyahHubPage } from "../features/ruqyah/RuqyahPages";
import { MyRecommendationsPage } from "../features/patient-care/MyRecommendations";
import { CaseNoteEditor, RecommendationComposer } from "../features/patient-care/ProviderEditors";
import {
  OfferingsPage, ProviderBookingWorkspace, ProviderBookingsPage, ProviderPortalLayout, ProviderProfilePage, SlotsPage,
} from "../features/provider-portal/ProviderPortal";
import { ProviderUpgradePage } from "../features/provider-upgrade/ProviderUpgradePage";
import { HomePage } from "../features/public/HomePage";
import { AboutVerificationPage, EmergencyPage, PrivacyPage, TermsPage } from "../features/public/StaticPages";
import { RequireAuth, RequireRole } from "./guards";
import { AppLayout, PublicShareLayout } from "./layout/AppLayout";
import { NotFoundPage } from "./NotFoundPage";

const auth = (el: React.ReactNode) => <RequireAuth>{el}</RequireAuth>;

export const router = createBrowserRouter([
  // شاشة الدخول بتخطيط مستقل (المصباح)
  { path: "/login", element: <LoginScreen /> },

  // صفحة المشاركة العامة: خارج أي حارس، بلا عناصر الواجهة المصادَقة (10 §10.7)
  { element: <PublicShareLayout />, children: [{ path: "/public/shared/:shortCode", element: <PublicSharePage /> }] },

  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/register", element: <RegisterPage /> },
      { path: "/auth/callback", element: <GoogleCallbackPage /> },
      { path: "/directory", element: <DirectoryPage /> },
      { path: "/providers/:id", element: <ProviderPage /> },
      { path: "/organizations/:id", element: <OrganizationPage /> },
      { path: "/emergency", element: <EmergencyPage /> },
      // الرقية والتحصين المكتوبة: عامة بلا تسجيل (محتوى ثابت، لا بيانات مستخدم)
      { path: "/ruqyah", element: <RuqyahHubPage /> },
      { path: "/ruqyah/guide/:guideId", element: <RuqyahGuidePage /> },
      { path: "/ruqyah/:collectionId", element: <RuqyahCollectionPage /> },
      // الصحة والطمأنينة: توعية عامة، عامة بلا تسجيل؛ صفحة الدليل نفسها بمسار القسم
      { path: "/health", element: <HealthHubPage /> },
      { path: "/health/:guideId", element: <RuqyahGuidePage /> },
      { path: "/about-verification", element: <AboutVerificationPage /> },
      { path: "/terms", element: <TermsPage /> },
      { path: "/privacy", element: <PrivacyPage /> },

      { path: "/onboarding/consent", element: auth(<ConsentOnboardingPage />) },
      { path: "/dashboard", element: auth(<DashboardPage />) },
      { path: "/account", element: auth(<AccountPage />) },
      { path: "/notifications", element: auth(<NotificationsPage />) },
      { path: "/report", element: auth(<ReportPage />) },
      { path: "/book/:providerId", element: auth(<BookPage />) },
      { path: "/bookings", element: auth(<MyBookingsPage />) },
      { path: "/bookings/:id", element: auth(<BookingDetailPage />) },
      { path: "/conversations/:id", element: auth(<ConversationPage />) },
      { path: "/recommendations", element: auth(<MyRecommendationsPage />) },
      { path: "/library", element: auth(<LibraryPage />) },
      { path: "/favorites", element: auth(<FavoritesPage />) },
      { path: "/provider-upgrade", element: auth(<ProviderUpgradePage />) },

      // بوابة المختص — المستفيد لا يصل لـ CaseNoteEditor حتى بالرابط المباشر
      {
        path: "/provider",
        element: auth(<RequireRole roles={["Practitioner"]}><ProviderPortalLayout /></RequireRole>),
        children: [
          { index: true, element: <ProviderProfilePage /> },
          { path: "offerings", element: <OfferingsPage /> },
          { path: "slots", element: <SlotsPage /> },
          { path: "bookings", element: <ProviderBookingsPage /> },
          { path: "bookings/:id", element: <ProviderBookingWorkspace /> },
          { path: "bookings/:id/private-note", element: <CaseNoteEditor /> },
          { path: "bookings/:id/recommend", element: <RecommendationComposer /> },
        ],
      },

      {
        path: "/staff",
        element: auth(
          <RequireRole roles={["Coordinator", "ContentManager", "SystemAdmin", "ClinicalSupervisor", "PrivacySecurityOfficer"]}>
            <StaffLayout />
          </RequireRole>,
        ),
        children: [
          { index: true, element: <StaffIndex /> },
          { path: "verifications", element: <RequireRole roles={["Coordinator"]}><VerificationQueuePage /></RequireRole> },
          { path: "organizations", element: <RequireRole roles={["Coordinator"]}><OrganizationsAdminPage /></RequireRole> },
          { path: "providers", element: <RequireRole roles={["Coordinator"]}><ProvidersAdminPage /></RequireRole> },
          { path: "reports", element: <RequireRole roles={["Coordinator"]}><ReportsAdminPage /></RequireRole> },
          { path: "safety-alerts", element: <RequireRole roles={["Coordinator", "ClinicalSupervisor"]}><SafetyAlertsPage /></RequireRole> },
          { path: "library", element: <RequireRole roles={["ContentManager", "SystemAdmin"]}><LibraryAdminPage /></RequireRole> },
          { path: "duas", element: <RequireRole roles={["ContentManager"]}><RuqyahDuasAdminPage /></RequireRole> },
          { path: "companion-plans", element: <RequireRole roles={["ContentManager"]}><CompanionPlansAdminPage /></RequireRole> },
          { path: "companion-emergency", element: <RequireRole roles={["Coordinator", "ClinicalSupervisor"]}><CompanionEmergencyAdminPage /></RequireRole> },
          { path: "companion-stats", element: <RequireRole roles={["ContentManager", "Coordinator"]}><CompanionStatsPage /></RequireRole> },
          { path: "users", element: <RequireRole roles={["SystemAdmin"]}><UsersAdminPage /></RequireRole> },
        ],
      },
      // روابط الإشعارات القديمة
      { path: "/coordinator/*", element: <Navigate to="/staff" replace /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
