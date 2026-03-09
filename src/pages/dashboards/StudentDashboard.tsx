import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardCheck, Calendar, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { formatTime } from "@/lib/utils";


const formatTime12h = (timeStr: string | null | undefined) => {
  if (!timeStr) return "—";
  const [hours, minutes] = timeStr.split(':');
  let h = parseInt(hours, 10);
  const m = minutes;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
};

const StudentDashboard = () => {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState({
    present: 0,
    absent: 0,
    total: 0,
    percentage: 0,
  });
  const [todaySchedule, setTodaySchedule] = useState<any[]>([]);
  const [recentAttendance, setRecentAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchDashboardData = async () => {
      if (!user || !profile) return;

      try {
        // 1. Fetch Attendance Stats
        const { data: attendance } = await supabase
          .from("attendance")
          .select("*")
          .eq("student_id", user.id);

        const allAttendance = attendance || [];
        const total = allAttendance.length;
        const present = allAttendance.filter((a) => a.status === "present").length;
        const absent = allAttendance.filter((a) => a.status === "absent").length;
        const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

        setStats({ present, absent, total, percentage });

        // 1.1 Enrich Recent attendance (last 5)
        // Standardized Sort: Date DESC, Slot Time DESC, Created At DESC
        const sortedAttendance = allAttendance.sort((a, b) => {
          const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
          if (dateDiff !== 0) return dateDiff;

          if (a.slot_start_time && b.slot_start_time) {
            const timeDiff = b.slot_start_time.localeCompare(a.slot_start_time);
            if (timeDiff !== 0) return timeDiff;
          }

          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }).slice(0, 5);

        const enrichedRecent = await Promise.all(sortedAttendance.map(async (a) => {
          // If already snapshotted, just return
          if (a.subject_name && a.teacher_name && a.class_name) return a;

          if (!a.timetable_id) return a;

          const { data: timetable } = await supabase.from("timetable").select("subject_id, teacher_id, room_no").eq("id", a.timetable_id).single();
          if (!timetable) return a;

          const [subjRes, teachRes] = await Promise.all([
            supabase.from("subjects").select("subject_name").eq("id", timetable.subject_id).single(),
            supabase.from("profiles").select("full_name").eq("user_id", timetable.teacher_id).single()
          ]);

          return {
            ...a,
            subject_name: a.subject_name || subjRes.data?.subject_name,
            teacher_name: a.teacher_name || teachRes.data?.full_name,
            room_no: timetable.room_no
          };
        }));

        setRecentAttendance(enrichedRecent);

        // 2. Fetch Today's Schedule
        const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });

        // Find classes matching student profile
        const { data: matchingClasses } = await supabase.from("classes")
          .select("id")
          .eq("department", profile.department || "")
          .eq("section", profile.section || "")
          .eq("semester", profile.semester || 0);

        const classIds = matchingClasses?.map((c) => c.id) || [];

        if (classIds.length > 0) {
          const { data: timetable } = await supabase.from("timetable")
            .select("*")
            .in("class_id", classIds)
            .eq("day_of_week", today)
            .eq("is_deleted", false)
            .order("start_time");

          if (timetable) {
            const enrichedSchedule = await Promise.all(timetable.map(async (t) => {
              const { data: subject } = await supabase.from("subjects").select("subject_name").eq("id", t.subject_id).single();
              const { data: teacher } = await supabase.from("profiles").select("full_name").eq("user_id", t.teacher_id).single();
              return {
                ...t,
                subject_name: subject?.subject_name,
                teacher_name: teacher?.full_name
              };
            }));
            setTodaySchedule(enrichedSchedule);
          } else {
            setTodaySchedule([]);
          }
        } else {
          setTodaySchedule([]);
        }

      } catch (error) {
        console.error("Error fetching student dashboard data:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchDashboardData();

    // 3. Consolidated Realtime Updates
    const channel = supabase
      .channel(`student_dashboard_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendance',
          filter: `student_id=eq.${user.id}`
        },
        () => isMounted && fetchDashboardData()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'timetable'
        },
        () => isMounted && fetchDashboardData()
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [user, profile]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold text-foreground">
          Welcome, {profile?.full_name || "Student"} 👋
        </h2>
        <p className="text-muted-foreground mt-1">Here's your attendance overview</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-card hover:shadow-card-hover transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <ClipboardCheck className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Overall Attendance</p>
                <p className="text-2xl font-bold text-foreground">{loading ? "..." : `${stats.percentage}%`}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card hover:shadow-card-hover transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Present Days</p>
                <p className="text-2xl font-bold text-foreground">{loading ? "..." : stats.present}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card hover:shadow-card-hover transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Absent Days</p>
                <p className="text-2xl font-bold text-foreground">{loading ? "..." : stats.absent}</p>
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
                <p className="text-sm text-muted-foreground">Total Classes</p>
                <p className="text-2xl font-bold text-foreground">{loading ? "..." : stats.total}</p>
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
                      <p className="text-sm text-muted-foreground">{c.teacher_name || "Unknown Teacher"} • {c.room_no}</p>
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
            <CardTitle className="text-lg font-display">Recent Attendance</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <p className="text-center text-muted-foreground py-8">Loading...</p> : recentAttendance.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <ClipboardCheck className="w-10 h-10 mb-2 opacity-50" />
                <p>No attendance records yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentAttendance.map((a) => (
                  <div key={a.id} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                    <div>
                      <p className="text-sm font-medium text-foreground">{a.subject_name || "Unknown Class"}</p>
                      <p className="text-xs text-muted-foreground">{a.teacher_name || "Teacher"} • {new Date(a.date).toLocaleDateString()}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                          Slot: {formatTime12h(a.slot_start_time)} - {formatTime12h(a.slot_end_time)}
                        </span>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${a.status === 'present' ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}`}>
                      {a.status.charAt(0).toUpperCase() + a.status.slice(1)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div >
  );
};

export default StudentDashboard;
