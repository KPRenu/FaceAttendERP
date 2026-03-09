import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import DashboardHome from "./pages/DashboardHome";
import TimetablePage from "./pages/TimetablePage";
import AttendancePage from "./pages/AttendancePage";
import IssuesPage from "./pages/IssuesPage";
import MarkAttendancePage from "./pages/student/MarkAttendancePage";
import TeacherClassCodesPage from "./pages/teacher/TeacherClassCodesPage";
import TeacherStudentsPage from "./pages/teacher/TeacherStudentsPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminClassesPage from "./pages/admin/AdminClassesPage";
import AdminSubjectsPage from "./pages/admin/AdminSubjectsPage";
import AdminTimetablePage from "./pages/admin/AdminTimetablePage";
import ProfilePage from "./pages/ProfilePage";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><DashboardHome /></ProtectedRoute>} />
            <Route path="/dashboard/timetable" element={<ProtectedRoute><TimetablePage /></ProtectedRoute>} />
            <Route path="/dashboard/attendance" element={<ProtectedRoute><AttendancePage /></ProtectedRoute>} />
            <Route path="/dashboard/issues" element={<ProtectedRoute><IssuesPage /></ProtectedRoute>} />
            <Route path="/dashboard/mark-attendance" element={<ProtectedRoute><MarkAttendancePage /></ProtectedRoute>} />
            <Route path="/dashboard/class-codes" element={<ProtectedRoute><TeacherClassCodesPage /></ProtectedRoute>} />
            <Route path="/dashboard/students" element={<ProtectedRoute><TeacherStudentsPage /></ProtectedRoute>} />
            <Route path="/dashboard/users" element={<ProtectedRoute><AdminUsersPage /></ProtectedRoute>} />
            <Route path="/dashboard/classes" element={<ProtectedRoute><AdminClassesPage /></ProtectedRoute>} />
            <Route path="/dashboard/subjects" element={<ProtectedRoute><AdminSubjectsPage /></ProtectedRoute>} />
            <Route path="/dashboard/admin-timetable" element={<ProtectedRoute><AdminTimetablePage /></ProtectedRoute>} />
            <Route path="/dashboard/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/dashboard/profile/:userId" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
