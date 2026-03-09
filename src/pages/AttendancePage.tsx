import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ClipboardCheck, CheckCircle, XCircle, Pencil, Filter, Trash2, RotateCcw, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

const AttendancePage = () => {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [subjectMap, setSubjectMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [semFilter, setSemFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Delete Record State
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<AttendanceRecord | null>(null);

  const handleStatusToggle = async (record: AttendanceRecord) => {
    if (role !== "admin") return;
    const newStatus = record.status === "present" ? "absent" : "present";

    const { error } = await supabase.from("attendance").update({ status: newStatus }).eq("id", record.id);

    if (error) {
      toast({ title: "Error updating status", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Status updated", description: `Marked as ${newStatus}` });
      setRecords(records.map(r => r.id === record.id ? { ...r, status: newStatus } : r));
    }
  };

  const handleDelete = async () => {
    if (!recordToDelete) return;

    try {
      const { error, count } = await supabase
        .from("attendance")
        .delete({ count: 'exact' })
        .eq("id", recordToDelete.id);

      if (error) throw error;

      if (count === 0) {
        toast({
          title: "Deletion Failed",
          description: "The record could not be deleted. This is likely due to database permissions (RLS).",
          variant: "destructive"
        });
      } else {
        toast({ title: "Record Deleted", description: "The attendance record has been successfully removed." });
        setRecords(records.filter(r => r.id !== recordToDelete.id));
      }
      setIsDeleteDialogOpen(false);
      setRecordToDelete(null);
    } catch (error: any) {
      toast({ title: "Error deleting record", description: error.message, variant: "destructive" });
    }
  };

  const handleBulkStatusChange = async (newStatus: string) => {
    if (role !== "admin" || selectedIds.size === 0) return;

    const { error } = await supabase
      .from("attendance")
      .update({ status: newStatus })
      .in("id", Array.from(selectedIds));

    if (error) {
      toast({ title: "Error updating records", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Records updated", description: `Marked ${selectedIds.size} records as ${newStatus}` });
      setRecords(records.map(r => selectedIds.has(r.id) ? { ...r, status: newStatus } : r));
      setSelectedIds(new Set());
    }
  };

  const handleBulkDelete = async () => {
    if (role !== "admin" || selectedIds.size === 0) return;

    try {
      const { error, count } = await supabase
        .from("attendance")
        .delete({ count: 'exact' })
        .in("id", Array.from(selectedIds));

      if (error) throw error;

      if (count === 0) {
        toast({
          title: "Bulk Deletion Failed",
          description: "None of the selected records could be deleted. This is likely due to database permissions (RLS).",
          variant: "destructive"
        });
      } else {
        toast({ title: "Records Deleted", description: `Successfully removed ${count} records.` });
        setRecords(records.filter(r => !selectedIds.has(r.id)));
      }
      setSelectedIds(new Set());
      setIsDeleteDialogOpen(false);
      setRecordToDelete(null);
    } catch (error: any) {
      toast({ title: "Error deleting records", description: error.message, variant: "destructive" });
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredRecords.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRecords.map(r => r.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  useEffect(() => {
    let isMounted = true;
    const fetch = async () => {
      if (!user) return;
      setLoading(true);

      let query = supabase.from("attendance").select("*").order("date", { ascending: false });
      if (role === "student") query = query.eq("student_id", user.id);

      const { data: attendanceData } = await query;
      if (!attendanceData) { setLoading(false); return; }

      let enrichedRecords: AttendanceRecord[] = [...(attendanceData as any)];

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

      // 1. Identify records that NEED enrichment (legacy records missing snapshots)
      const needsEnrichment = enrichedRecords.filter(r =>
        !r.class_name || !r.subject_name || !r.teacher_name || !r.department || !r.semester
      );

      if (needsEnrichment.length > 0) {
        // Fetch Student Names (Profiles) for all records (always needed)
        const studentIds = [...new Set(enrichedRecords.map(r => r.student_id))];
        const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", studentIds);
        const profileMap = Object.fromEntries(profiles?.map(p => [p.user_id, p.full_name]) || []);

        // Fetch Timetable Details for legacy records
        const timetableIds = [...new Set(needsEnrichment.map(r => r.timetable_id))];
        const { data: timetable } = await supabase.from("timetable").select("id, class_id, subject_id, teacher_id").in("id", timetableIds);

        if (timetable) {
          const classIds = [...new Set(timetable.map(t => t.class_id))];
          const subjectIds = [...new Set(timetable.map(t => t.subject_id))];
          const teacherIds = [...new Set(timetable.map(t => t.teacher_id))];

          const [classesRes, subjectsRes, teachersRes] = await Promise.all([
            supabase.from("classes").select("id, class_name, department, semester").in("id", classIds),
            supabase.from("subjects").select("id, subject_name").in("id", subjectIds),
            supabase.from("profiles").select("user_id, full_name").in("user_id", teacherIds)
          ]);

          const classMap = Object.fromEntries(classesRes.data?.map(c => [c.id, c]) || []);
          const subjectMap = Object.fromEntries(subjectsRes.data?.map(s => [s.id, s.subject_name]) || []);
          const teacherMap = Object.fromEntries(teachersRes.data?.map(t => [t.user_id, t.full_name]) || []);
          const timetableMap = Object.fromEntries(timetable.map(t => [t.id, t]));

          enrichedRecords = enrichedRecords.map(r => {
            const tt = timetableMap[r.timetable_id];
            const profile = profileMap[r.student_id];

            return {
              ...r,
              student_name: profile || "Unknown",
              class_name: r.class_name || classMap[tt?.class_id]?.class_name || "—",
              department: r.department || classMap[tt?.class_id]?.department || "—",
              semester: r.semester || classMap[tt?.class_id]?.semester,
              subject_name: r.subject_name || subjectMap[tt?.subject_id] || "—",
              teacher_name: r.teacher_name || teacherMap[tt?.teacher_id] || "—"
            };
          });
        }
      } else {
        // Just fill in student names for fully snapshotted records
        const studentIds = [...new Set(enrichedRecords.map(r => r.student_id))];
        const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", studentIds);
        const profileMap = Object.fromEntries(profiles?.map(p => [p.user_id, p.full_name]) || []);

        enrichedRecords.forEach(r => {
          r.student_name = profileMap[r.student_id] || "Unknown";
        });
      }

      if (isMounted) {
        setRecords(enrichedRecords);
        setLoading(false);
      }
    };
    fetch();

    // 3. Subscribe to Realtime Updates
    const channelName = role === "student" ? `attendance_report_student_${user.id}` : 'attendance_report_admin';
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendance',
          filter: role === "student" ? `student_id=eq.${user.id}` : undefined
        },
        () => isMounted && fetch()
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [user, role]);

  // Derived options for dropdowns
  const classesList = [...new Set(records.map(r => r.class_name).filter(Boolean))].sort();
  const departments = [...new Set(records.map(r => r.department).filter(Boolean))].sort();
  const semesters = [...new Set(records.map(r => r.semester).filter(Boolean))].sort((a, b) => (a || 0) - (b || 0));
  const subjectsList = [...new Set(records.map(r => r.subject_name).filter(Boolean))].sort();
  const teachersList = [...new Set(records.map(r => r.teacher_name).filter(Boolean))].sort();

  const filteredRecords = records.filter(r => {
    const matchesSearch = (r.student_name?.toLowerCase() || "").includes(searchQuery.toLowerCase());
    const matchesStartDate = !startDate || r.date >= startDate;
    const matchesEndDate = !endDate || r.date <= endDate;
    const matchesClass = classFilter === "all" || r.class_name === classFilter;
    const matchesDept = deptFilter === "all" || r.department === deptFilter;
    const matchesSem = semFilter === "all" || String(r.semester) === semFilter;
    const matchesSubject = subjectFilter === "all" || r.subject_name === subjectFilter;
    const matchesTeacher = teacherFilter === "all" || r.teacher_name === teacherFilter;
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;

    return matchesSearch && matchesStartDate && matchesEndDate && matchesClass && matchesDept && matchesSem && matchesSubject && matchesTeacher && matchesStatus;
  });

  const totalPresent = filteredRecords.filter((r) => r.status === "present").length;
  const totalAbsent = filteredRecords.filter((r) => r.status === "absent").length;
  const percentage = filteredRecords.length > 0 ? Math.round((totalPresent / filteredRecords.length) * 100) : 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">Attendance Report</h2>
          <p className="text-muted-foreground mt-1">View your attendance records</p>
        </div>

        {(role === "student" || role === "admin") && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="shadow-card">
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold text-primary">{percentage}%</p>
                <p className="text-sm text-muted-foreground">Overall Attendance</p>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold text-success">{totalPresent}</p>
                <p className="text-sm text-muted-foreground">Present</p>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold text-destructive">{totalAbsent}</p>
                <p className="text-sm text-muted-foreground">Absent</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5" /> Records ({filteredRecords.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
              <div className="md:col-span-2">
                <Input
                  placeholder="Search student..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                placeholder="Start Date"
              />
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                placeholder="End Date"
              />
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger><SelectValue placeholder="Class" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {classesList.map(c => <SelectItem key={c} value={c as string}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={deptFilter} onValueChange={setDeptFilter}>
                <SelectTrigger><SelectValue placeholder="Dept" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Depts</SelectItem>
                  {departments.map(d => <SelectItem key={d} value={d as string}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={semFilter} onValueChange={setSemFilter}>
                <SelectTrigger><SelectValue placeholder="Sem" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sems</SelectItem>
                  {semesters.map(s => <SelectItem key={String(s)} value={String(s)}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={subjectFilter} onValueChange={setSubjectFilter}>
                <SelectTrigger><SelectValue placeholder="Subject" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Subjects</SelectItem>
                  {subjectsList.map(s => <SelectItem key={s} value={s as string}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={teacherFilter} onValueChange={setTeacherFilter}>
                <SelectTrigger><SelectValue placeholder="Teacher" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Teachers</SelectItem>
                  {teachersList.map(t => <SelectItem key={t} value={t as string}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="present">Present</SelectItem>
                  <SelectItem value="absent">Absent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {role === "admin" && selectedIds.size > 0 && (
              <div className="flex items-center justify-between bg-primary/5 p-3 rounded-lg border border-primary/20 mb-6 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                    {selectedIds.size} selected
                  </Badge>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())} className="h-8 text-xs">
                    <RotateCcw className="w-3 h-3 mr-1" /> Clear
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="bg-success hover:bg-success/90 h-8 text-xs"
                    onClick={() => handleBulkStatusChange("present")}
                  >
                    <Check className="w-3 h-3 mr-1" /> Mark Present
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-8 text-xs"
                    onClick={() => handleBulkStatusChange("absent")}
                  >
                    <X className="w-3 h-3 mr-1" /> Mark Absent
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs border-destructive text-destructive hover:bg-destructive/5"
                    onClick={() => {
                      setRecordToDelete(null); // Clear single record to indicate bulk delete
                      setIsDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="w-3 h-3 mr-1" /> Delete Selected
                  </Button>
                </div>
              </div>
            )}

            {loading ? <p className="text-center py-8 text-muted-foreground">Loading...</p> : filteredRecords.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No records match your filters.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {role === "admin" && (
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedIds.size === filteredRecords.length && filteredRecords.length > 0}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Select all"
                        />
                      </TableHead>
                    )}
                    <TableHead>Date</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Dept</TableHead>
                    <TableHead>Sem</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Teacher</TableHead>
                    <TableHead>Time Slot</TableHead>
                    <TableHead>Status</TableHead>
                    {role === "admin" && <TableHead>Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.map((r) => (
                    <TableRow key={r.id} className={selectedIds.has(r.id) ? "bg-primary/5" : ""}>
                      {role === "admin" && (
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(r.id)}
                            onCheckedChange={() => toggleSelect(r.id)}
                            aria-label={`Select record for ${r.student_name}`}
                          />
                        </TableCell>
                      )}
                      <TableCell>{new Date(r.date).toLocaleDateString()}</TableCell>
                      <TableCell>{r.class_name || "—"}</TableCell>
                      <TableCell>{r.student_name || "—"}</TableCell>
                      <TableCell>{r.department || "—"}</TableCell>
                      <TableCell>{r.semester || "—"}</TableCell>
                      <TableCell>{r.subject_name || "—"}</TableCell>
                      <TableCell className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                        {r.teacher_name || "—"}
                      </TableCell>
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
                      {role === "admin" && (
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleStatusToggle(r)} title="Toggle Status">
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setRecordToDelete(r);
                                setIsDeleteDialogOpen(true);
                              }}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              title="Delete Record"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                {recordToDelete ? (
                  <>This will permanently delete the attendance record for <strong>{recordToDelete.student_name}</strong> in <strong>{recordToDelete.subject_name}</strong> on <strong>{new Date(recordToDelete.date).toLocaleDateString()}</strong>. This action cannot be undone.</>
                ) : (
                  <>This will permanently delete <strong>{selectedIds.size} selected attendance records</strong>. This action cannot be undone.</>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setRecordToDelete(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={recordToDelete ? handleDelete : handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout >
  );
};

export default AttendancePage;
