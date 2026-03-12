import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Calendar, Search, FileUp } from "lucide-react";
import { formatTime } from "@/lib/utils";
import ImportDialog from "@/components/admin/ImportDialog";
import { validateTimetableData } from "@/lib/excelUtils";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface ClassItem { id: string; class_name: string; department: string; section: string; semester: number; }
interface SubjectItem { id: string; subject_name: string; subject_code: string; department: string; semester: number; }
interface TeacherProfile { user_id: string; full_name: string | null; department: string | null; }
interface TimetableEntry {
  id: string;
  class_id: string;
  subject_id: string;
  teacher_id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  room_no: string;
  is_deleted?: boolean;
}

const AdminTimetablePage = () => {
  const { role } = useAuth();
  const { toast } = useToast();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [teachers, setTeachers] = useState<TeacherProfile[]>([]);
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [classSearch, setClassSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TimetableEntry | null>(null);
  const [form, setForm] = useState({ subject_id: "", teacher_id: "", day_of_week: "", start_time: "", end_time: "", room_no: "" });
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [allClasses, setAllClasses] = useState<ClassItem[]>([]);
  const [allSubjects, setAllSubjects] = useState<SubjectItem[]>([]);
  const [allTeachers, setAllTeachers] = useState<any[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const [c, s, t] = await Promise.all([
        supabase.from("classes").select("*").eq("is_deleted", false),
        supabase.from("subjects").select("*").eq("is_deleted", false),
        supabase.from("user_roles").select("user_id").eq("role", "teacher"),
      ]);
      setClasses((c.data || []) as ClassItem[]);
      setAllClasses((c.data || []) as ClassItem[]);
      setSubjects((s.data || []) as SubjectItem[]);
      setAllSubjects((s.data || []) as SubjectItem[]);
      if (t.data) {
        const ids = t.data.map((r) => r.user_id);
        if (ids.length > 0) {
          const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, department, email").in("user_id", ids);
          setTeachers((profiles || []) as TeacherProfile[]);
          setAllTeachers(profiles || []);
        }
      }
    };
    fetch();
  }, []);

  useEffect(() => {
    if (selectedClass) {
      supabase.from("timetable").select("*").eq("class_id", selectedClass).eq("is_deleted", false).then(({ data }) => {
        setEntries((data || []) as TimetableEntry[]);
      });
    }
  }, [selectedClass]);

  const selectedClassData = classes.find((c) => c.id === selectedClass);
  const filteredSubjects = selectedClassData ? subjects.filter((s) => s.department === selectedClassData.department && s.semester === selectedClassData.semester) : [];
  const filteredTeachers = selectedClassData ? teachers.filter((t) => t.department === selectedClassData.department) : [];

  const getSubjectName = (id: string) => subjects.find((s) => s.id === id)?.subject_name || "—";
  const getTeacherName = (id: string) => teachers.find((t) => t.user_id === id)?.full_name || "—";

  const openNew = (day?: string) => {
    setEditing(null);
    setForm({
      subject_id: "",
      teacher_id: "",
      day_of_week: typeof day === 'string' ? day : "",
      start_time: "",
      end_time: "",
      room_no: ""
    });
    setDialogOpen(true);
  };
  const openEdit = (e: TimetableEntry) => { setEditing(e); setForm({ subject_id: e.subject_id, teacher_id: e.teacher_id, day_of_week: e.day_of_week, start_time: e.start_time, end_time: e.end_time, room_no: e.room_no }); setDialogOpen(true); };

  // ... (abriged)

  const handleSave = async () => {
    if (!form.subject_id || !form.teacher_id || !form.day_of_week || !form.start_time || !form.end_time || !form.room_no) {
      toast({ title: "Fill all fields", variant: "destructive" }); return;
    }
    const payload = { class_id: selectedClass, ...form, is_deleted: false };
    const { error } = editing
      ? await supabase.from("timetable").update(payload).eq("id", editing.id)
      : await supabase.from("timetable").insert(payload);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: editing ? "Entry updated" : "Entry added" });
    setDialogOpen(false);
    const { data } = await supabase.from("timetable").select("*").eq("class_id", selectedClass).eq("is_deleted", false);
    setEntries((data || []) as TimetableEntry[]);
  };

  const handleDelete = async (id: string) => {
    // Soft delete: Update is_deleted to true
    await supabase.from("timetable").update({ is_deleted: true }).eq("id", id);
    toast({ title: "Entry deleted" });
    const { data } = await supabase.from("timetable").select("*").eq("class_id", selectedClass).eq("is_deleted", false);
    setEntries((data || []) as TimetableEntry[]);
  };

  const handleImportTimetable = async (data: any[]) => {
    const { error } = await supabase.from("timetable").insert(data);
    if (error) throw error;
    if (selectedClass) {
      const { data: entries } = await supabase.from("timetable").select("*").eq("class_id", selectedClass).eq("is_deleted", false);
      setEntries((entries || []) as TimetableEntry[]);
    }
  };

  const validateTimetable = (rows: any[]) => {
    const teachersMap = Object.fromEntries(allTeachers.map(t => [t.email?.toLowerCase() || "", t.user_id]));
    const classesMap = Object.fromEntries(allClasses.map(c => [c.class_name, c.id]));
    const subjectsMap = Object.fromEntries(allSubjects.map(s => [s.subject_name, s.id]));
    
    return validateTimetableData(rows, teachersMap, classesMap, subjectsMap);
  };

  const TIMETABLE_TEMPLATE = [
    { 
      "Teacher Email": "teacher@example.com", 
      "Class Name": "CSE-5A", 
      "Subject Name": "Data Structures", 
      "Day": "Monday", 
      "Start Time": "09:00", 
      "End Time": "10:00", 
      "Room No": "101" 
    }
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">Timetable Management</h2>
          <p className="text-muted-foreground mt-1">Select a class to view and assign timetable entries</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar - Class Selection */}
          <div className="w-full lg:w-72 space-y-4">
            <Card className="shadow-card sticky top-20">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-display flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-primary" /> Select Class
                </CardTitle>
                <div className="relative mt-2">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search class..."
                    value={classSearch}
                    onChange={(e) => setClassSearch(e.target.value)}
                    className="pl-8 bg-muted/50 border-none h-9 text-sm"
                  />
                </div>
              </CardHeader>
              <CardContent className="px-2 pb-2 mr-2 overflow-y-auto max-h-[calc(100vh-280px)] thin-scrollbar">
                <div className="space-y-1">
                  {classes
                    .filter(c =>
                      c.class_name.toLowerCase().includes(classSearch.toLowerCase()) ||
                      c.department.toLowerCase().includes(classSearch.toLowerCase())
                    )
                    .map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setSelectedClass(c.id)}
                        className={`w-full text-left px-3 py-2.5 rounded-md text-sm transition-all duration-200 ${selectedClass === c.id
                          ? "bg-primary text-primary-foreground shadow-md font-semibold scale-[1.02]"
                          : "hover:bg-accent text-muted-foreground hover:text-foreground"
                          }`}
                      >
                        <div className="font-medium truncate">{c.class_name}</div>
                        <div className={`text-[10px] ${selectedClass === c.id ? "text-primary-foreground/80" : "text-muted-foreground/70"}`}>
                          {c.department} • Sec {c.section} • Sem {c.semester}
                        </div>
                      </button>
                    ))}
                  {classes.filter(c =>
                    c.class_name.toLowerCase().includes(classSearch.toLowerCase()) ||
                    c.department.toLowerCase().includes(classSearch.toLowerCase())
                  ).length === 0 && (
                      <div className="text-center py-8 text-xs text-muted-foreground">
                        No classes found
                      </div>
                    )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content - Timetable Grid */}
          <div className="flex-1 space-y-4">
            {!selectedClass ? (
              <Card className="shadow-card border-dashed flex flex-col items-center justify-center py-20 text-center bg-muted/20">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Calendar className="w-8 h-8 text-primary opacity-50" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">Choose a class</h3>
                <p className="text-muted-foreground max-w-[250px] mx-auto mt-1">
                  Select a class from the sidebar to view and manage its timetable.
                </p>
              </Card>
            ) : (
              <div className="space-y-6 animate-fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card p-4 rounded-xl border shadow-sm">
                  <div>
                    <h3 className="text-lg font-bold text-foreground">
                      {selectedClassData?.class_name}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(true)}>
                      <FileUp className="w-4 h-4 mr-2" /> Import
                    </Button>
                    <Button onClick={() => openNew()} size="sm" className="shadow-sm">
                      <Plus className="w-4 h-4 mr-2" /> Add Entry
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
                  <h2 className="text-xl font-display font-semibold flex items-center gap-2">
                    Timetable for {selectedClassData?.class_name}
                  </h2>

                  {/* Week Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
                    {DAYS.map((day) => {
                      const dayEntries = entries
                        .filter((e) => e.day_of_week === day)
                        .sort((a, b) => a.start_time.localeCompare(b.start_time));

                      return (
                        <div key={day} className="flex flex-col gap-3 min-h-[350px] bg-secondary/20 p-3 rounded-lg border border-border/50">
                          <div
                            className="flex items-center justify-between font-semibold text-muted-foreground border-b border-border/50 pb-2 mb-1 cursor-pointer hover:text-primary transition-colors group"
                            onClick={() => openNew(day)}
                          >
                            <span>{day}</span>
                            <Plus className="w-3 h-3 opacity-50 group-hover:opacity-100" />
                          </div>

                          <div className="flex flex-col gap-2 flex-1">
                            {dayEntries.length === 0 ? (
                              <div
                                className="flex-1 flex flex-col items-center justify-center cursor-pointer group/empty border-2 border-dashed border-transparent hover:border-primary/20 rounded-md transition-all"
                                onClick={() => openNew(day)}
                              >
                                <div className="text-[10px] text-muted-foreground text-center italic py-4 opacity-40 group-hover/empty:opacity-100 group-hover/empty:text-primary transition-all">
                                  <Plus className="w-4 h-4 mx-auto mb-1 opacity-20 group-hover/empty:opacity-100" />
                                  Add class
                                </div>
                              </div>
                            ) : (
                              dayEntries.map((e) => (
                                <div
                                  key={e.id}
                                  onClick={() => openEdit(e)}
                                  className="relative group cursor-pointer bg-card hover:bg-accent/50 p-3 rounded-md border shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-1"
                                >
                                  {/* Color Bar */}
                                  <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-md ${["bg-red-400", "bg-blue-400", "bg-green-400", "bg-yellow-400", "bg-purple-400", "bg-pink-400", "bg-indigo-400", "bg-orange-400"][
                                    e.subject_id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % 8
                                  ]
                                    }`} />

                                  <div className="pl-2 space-y-1">
                                    <div className="font-bold text-sm leading-tight text-foreground">
                                      {getSubjectName(e.subject_id)}
                                    </div>
                                    <div className="text-xs font-medium text-primary flex items-center gap-1">
                                      <span className="opacity-75">{formatTime(e.start_time)} - {formatTime(e.end_time)}</span>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {getTeacherName(e.teacher_id)}
                                    </div>
                                    <div className="text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded inline-block">
                                      Room: {e.room_no}
                                    </div>
                                  </div>

                                  {/* Hover Actions */}
                                  <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6 text-destructive hover:bg-destructive/10"
                                      onClick={(ev) => {
                                        ev.stopPropagation(); // Prevent opening edit modal
                                        handleDelete(e.id);
                                      }}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Timetable Entry" : "Add Timetable Entry"}</DialogTitle>
              <DialogDescription>
                {editing ? "Modify the details of this timetable entry." : "Fill in the details to create a new timetable entry."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2"><Label>Day *</Label>
                <Select value={form.day_of_week} onValueChange={(v) => setForm({ ...form, day_of_week: v })}>
                  <SelectTrigger><SelectValue placeholder="Select day" /></SelectTrigger>
                  <SelectContent>{DAYS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Start Time *</Label><Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></div>
                <div className="space-y-2"><Label>End Time *</Label><Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></div>
              </div>
              <div className="space-y-2"><Label>Room No. *</Label><Input value={form.room_no} onChange={(e) => setForm({ ...form, room_no: e.target.value })} /></div>
              <div className="space-y-2"><Label>Subject *</Label>
                <Select value={form.subject_id} onValueChange={(v) => setForm({ ...form, subject_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                  <SelectContent>{filteredSubjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.subject_name} ({s.subject_code})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Teacher *</Label>
                <Select value={form.teacher_id} onValueChange={(v) => setForm({ ...form, teacher_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select teacher" /></SelectTrigger>
                  <SelectContent>{filteredTeachers.map((t) => <SelectItem key={t.user_id} value={t.user_id}>{t.full_name || "Unknown"}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button onClick={handleSave} className="w-full">{editing ? "Update" : "Add"} Entry</Button>
            </div>
          </DialogContent>
        </Dialog>

        <ImportDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          title="Import Timetable Entries"
          onImport={handleImportTimetable}
          validateData={validateTimetable}
          templateData={TIMETABLE_TEMPLATE}
          templateFilename="timetable_template.xlsx"
        />
      </div>
    </DashboardLayout>
  );
};

export default AdminTimetablePage;
