import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Calendar, ClipboardCheck, MessageSquare, Users,
  BookOpen, Settings, LogOut, GraduationCap, Shield, ChevronRight, Menu, X,
  User, Fingerprint,
} from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavItem {
  label: string;
  path: string;
  icon: ReactNode;
}

const studentNav: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: <LayoutDashboard className="w-5 h-5" /> },
  { label: "Timetable", path: "/dashboard/timetable", icon: <Calendar className="w-5 h-5" /> },
  { label: "Attendance", path: "/dashboard/attendance", icon: <ClipboardCheck className="w-5 h-5" /> },
  { label: "Mark Attendance", path: "/dashboard/mark-attendance", icon: <GraduationCap className="w-5 h-5" /> },
  { label: "Fingerprint", path: "/dashboard/biometric", icon: <Fingerprint className="w-5 h-5" /> },
  { label: "Issues", path: "/dashboard/issues", icon: <MessageSquare className="w-5 h-5" /> },
];

const teacherNav: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: <LayoutDashboard className="w-5 h-5" /> },
  { label: "Timetable", path: "/dashboard/timetable", icon: <Calendar className="w-5 h-5" /> },
  { label: "Class Codes", path: "/dashboard/class-codes", icon: <BookOpen className="w-5 h-5" /> },
  { label: "Students", path: "/dashboard/students", icon: <Users className="w-5 h-5" /> },
  { label: "Fingerprint", path: "/dashboard/biometric", icon: <Fingerprint className="w-5 h-5" /> },
  { label: "Issues", path: "/dashboard/issues", icon: <MessageSquare className="w-5 h-5" /> },
];

const adminNav: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: <LayoutDashboard className="w-5 h-5" /> },
  { label: "Users", path: "/dashboard/users", icon: <Users className="w-5 h-5" /> },
  { label: "Classes", path: "/dashboard/classes", icon: <BookOpen className="w-5 h-5" /> },
  { label: "Subjects", path: "/dashboard/subjects", icon: <BookOpen className="w-5 h-5" /> },
  { label: "Timetable", path: "/dashboard/admin-timetable", icon: <Calendar className="w-5 h-5" /> },
  { label: "Attendance", path: "/dashboard/attendance", icon: <ClipboardCheck className="w-5 h-5" /> },
  { label: "Fingerprint", path: "/dashboard/biometric", icon: <Fingerprint className="w-5 h-5" /> },
  { label: "Issues", path: "/dashboard/issues", icon: <MessageSquare className="w-5 h-5" /> },
];

interface Props {
  children: ReactNode;
}

const DashboardLayout = ({ children }: Props) => {
  const { role, profile, signOut } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);

  useEffect(() => {
    if (!profile?.user_id || role === "admin") return;

    const checkUnread = async () => {
      const { data } = await supabase
        .from("issues")
        .select("id")
        .eq("user_id", profile.user_id)
        .eq("is_admin_initiated", true)
        .eq("is_read", false)
        .limit(1);

      setHasUnreadMessages(data && data.length > 0 ? true : false);
    };

    checkUnread();

    // Subscribe to changes
    const channel = supabase
      .channel("issues-unread")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "issues",
        filter: `user_id=eq.${profile.user_id}`
      }, () => checkUnread())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.user_id, role]);

  const isAdminUnverified = role === "admin" && profile?.photo_status !== "verified";

  const navItems = role === "admin" ? adminNav : role === "teacher" ? teacherNav : studentNav;
  const roleLabel = role === "admin" ? "Admin" : role === "teacher" ? "Teacher" : "Student";
  const roleIcon = role === "admin" ? <Shield className="w-4 h-4" /> : role === "teacher" ? <BookOpen className="w-4 h-4" /> : <GraduationCap className="w-4 h-4" />;

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-foreground/20 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:sticky lg:top-0 lg:h-screen inset-y-0 left-0 z-50 w-64 gradient-dark flex flex-col transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg gradient-primary flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-display font-bold text-sidebar-foreground text-lg leading-tight">FaceAttend</h2>
              <p className="text-xs text-sidebar-foreground/60">ERP System</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const isManagementPath = item.path !== "/dashboard" && item.path !== "/dashboard/profile" && item.path !== "/dashboard/issues";
            const isDisabled = isAdminUnverified && isManagementPath;

            return (
              <Link
                key={item.path}
                to={isDisabled ? "#" : item.path}
                onClick={(e) => {
                  if (isDisabled) {
                    e.preventDefault();
                    toast({
                      title: "Access Restricted",
                      description: "Please verify your profile photo to access management pages.",
                      variant: "destructive"
                    });
                  } else {
                    setSidebarOpen(false);
                  }
                }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                  } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {item.icon}
                <span className="flex-1">{item.label}</span>
                {item.label === "Issues" && hasUnreadMessages && (
                  <span className="w-2 h-2 bg-destructive rounded-full" />
                )}
                {isActive && <ChevronRight className="w-4 h-4" />}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen">
        <header className="h-14 border-b border-border bg-card flex items-center px-4 lg:px-6 sticky top-0 z-30">
          <button className="lg:hidden mr-3 text-foreground" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-display font-semibold text-foreground">
            {navItems.find((n) => n.path === location.pathname)?.label || "Dashboard"}
          </h1>

          <div className="ml-auto flex items-center gap-4">
            {profile?.photo_status === "pending" && (
              <span className="hidden md:inline-block text-xs px-2 py-1 rounded-full bg-warning/10 text-warning font-medium">
                Photo verification pending
              </span>
            )}
            {profile?.photo_status === "rejected" && (
              <span className="hidden md:inline-block text-xs px-2 py-1 rounded-full bg-destructive/10 text-destructive font-medium">
                Photo rejected — re-upload
              </span>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-auto flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-accent transition-colors">
                  <span className="hidden sm:inline-block text-sm font-medium text-foreground">
                    {profile?.full_name || "User"}
                  </span>
                  <Avatar className="h-9 w-9 border border-border">
                    <AvatarImage src={profile?.avatar_url || ""} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {profile?.full_name?.[0] || "U"}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{profile?.full_name || "User"}</p>
                    <p className="text-xs leading-none text-muted-foreground flex items-center gap-1">
                      {roleIcon} {roleLabel}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => window.location.href = "/dashboard/profile"}>
                  <User className="mr-2 h-4 w-4" />
                  <span>My Profile</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign Out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6 animate-fade-in relative">
          {isAdminUnverified &&
            location.pathname !== "/dashboard" &&
            location.pathname !== "/dashboard/profile" &&
            location.pathname !== "/dashboard/issues" && (
              <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-6 text-center">
                <div className="max-w-md space-y-4">
                  <div className="w-16 h-16 bg-warning/10 text-warning rounded-full flex items-center justify-center mx-auto">
                    <Shield className="w-8 h-8" />
                  </div>
                  <h2 className="text-2xl font-display font-bold">Verification Required</h2>
                  <p className="text-muted-foreground">
                    Your admin account is currently unverified. To protect system integrity,
                    access to management pages is restricted until your profile photo is approved
                    by another admin.
                  </p>
                  <div className="pt-4">
                    <Button onClick={() => window.location.href = "/dashboard/profile"}>
                      Check Profile Status
                    </Button>
                  </div>
                </div>
              </div>
            )}
          {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
