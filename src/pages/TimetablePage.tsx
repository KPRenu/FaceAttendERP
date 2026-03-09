import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

import { Calendar } from "lucide-react";
import { formatTime } from "@/lib/utils";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface TimetableEntry {
  id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  room_no: string;
  subject_id: string;
  teacher_id: string;
  class_id: string;
  is_deleted?: boolean;
  is_on_hold: boolean;
}

const TimetablePage = () => {
  const { user, role, profile } = useAuth();
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [subjectMap, setSubjectMap] = useState<Record<string, string>>({});
  const [teacherMap, setTeacherMap] = useState<Record<string, string>>({});
  const [classMap, setClassMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchTimetable = async () => {
    setLoading(true);
    // For students: find classes matching their dept/section/semester
    // For teachers: find entries where they're assigned
    let query = supabase.from("timetable").select("*").eq("is_deleted", false);

    if (role === "teacher" && user) {
      query = query.eq("teacher_id", user.id);
    } else if (role === "student" && profile) {
      // Get class IDs matching student's profile
      const { data: matchingClasses } = await supabase.from("classes")
        .select("id")
        .eq("department", profile.department || "")
        .eq("section", profile.section || "")
        .eq("semester", profile.semester || 0)
        .eq("is_deleted", false);
      const classIds = matchingClasses?.map((c) => c.id) || [];
      if (classIds.length > 0) {
        query = query.in("class_id", classIds);
      } else {
        setEntries([]);
        setLoading(false);
        return;
      }
    }

    const { data: timetableData } = await query;
    const entries = (timetableData || []) as TimetableEntry[];
    setEntries(entries);

    // Fetch lookups
    const subjectIds = [...new Set(entries.map((e) => e.subject_id))];
    const teacherIds = [...new Set(entries.map((e) => e.teacher_id))];
    const classIds = [...new Set(entries.map((e) => e.class_id))];

    if (subjectIds.length) {
      const { data } = await supabase.from("subjects").select("id, subject_name").in("id", subjectIds);
      setSubjectMap(Object.fromEntries((data || []).map((s) => [s.id, s.subject_name])));
    }
    if (teacherIds.length) {
      const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", teacherIds);
      setTeacherMap(Object.fromEntries((data || []).map((t) => [t.user_id, t.full_name || "Unknown"])));
    }
    if (classIds.length) {
      const { data } = await supabase.from("classes").select("id, class_name").in("id", classIds);
      setClassMap(Object.fromEntries((data || []).map((c) => [c.id, c.class_name])));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTimetable();
  }, [user, role, profile]);

  const toggleHold = async (id: string, currentStatus: boolean) => {
    // Optimistic UI update
    setEntries(prev => prev.map(e => e.id === id ? { ...e, is_on_hold: !currentStatus } : e));

    const { error } = await supabase
      .from("timetable")
      .update({ is_on_hold: !currentStatus })
      .eq("id", id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      fetchTimetable(); // Revert on failure
    } else {
      toast({ title: !currentStatus ? "Class put on hold" : "Hold removed" });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">
            {role === "student" ? "My Timetable" : "Teaching Schedule"}
          </h2>
          <p className="text-muted-foreground mt-1">Your weekly class schedule</p>
        </div>

        {loading ? <p className="text-center text-muted-foreground py-8">Loading...</p> : entries.length === 0 ? (
          <Card className="shadow-card">
            <CardContent className="py-12 text-center text-muted-foreground">
              <Calendar className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p>No timetable entries found.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
            {DAYS.map((day) => {
              const dayEntries = entries
                .filter((e) => e.day_of_week === day)
                .sort((a, b) => a.start_time.localeCompare(b.start_time));

              return (
                <div key={day} className="flex flex-col gap-3 min-h-[300px] bg-secondary/20 p-3 rounded-lg border border-border/50">
                  <div className="text-center font-semibold text-muted-foreground border-b border-border/50 pb-2 mb-1">
                    {day}
                  </div>

                  <div className="flex flex-col gap-2">
                    {dayEntries.length === 0 ? (
                      <div className="text-xs text-muted-foreground text-center italic py-4 opacity-50">No classes</div>
                    ) : (
                      dayEntries.map((e) => (
                        <div
                          key={e.id}
                          className="relative group bg-card p-3 rounded-md border shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-1"
                        >
                          {/* Color Bar */}
                          <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-md ${
                            // Simple hash to pick a color based on subject ID
                            ["bg-red-400", "bg-blue-400", "bg-green-400", "bg-yellow-400", "bg-purple-400", "bg-pink-400", "bg-indigo-400", "bg-orange-400"][
                            e.subject_id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % 8
                            ]
                            }`} />

                          <div className="pl-2 space-y-1">
                            <div className="font-bold text-sm leading-tight text-foreground flex items-center gap-2">
                              {subjectMap[e.subject_id] || "—"}
                              {e.is_on_hold && (
                                <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider animate-pulse border border-amber-200">
                                  on hold
                                </span>
                              )}
                            </div>
                            <div className="text-xs font-medium text-primary flex items-center gap-1">
                              <span className="opacity-75">{formatTime(e.start_time)} - {formatTime(e.end_time)}</span>
                            </div>

                            {role === "student" ? (
                              <div className="text-xs text-muted-foreground">
                                {teacherMap[e.teacher_id] || "—"}
                              </div>
                            ) : (
                              <div className="text-xs text-muted-foreground font-medium">
                                {classMap[e.class_id] || "—"}
                              </div>
                            )}

                            <div className="text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded inline-block">
                              Room: {e.room_no}
                            </div>

                            {role === "teacher" && (
                              <div className="mt-2 pt-2 border-t border-border/50">
                                <Button
                                  size="sm"
                                  variant={e.is_on_hold ? "secondary" : "outline"}
                                  className={`w-full h-7 text-[10px] font-bold ${e.is_on_hold ? 'bg-amber-500 hover:bg-amber-600 text-white border-none' : ''}`}
                                  onClick={() => toggleHold(e.id, e.is_on_hold)}
                                >
                                  {e.is_on_hold ? "RESUME CLASS" : "PUT ON HOLD"}
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default TimetablePage;
