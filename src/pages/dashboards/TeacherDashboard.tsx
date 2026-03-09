import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, BookOpen, Calendar, ClipboardCheck, Clock, Key } from "lucide-react";
import { formatTime } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"; // Assuming Table components are available, or use simple div

const TeacherDashboard = () => {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalSubjects: 0,
    activeCodes: 0,
    todayClasses: 0,
  });
  const [todaySchedule, setTodaySchedule] = useState<any[]>([]);
  const [activeCodesList, setActiveCodesList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchDashboardData = async () => {
      if (!user) return;

      try {
        // 1. Get Teacher's Timetable
        const { data: timetable } = await supabase.from("timetable")
          .select("*")
          .eq("teacher_id", user.id)
          .eq("is_deleted", false);
        const myTimetable = timetable || [];

        // 2. Calculate Subjects (Unique Subject IDs)
        const uniqueSubjects = new Set(myTimetable.map(t => t.subject_id));

        // 3. Calculate Today's Classes
        const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
        const todaysClasses = myTimetable.filter(t => t.day_of_week === today);

        // Enrich today's schedule with subject/class/room details
        const enrichedSchedule = await Promise.all(todaysClasses.map(async (t) => {
          const { data: subject } = await supabase.from("subjects").select("subject_name").eq("id", t.subject_id).single();
          const { data: classData } = await supabase.from("classes").select("class_name").eq("id", t.class_id).single();
          return { ...t, subject_name: subject?.subject_name, class_name: classData?.class_name };
        }));

        // 4. Calculate Active Codes
        const { data: codes } = await supabase.from("class_codes")
          .select("*")
          .eq("teacher_id", user.id)
          .gt("expires_at", new Date().toISOString());

        const activeCodes = codes || [];

        // 5. Calculate Total Students (Approximation logic similar to Students Page)
        const uniqueClassIds = [...new Set(myTimetable.map(t => t.class_id))];
        let studentCount = 0;

        if (uniqueClassIds.length > 0) {
          const { data: classes } = await supabase.from("classes").select("*").in("id", uniqueClassIds);
          if (classes) {
            // Fetch profiles that match these classes
            // Note: This is a heavy query, optimization might be needed for large datasets
            // We'll fetch all students and filter in memory for now as per previous pattern
            const { data: students } = await supabase.from("profiles").select("department, section, semester");
            const { data: studentRoles } = await supabase.from("user_roles").select("user_id").eq("role", "student");
            const studentUserIds = new Set(studentRoles?.map(r => r.user_id));

            // Filter only legitimate students
            const validStudents = (students || []).filter((s: any) =>
              // Since we selected specific fields, we don't have user_id in 'students' variable if we don't select it.
              // Let's correct the query to include user_id
              true
            );

            // Let's do a better query for students
            const { data: allStudentProfiles } = await supabase.from("profiles")
              .select("user_id, department, section, semester")
              .eq("profile_completed", true);

            if (allStudentProfiles) {
              const matchedStudents = allStudentProfiles.filter(student => (
                studentUserIds.has(student.user_id) &&
                classes.some(c =>
                  c.department === student.department &&
                  c.section === student.section &&
                  c.semester === student.semester
                )
              ));
              studentCount = matchedStudents.length;
            }
          }
        }

        setStats({
          totalStudents: studentCount,
          totalSubjects: uniqueSubjects.size,
          activeCodes: activeCodes.length,
          todayClasses: todaysClasses.length,
        });
        setTodaySchedule(enrichedSchedule.sort((a, b) => a.start_time.localeCompare(b.start_time)));
        setActiveCodesList(activeCodes);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchDashboardData();

    // 6. Consolidated Realtime Subscription
    const channel = supabase
      .channel(`teacher_dashboard_${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'timetable' },
        () => isMounted && fetchDashboardData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance' },
        () => isMounted && fetchDashboardData()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'class_codes',
          filter: `teacher_id=eq.${user.id}`
        },
        () => isMounted && fetchDashboardData()
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [user]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold text-foreground">
          Welcome, {profile?.full_name || "Teacher"} 👋
        </h2>
        <p className="text-muted-foreground mt-1">Manage your classes and attendance</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-card hover:shadow-card-hover transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Students</p>
                <p className="text-2xl font-bold text-foreground">{loading ? "..." : stats.totalStudents}</p>
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
                <p className="text-sm text-muted-foreground">Subjects</p>
                <p className="text-2xl font-bold text-foreground">{loading ? "..." : stats.totalSubjects}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card hover:shadow-card-hover transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center">
                <Key className="w-6 h-6 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Codes</p>
                <p className="text-2xl font-bold text-foreground">{loading ? "..." : stats.activeCodes}</p>
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
                <p className="text-sm text-muted-foreground">Today's Classes</p>
                <p className="text-2xl font-bold text-foreground">{loading ? "..." : stats.todayClasses}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg font-display">Today's Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <p className="text-center text-muted-foreground py-8">Loading...</p> : todaySchedule.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Clock className="w-10 h-10 mb-2 opacity-50" />
                <p>No classes scheduled today</p>
              </div>
            ) : (
              <div className="space-y-4">
                {todaySchedule.map((c, i) => (
                  <div key={i} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                    <div>
                      <p className="font-medium">{c.subject_name || "Unknown Subject"}</p>
                      <p className="text-sm text-muted-foreground">{c.class_name || "Unknown Class"} • {c.room_no}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatTime(c.start_time)}</p>
                      <p className="text-xs text-muted-foreground">{formatTime(c.end_time)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg font-display">Active Class Codes</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <p className="text-center text-muted-foreground py-8">Loading...</p> : activeCodesList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Key className="w-10 h-10 mb-2 opacity-50" />
                <p>No active codes</p>
              </div>
            ) : (
              <div className="space-y-4">
                {activeCodesList.map((c) => (
                  <div key={c.id} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                    <div>
                      <p className="font-mono font-bold text-xl tracking-wider text-primary">{c.code}</p>
                      <p className="text-xs text-muted-foreground">Expires: {new Date(c.expires_at).toLocaleTimeString()}</p>
                    </div>
                    <div>
                      <div className="animate-pulse bg-success/20 text-success text-xs px-2 py-1 rounded-full flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-success"></span> Active
                      </div>
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

export default TeacherDashboard;
