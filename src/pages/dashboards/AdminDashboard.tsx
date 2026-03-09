import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, BookOpen, Calendar, ClipboardCheck, Shield, AlertCircle, CheckCircle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const AdminDashboard = () => {
  const [stats, setStats] = useState({ students: 0, teachers: 0, pendingPhotos: 0, classes: 0 });
  const [recentIssues, setRecentIssues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      // Fetch user profile to ensure user is admin, although route protection handles this.
      // Parallel fetching
      const [studentsRes, teachersRes, pendingRes, classesRes, issuesRes] = await Promise.all([
        supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "student"),
        supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "teacher"),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("photo_status", "pending").eq("profile_completed", true),
        supabase.from("classes").select("id", { count: "exact", head: true }),
        supabase.from("issues")
          .select("id, subject, description, status, created_at")
          .neq("status", "closed")
          .neq("status", "resolved")
          .order("created_at", { ascending: false })
          .limit(5)
      ]);
      setStats({
        students: studentsRes.count || 0,
        teachers: teachersRes.count || 0,
        pendingPhotos: pendingRes.count || 0,
        classes: classesRes.count || 0,
      });
      setRecentIssues(issuesRes.data || []);
      setLoading(false);
    };
    fetchStats();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold text-foreground">Admin Dashboard 🛡️</h2>
        <p className="text-muted-foreground mt-1">Manage the entire system from here</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-card hover:shadow-card-hover transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Students</p>
                <p className="text-2xl font-bold text-foreground">{loading ? "..." : stats.students}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card hover:shadow-card-hover transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-accent" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Teachers</p>
                <p className="text-2xl font-bold text-foreground">{loading ? "..." : stats.teachers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card hover:shadow-card-hover transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Verifications</p>
                <p className="text-2xl font-bold text-foreground">{loading ? "..." : stats.pendingPhotos}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card hover:shadow-card-hover transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-info/10 flex items-center justify-center">
                <Calendar className="w-6 h-6 text-info" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Classes</p>
                <p className="text-2xl font-bold text-foreground">{loading ? "..." : stats.classes}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg font-display">Pending Photo Verifications</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <p className="text-center text-muted-foreground py-8">Loading...</p> : stats.pendingPhotos === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <CheckCircle className="w-10 h-10 mb-2 opacity-50" />
                <p>All photos verified</p>
              </div>
            ) : (
              <p className="text-muted-foreground">
                {stats.pendingPhotos} user(s) awaiting photo verification. Go to <strong>Users</strong> to manage.
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg font-display">Recent Issues</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <p className="text-center text-muted-foreground py-8">Loading...</p> : recentIssues.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <CheckCircle className="w-10 h-10 mb-2 opacity-50 text-success" />
                <p>No open issues</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentIssues.map((issue) => (
                  <div key={issue.id} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                    <div className="overflow-hidden">
                      <p className="font-medium truncate">{issue.subject}</p>
                      <p className="text-xs text-muted-foreground truncate">{issue.description}</p>
                    </div>
                    <div>
                      <Badge variant={issue.status === 'open' ? 'destructive' : 'secondary'}>
                        {issue.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboard;
