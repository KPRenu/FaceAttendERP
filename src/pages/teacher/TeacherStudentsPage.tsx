import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Users, Filter, ClipboardCheck, CheckCircle, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface StudentProfile {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  department: string | null;
  usn: string | null;
  semester: number | null;
  section: string | null;
}

interface AttendanceRecord {
  id: string;
  date: string;
  status: string;
  timetable_id: string;
  student_id: string;
  student_name?: string;
  class_name?: string;
  department?: string;
  semester?: number;
  subject_name?: string;
  teacher_name?: string;
  slot_start_time?: string;
  slot_end_time?: string;
  created_at?: string;
}

const formatTime12h = (timeStr: string | null | undefined) => {
  if (!timeStr) return "—";
  const [hours, minutes] = timeStr.split(':');
  let h = parseInt(hours, 10);
  const m = minutes;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
};

const TeacherStudentsPage = () => {
  const { user } = useAuth();
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Student Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [semFilter, setSemFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");

  // Attendance Filters
  const [attSearchQuery, setAttSearchQuery] = useState("");
  const [attStartDate, setAttStartDate] = useState("");
  const [attEndDate, setAttEndDate] = useState("");
  const [attClassFilter, setAttClassFilter] = useState("all");
  const [attSubjectFilter, setAttSubjectFilter] = useState("all");
  const [attStatusFilter, setAttStatusFilter] = useState("all");

  useEffect(() => {
    const fetch = async () => {
      if (!user) return;
      setLoading(true);

      // 1. Get classes teacher is assigned to (via Timetable)
      const { data: ttData } = await supabase.from("timetable").select("id, class_id, subject_id").eq("teacher_id", user.id);
      const teacherTimetableIds = (ttData || []).map(t => t.id);
      const classIds = [...new Set((ttData || []).map((t) => t.class_id))];
      const subjectIds = [...new Set((ttData || []).map((t) => t.subject_id))];

      if (classIds.length === 0) { setLoading(false); return; }

      // 2. Class & Subject Details
      const [classRes, subjectRes] = await Promise.all([
        supabase.from("classes").select("*").in("id", classIds),
        supabase.from("subjects").select("id, subject_name").in("id", subjectIds)
      ]);

      const classData = classRes.data || [];
      const subjectData = subjectRes.data || [];

      // Maps for easy lookup
      const classMap = Object.fromEntries(classData.map(c => [c.id, c]));
      const subjectMap = Object.fromEntries(subjectData.map(s => [s.id, s.subject_name]));
      const timetableMap = Object.fromEntries((ttData || []).map(t => [t.id, t]));

      // 3. Methods to fetch Students (Same as before)
      const { data: allStudents } = await supabase.from("profiles")
        .select("user_id, full_name, avatar_url, department, usn, semester, section")
        .eq("profile_completed", true);

      const { data: studentRoles } = await supabase.from("user_roles").select("user_id").eq("role", "student");
      const studentIdsSet = new Set(studentRoles?.map((r) => r.user_id) || []);

      // Filter students belonging to teacher's classes
      const matchedStudents = (allStudents || []).filter((s) => {
        if (!studentIdsSet.has(s.user_id)) return false;
        return classData.some((c) => c.department === s.department && c.section === s.section && c.semester === s.semester);
      });

      setStudents(matchedStudents as StudentProfile[]);

      // 4. Fetch Attendance Records (Scoped robustly to Teacher ID)
      const { data: attData } = await supabase.from("attendance")
        .select("*")
        .eq("teacher_id", user.id)
        .order("date", { ascending: false });

      const enrichedRecords = (attData || []).map((r: any) => {
        // Priority: Snapshotted Metadata
        const tt = timetableMap[r.timetable_id];
        const cls = tt ? classMap[tt.class_id] : null;
        const studentName = (allStudents || []).find(s => s.user_id === r.student_id)?.full_name || "Unknown";

        return {
          ...r,
          student_name: studentName,
          class_name: r.class_name || cls?.class_name || "—",
          department: r.department || cls?.department || "—",
          semester: r.semester || cls?.semester,
          subject_name: r.subject_name || (tt ? subjectMap[tt.subject_id] : "—"),
          teacher_name: r.teacher_name || (user ? (allStudents || []).find(s => s.user_id === user.id)?.full_name : "—") || "—"
        };
      });

      // Standardize Sort: Date DESC, Slot Time DESC, Created At DESC
      enrichedRecords.sort((a, b) => {
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        if (a.slot_start_time && b.slot_start_time) {
          const timeDiff = b.slot_start_time.localeCompare(a.slot_start_time);
          if (timeDiff !== 0) return timeDiff;
        }
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      });

      setAttendanceRecords(enrichedRecords);

      setLoading(false);
    };
    fetch();
  }, [user]);

  // --- Filter Logic ---

  // Students Tab Filter
  const filteredStudents = students.filter(s => {
    const matchesSearch = (s.full_name?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
      (s.usn?.toLowerCase() || "").includes(searchQuery.toLowerCase());
    const matchesDept = deptFilter === "all" || s.department === deptFilter;
    const matchesSem = semFilter === "all" || String(s.semester) === semFilter;
    const matchesSection = sectionFilter === "all" || s.section === sectionFilter;
    return matchesSearch && matchesDept && matchesSem && matchesSection;
  });

  // Attendance Tab Filter
  const filteredAttendance = attendanceRecords.filter(r => {
    const matchesSearch = (r.student_name?.toLowerCase() || "").includes(attSearchQuery.toLowerCase());
    const matchesStartDate = !attStartDate || r.date >= attStartDate;
    const matchesEndDate = !attEndDate || r.date <= attEndDate;
    const matchesClass = attClassFilter === "all" || r.class_name === attClassFilter;
    const matchesSubject = attSubjectFilter === "all" || r.subject_name === attSubjectFilter;
    const matchesStatus = attStatusFilter === "all" || r.status === attStatusFilter;
    return matchesSearch && matchesStartDate && matchesEndDate && matchesClass && matchesSubject && matchesStatus;
  });

  // KPI Calculations
  const totalPresent = filteredAttendance.filter(r => r.status === "present").length;
  const totalAbsent = filteredAttendance.filter(r => r.status === "absent").length;
  const percentage = filteredAttendance.length > 0 ? Math.round((totalPresent / filteredAttendance.length) * 100) : 0;

  // Dropdown Options
  const attClassesList = [...new Set(attendanceRecords.map(r => r.class_name).filter(Boolean))].sort();
  const attSubjectsList = [...new Set(attendanceRecords.map(r => r.subject_name).filter(Boolean))].sort();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">Students & Attendance</h2>
          <p className="text-muted-foreground mt-1">Manage students and view attendance reports</p>
        </div>

        <Tabs defaultValue="students" className="w-full">
          <TabsList>
            <TabsTrigger value="students">Students List</TabsTrigger>
            <TabsTrigger value="attendance">Attendance Report</TabsTrigger>
          </TabsList>

          {/* Tab 1: Students List */}
          <TabsContent value="students" className="space-y-4">
            {!loading && students.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Input placeholder="Search by name or USN..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                <Select value={deptFilter} onValueChange={setDeptFilter}>
                  <SelectTrigger><SelectValue placeholder="Department" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {[...new Set(students.map(s => s.department).filter(Boolean))].sort().map(d => (
                      <SelectItem key={d} value={d as string}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={semFilter} onValueChange={setSemFilter}>
                  <SelectTrigger><SelectValue placeholder="Semester" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Semesters</SelectItem>
                    {[...new Set(students.map(s => s.semester).filter(Boolean))].sort((a, b) => (a || 0) - (b || 0)).map(s => (
                      <SelectItem key={String(s)} value={String(s)}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={sectionFilter} onValueChange={setSectionFilter}>
                  <SelectTrigger><SelectValue placeholder="Section" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sections</SelectItem>
                    {[...new Set(students.map(s => s.section).filter(Boolean))].sort().map(s => (
                      <SelectItem key={s} value={s as string}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-lg font-display flex items-center gap-2">
                  <Users className="w-5 h-5" /> Students {students.length > 0 && <span className="text-sm font-normal text-muted-foreground">({students.length})</span>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? <p className="text-center py-8 text-muted-foreground">Loading...</p> : filteredStudents.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No students found.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow><TableHead></TableHead><TableHead>Name</TableHead><TableHead>USN</TableHead><TableHead>Dept</TableHead><TableHead>Sem</TableHead><TableHead>Section</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {filteredStudents.map((s) => (
                        <TableRow key={s.user_id}>
                          <TableCell><Avatar className="w-8 h-8"><AvatarImage src={s.avatar_url || ""} /><AvatarFallback>{s.full_name?.[0]}</AvatarFallback></Avatar></TableCell>
                          <TableCell className="font-medium">{s.full_name || "—"}</TableCell>
                          <TableCell>{s.usn || "—"}</TableCell>
                          <TableCell>{s.department || "—"}</TableCell>
                          <TableCell>{s.semester || "—"}</TableCell>
                          <TableCell>{s.section || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 2: Attendance Report */}
          <TabsContent value="attendance" className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="shadow-card"><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-primary">{percentage}%</p><p className="text-sm text-muted-foreground">Overall Attendance</p></CardContent></Card>
              <Card className="shadow-card"><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-success">{totalPresent}</p><p className="text-sm text-muted-foreground">Present</p></CardContent></Card>
              <Card className="shadow-card"><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-destructive">{totalAbsent}</p><p className="text-sm text-muted-foreground">Absent</p></CardContent></Card>
            </div>

            <Card className="shadow-card">
              <CardHeader><CardTitle className="text-lg font-display flex items-center gap-2"><ClipboardCheck className="w-5 h-5" /> Records ({filteredAttendance.length})</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6">
                  <div className="md:col-span-1"><Input placeholder="Search student..." value={attSearchQuery} onChange={(e) => setAttSearchQuery(e.target.value)} /></div>
                  <div><Input type="date" value={attStartDate} onChange={(e) => setAttStartDate(e.target.value)} placeholder="Start Date" /></div>
                  <div><Input type="date" value={attEndDate} onChange={(e) => setAttEndDate(e.target.value)} placeholder="End Date" /></div>
                  <Select value={attClassFilter} onValueChange={setAttClassFilter}>
                    <SelectTrigger><SelectValue placeholder="Class" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All Classes</SelectItem>{attClassesList.map(c => <SelectItem key={c} value={c as string}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={attSubjectFilter} onValueChange={setAttSubjectFilter}>
                    <SelectTrigger><SelectValue placeholder="Subject" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All Subjects</SelectItem>{attSubjectsList.map(s => <SelectItem key={s} value={s as string}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={attStatusFilter} onValueChange={setAttStatusFilter}>
                    <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="present">Present</SelectItem><SelectItem value="absent">Absent</SelectItem></SelectContent>
                  </Select>
                </div>

                {loading ? <p className="text-center py-8 text-muted-foreground">Loading...</p> : filteredAttendance.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No records match your filters.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Class</TableHead>
                        <TableHead>Student</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Time Slot</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAttendance.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>{new Date(r.date).toLocaleDateString()}</TableCell>
                          <TableCell>{r.class_name || "—"}</TableCell>
                          <TableCell>{r.student_name || "—"}</TableCell>
                          <TableCell>{r.subject_name || "—"}</TableCell>
                          <TableCell className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                            {r.slot_start_time && r.slot_end_time
                              ? `${formatTime12h(r.slot_start_time)} - ${formatTime12h(r.slot_end_time)}`
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={r.status === "present" ? "border-success text-success" : "border-destructive text-destructive"}>
                              {r.status === "present" ? <CheckCircle className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                              {r.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default TeacherStudentsPage;
