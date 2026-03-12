import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, BookOpen, RotateCcw, Check, X, Settings2, FileUp } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import ImportDialog from "@/components/admin/ImportDialog";
import { validateSubjectData } from "@/lib/excelUtils";

const DEPARTMENTS = ["CSE", "ECE", "ME", "EEE", "CE", "ISE", "AI&ML"];
const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];

interface SubjectItem {
  id: string;
  subject_name: string;
  subject_code: string;
  department: string;
  semester: number;
  is_deleted: boolean;
}

const AdminSubjectsPage = () => {
  const { role } = useAuth();
  const { toast } = useToast();
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SubjectItem | null>(null);
  const [form, setForm] = useState({ subject_name: "", subject_code: "", department: "", semester: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [semFilter, setSemFilter] = useState("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [subjectToDelete, setSubjectToDelete] = useState<SubjectItem | null>(null);

  // Bulk Selection and Actions State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkUpdateDialogOpen, setBulkUpdateDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkUpdateForm, setBulkUpdateForm] = useState({
    department: "",
    semester: "",
    applyDept: false,
    applySem: false
  });
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const fetchSubjects = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("subjects")
      .select("*")
      .eq("is_deleted", false)
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Fetch Error", description: error.message, variant: "destructive" });
    } else {
      setSubjects((data || []) as SubjectItem[]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchSubjects(); }, []);

  const openNew = () => { setEditing(null); setForm({ subject_name: "", subject_code: "", department: "", semester: "" }); setDialogOpen(true); };
  const openEdit = (s: SubjectItem) => { setEditing(s); setForm({ subject_name: s.subject_name, subject_code: s.subject_code, department: s.department, semester: String(s.semester) }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.subject_name || !form.subject_code || !form.department || !form.semester) {
      toast({ title: "Fill all fields", variant: "destructive" }); return;
    }
    const payload = { subject_name: form.subject_name, subject_code: form.subject_code, department: form.department, semester: parseInt(form.semester) };
    const { error } = editing
      ? await supabase.from("subjects").update(payload).eq("id", editing.id)
      : await supabase.from("subjects").insert(payload);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: editing ? "Subject updated" : "Subject created" });
    setDialogOpen(false);
    fetchSubjects();
  };

  const promptDelete = (s: SubjectItem) => {
    setSubjectToDelete(s);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!subjectToDelete) return;
    const id = subjectToDelete.id;
    setDeleteDialogOpen(false);

    // Optimistic UI update
    setSubjects(prev => prev.filter(s => s.id !== id));

    const { error } = await supabase.from("subjects").update({ is_deleted: true }).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      fetchSubjects(); // Revert on error
      return;
    }

    // Cascade: mark associated timetable entries as deleted
    await supabase.from("timetable").update({ is_deleted: true }).eq("subject_id", id);

    toast({ title: "Subject deleted" });
    fetchSubjects();
    setSubjectToDelete(null);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    const ids = Array.from(selectedIds);
    setBulkDeleteDialogOpen(false);

    // Optimistic UI update
    setSubjects(prev => prev.filter(s => !selectedIds.has(s.id)));
    setSelectedIds(new Set());

    const { error } = await supabase.from("subjects").update({ is_deleted: true }).in("id", ids);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      fetchSubjects();
      return;
    }

    // Cascade: mark associated timetable entries as deleted
    await supabase.from("timetable").update({ is_deleted: true }).in("subject_id", ids);

    toast({ title: `${ids.length} subjects deleted` });
    fetchSubjects();
  };

  const handleBulkUpdate = async () => {
    if (selectedIds.size === 0) return;
    const { applyDept, applySem, department, semester } = bulkUpdateForm;

    if (!applyDept && !applySem) {
      toast({ title: "Select fields to update", variant: "destructive" });
      return;
    }

    const payload: any = {};
    if (applyDept) payload.department = department;
    if (applySem) payload.semester = parseInt(semester);

    const { error } = await supabase.from("subjects").update(payload).in("id", Array.from(selectedIds));

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Bulk update successful", description: `Updated ${selectedIds.size} subjects` });
      setBulkUpdateDialogOpen(false);
      setSelectedIds(new Set());
      fetchSubjects();
    }
  };

  const handleImportSubjects = async (data: any[]) => {
    const { error } = await supabase.from("subjects").insert(data);
    if (error) throw error;
    fetchSubjects();
  };

  const SUBJECT_TEMPLATE = [
    { "Subject Name": "Mathematics-III", "Subject Code": "21MAT31", "Department": "CSE", "Semester": 3 },
    { "Subject Name": "Data Structures", "Subject Code": "21CS32", "Department": "CSE", "Semester": 3 }
  ];

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredSubjects.length && filteredSubjects.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSubjects.map(s => s.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const filteredSubjects = subjects.filter(s => {
    const matchesSearch = s.subject_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.subject_code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = deptFilter === "all" || s.department === deptFilter;
    const matchesSem = semFilter === "all" || String(s.semester) === semFilter;
    return matchesSearch && matchesDept && matchesSem;
  });

  if (role !== "admin") return null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-display font-bold text-foreground">Subject Management</h2>
            <p className="text-muted-foreground mt-1">Create and manage subjects</p>
            <div className="mt-2">
              <Badge variant="secondary" className="font-normal">
                Total Subjects: {filteredSubjects.length}
              </Badge>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
              <FileUp className="w-4 h-4 mr-2" /> Import
            </Button>
            <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" /> Add Subject</Button>
          </div>
        </div>
        <Card className="shadow-card">
          <CardContent className="pt-6">
            {loading ? <p className="text-center text-muted-foreground py-8">Loading...</p> : subjects.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-50" /><p>No subjects yet.</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col md:flex-row gap-4 mb-6">
                  <div className="flex-1">
                    <Input
                      placeholder="Search subject name or code..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <Select value={deptFilter} onValueChange={setDeptFilter}>
                    <SelectTrigger className="w-[150px]"><SelectValue placeholder="Department" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Depts</SelectItem>
                      {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={semFilter} onValueChange={setSemFilter}>
                    <SelectTrigger className="w-[150px]"><SelectValue placeholder="Semester" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sems</SelectItem>
                      {SEMESTERS.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {selectedIds.size > 0 && (
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
                        variant="outline"
                        className="h-8 text-xs border-primary text-primary hover:bg-primary/5"
                        onClick={() => {
                          setBulkUpdateForm({
                            department: DEPARTMENTS[0],
                            semester: String(SEMESTERS[0]),
                            applyDept: false,
                            applySem: false
                          });
                          setBulkUpdateDialogOpen(true);
                        }}
                      >
                        <Settings2 className="w-3 h-3 mr-1" /> Bulk Update
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-8 text-xs"
                        onClick={() => setBulkDeleteDialogOpen(true)}
                      >
                        <Trash2 className="w-3 h-3 mr-1" /> Bulk Delete
                      </Button>
                    </div>
                  </div>
                )}

                {filteredSubjects.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No subjects found matching filters.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={selectedIds.size === filteredSubjects.length && filteredSubjects.length > 0}
                            onCheckedChange={toggleSelectAll}
                          />
                        </TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Dept</TableHead>
                        <TableHead>Sem</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSubjects.map((s) => (
                        <TableRow key={s.id} className={selectedIds.has(s.id) ? "bg-primary/5" : ""}>
                          <TableCell>
                            <Checkbox
                              checked={selectedIds.has(s.id)}
                              onCheckedChange={() => toggleSelect(s.id)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{s.subject_name}</TableCell>
                          <TableCell>{s.subject_code}</TableCell>
                          <TableCell>{s.department}</TableCell>
                          <TableCell>{s.semester}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => openEdit(s)}><Pencil className="w-3 h-3" /></Button>
                              <Button size="sm" variant="destructive" onClick={() => promptDelete(s)}><Trash2 className="w-3 h-3" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </>
            )}
          </CardContent>
        </Card>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Edit Subject" : "Add Subject"}</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2"><Label>Subject Name *</Label><Input value={form.subject_name} onChange={(e) => setForm({ ...form, subject_name: e.target.value })} /></div>
              <div className="space-y-2"><Label>Subject Code *</Label><Input value={form.subject_code} onChange={(e) => setForm({ ...form, subject_code: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Department *</Label>
                  <Select value={form.department} onValueChange={(v) => setForm({ ...form, department: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Semester *</Label>
                  <Select value={form.semester} onValueChange={(v) => setForm({ ...form, semester: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{SEMESTERS.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={handleSave} className="w-full">{editing ? "Update" : "Create"} Subject</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Deletion</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this subject?
              </DialogDescription>
            </DialogHeader>

            {subjectToDelete && (
              <div className="bg-destructive/5 p-4 rounded-lg border border-destructive/10 my-4 text-center">
                <p className="font-bold text-lg text-destructive">{subjectToDelete.subject_name}</p>
                <div className="text-sm text-muted-foreground mt-1">
                  Code: {subjectToDelete.subject_code} • Dept: {subjectToDelete.department} • Semester {subjectToDelete.semester}
                </div>
                <p className="text-xs mt-3 text-destructive/80 italic font-medium">
                  Note: This subject will be removed from future use, but all past attendance records will be preserved.
                </p>
              </div>
            )}

            <DialogFooter className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={confirmDelete}>Delete Subject</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Update Dialog */}
        <Dialog open={bulkUpdateDialogOpen} onOpenChange={setBulkUpdateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Bulk Update Subjects</DialogTitle>
              <DialogDescription>Apply changes to {selectedIds.size} selected subjects.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-3 space-y-0">
                <Checkbox
                  id="applyDept"
                  checked={bulkUpdateForm.applyDept}
                  onCheckedChange={(checked) => setBulkUpdateForm({ ...bulkUpdateForm, applyDept: !!checked })}
                />
                <div className="flex-1 space-y-2">
                  <Label htmlFor="applyDept" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Update Department
                  </Label>
                  <Select
                    disabled={!bulkUpdateForm.applyDept}
                    value={bulkUpdateForm.department}
                    onValueChange={(v) => setBulkUpdateForm({ ...bulkUpdateForm, department: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-3 space-y-0">
                <Checkbox
                  id="applySem"
                  checked={bulkUpdateForm.applySem}
                  onCheckedChange={(checked) => setBulkUpdateForm({ ...bulkUpdateForm, applySem: !!checked })}
                />
                <div className="flex-1 space-y-2">
                  <Label htmlFor="applySem" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Update Semester
                  </Label>
                  <Select
                    disabled={!bulkUpdateForm.applySem}
                    value={bulkUpdateForm.semester}
                    onValueChange={(v) => setBulkUpdateForm({ ...bulkUpdateForm, semester: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SEMESTERS.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <Button onClick={handleBulkUpdate} className="w-full">Update {selectedIds.size} Subjects</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Bulk Delete Confirm Dialog */}
        <Dialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Bulk Deletion</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete {selectedIds.size} selected subjects?
              </DialogDescription>
            </DialogHeader>
            <div className="bg-destructive/5 p-4 rounded-lg border border-destructive/10 my-4">
              <p className="text-sm text-destructive font-medium">
                Warning: This will mark these subjects as deleted and remove them from future use.
              </p>
            </div>
            <DialogFooter className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setBulkDeleteDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleBulkDelete}>Delete {selectedIds.size} Subjects</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ImportDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          title="Import Subjects"
          onImport={handleImportSubjects}
          validateData={validateSubjectData}
          templateData={SUBJECT_TEMPLATE}
          templateFilename="subjects_template.xlsx"
        />
      </div>
    </DashboardLayout>
  );
};

export default AdminSubjectsPage;
