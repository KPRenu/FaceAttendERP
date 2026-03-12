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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, BookOpen, RotateCcw, Check, X, Settings2, FileUp } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import ImportDialog from "@/components/admin/ImportDialog";
import { validateClassData } from "@/lib/excelUtils";

const DEPARTMENTS = ["CSE", "ECE", "ME", "EEE", "CE", "ISE", "AI&ML"];
const SECTIONS = ["A", "B", "C"];
const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];

interface ClassItem {
  id: string;
  class_name: string;
  department: string;
  section: string;
  semester: number;
  is_deleted: boolean;
}

const AdminClassesPage = () => {
  const { role } = useAuth();
  const { toast } = useToast();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ClassItem | null>(null);
  const [form, setForm] = useState({ class_name: "", department: "", section: "", semester: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [semFilter, setSemFilter] = useState("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [classToDelete, setClassToDelete] = useState<ClassItem | null>(null);

  // Bulk Selection and Actions State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkUpdateDialogOpen, setBulkUpdateDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkUpdateForm, setBulkUpdateForm] = useState({
    department: "",
    section: "",
    semester: "",
    applyDept: false,
    applySection: false,
    applySem: false
  });
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const fetchClasses = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("classes")
      .select("*")
      .eq("is_deleted", false)
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Fetch Error", description: error.message, variant: "destructive" });
    } else {
      setClasses((data || []) as ClassItem[]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchClasses(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ class_name: "", department: "", section: "", semester: "" });
    setDialogOpen(true);
  };

  const openEdit = (c: ClassItem) => {
    setEditing(c);
    setForm({ class_name: c.class_name, department: c.department, section: c.section, semester: String(c.semester) });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.class_name || !form.department || !form.section || !form.semester) {
      toast({ title: "Fill all fields", variant: "destructive" });
      return;
    }
    const payload = { class_name: form.class_name, department: form.department, section: form.section, semester: parseInt(form.semester) };
    if (editing) {
      const { error } = await supabase.from("classes").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    } else {
      const { error } = await supabase.from("classes").insert(payload);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    }
    toast({ title: editing ? "Class updated" : "Class created" });
    setDialogOpen(false);
    fetchClasses();
  };

  const promptDelete = (c: ClassItem) => {
    setClassToDelete(c);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!classToDelete) return;
    const id = classToDelete.id;
    setDeleteDialogOpen(false);

    // Optimistic UI update
    setClasses(prev => prev.filter(c => c.id !== id));

    const { error } = await supabase.from("classes").update({ is_deleted: true }).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      fetchClasses(); // Revert on error
      return;
    }

    // Cascade: mark associated timetable entries as deleted
    await supabase.from("timetable").update({ is_deleted: true }).eq("class_id", id);

    toast({ title: "Class deleted" });
    fetchClasses();
    setClassToDelete(null);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    const ids = Array.from(selectedIds);
    setBulkDeleteDialogOpen(false);

    // Optimistic UI update
    setClasses(prev => prev.filter(c => !selectedIds.has(c.id)));
    setSelectedIds(new Set());

    const { error } = await supabase.from("classes").update({ is_deleted: true }).in("id", ids);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      fetchClasses();
      return;
    }

    // Cascade: mark associated timetable entries as deleted
    await supabase.from("timetable").update({ is_deleted: true }).in("class_id", ids);

    toast({ title: `${ids.length} classes deleted` });
    fetchClasses();
  };

  const handleBulkUpdate = async () => {
    if (selectedIds.size === 0) return;
    const { applyDept, applySection, applySem, department, section, semester } = bulkUpdateForm;

    if (!applyDept && !applySection && !applySem) {
      toast({ title: "Select fields to update", variant: "destructive" });
      return;
    }

    const payload: any = {};
    if (applyDept) payload.department = department;
    if (applySection) payload.section = section;
    if (applySem) payload.semester = parseInt(semester);

    const { error } = await supabase.from("classes").update(payload).in("id", Array.from(selectedIds));

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Bulk update successful", description: `Updated ${selectedIds.size} classes` });
      setBulkUpdateDialogOpen(false);
      setSelectedIds(new Set());
      fetchClasses();
    }
  };

  const handleImportClasses = async (data: any[]) => {
    const { error } = await supabase.from("classes").insert(data);
    if (error) throw error;
    fetchClasses();
  };

  const CLASS_TEMPLATE = [
    { "Class Name": "CSE-5A", "Department": "CSE", "Section": "A", "Semester": 5 },
    { "Class Name": "ECE-3B", "Department": "ECE", "Section": "B", "Semester": 3 }
  ];

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredClasses.length && filteredClasses.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredClasses.map(c => c.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const filteredClasses = classes.filter(c => {
    const matchesSearch = c.class_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = deptFilter === "all" || c.department === deptFilter;
    const matchesSection = sectionFilter === "all" || c.section === sectionFilter;
    const matchesSem = semFilter === "all" || String(c.semester) === semFilter;
    return matchesSearch && matchesDept && matchesSection && matchesSem;
  });

  if (role !== "admin") return null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-display font-bold text-foreground">Class Management</h2>
            <p className="text-muted-foreground mt-1">Create and manage classes</p>
            <div className="mt-2">
              <Badge variant="secondary" className="font-normal">
                Total Classes: {filteredClasses.length}
              </Badge>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
              <FileUp className="w-4 h-4 mr-2" /> Import
            </Button>
            <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" /> Add Class</Button>
          </div>
        </div>

        <Card className="shadow-card">
          <CardContent className="pt-6">
            {loading ? <p className="text-center text-muted-foreground py-8">Loading...</p> : classes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>No classes yet. Click "Add Class" to create one.</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col md:flex-row gap-4 mb-6">
                  <div className="flex-1">
                    <Input
                      placeholder="Search class name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <Select value={deptFilter} onValueChange={setDeptFilter}>
                    <SelectTrigger className="w-[120px]"><SelectValue placeholder="Dept" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Depts</SelectItem>
                      {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={sectionFilter} onValueChange={setSectionFilter}>
                    <SelectTrigger className="w-[120px]"><SelectValue placeholder="Sec" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Secs</SelectItem>
                      {SECTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={semFilter} onValueChange={setSemFilter}>
                    <SelectTrigger className="w-[120px]"><SelectValue placeholder="Sem" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sems</SelectItem>
                      {SEMESTERS.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
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
                        variant="outline"
                        className="h-8 text-xs border-primary text-primary hover:bg-primary/5"
                        onClick={() => {
                          setBulkUpdateForm({
                            department: DEPARTMENTS[0],
                            section: SECTIONS[0],
                            semester: String(SEMESTERS[0]),
                            applyDept: false,
                            applySection: false,
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

                {filteredClasses.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No classes found matching filters.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={selectedIds.size === filteredClasses.length && filteredClasses.length > 0}
                            onCheckedChange={toggleSelectAll}
                          />
                        </TableHead>
                        <TableHead>Class Name</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Section</TableHead>
                        <TableHead>Semester</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredClasses.map((c) => (
                        <TableRow key={c.id} className={selectedIds.has(c.id) ? "bg-primary/5" : ""}>
                          <TableCell>
                            <Checkbox
                              checked={selectedIds.has(c.id)}
                              onCheckedChange={() => toggleSelect(c.id)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{c.class_name}</TableCell>
                          <TableCell>{c.department}</TableCell>
                          <TableCell>{c.section}</TableCell>
                          <TableCell>{c.semester}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => openEdit(c)}><Pencil className="w-3 h-3" /></Button>
                              <Button size="sm" variant="destructive" onClick={() => promptDelete(c)}><Trash2 className="w-3 h-3" /></Button>
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
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Class" : "Add Class"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Class Name *</Label>
                <Input value={form.class_name} onChange={(e) => setForm({ ...form, class_name: e.target.value })} placeholder="e.g., CSE-5A" />
              </div>
              <div className="space-y-2">
                <Label>Department *</Label>
                <Select value={form.department} onValueChange={(v) => setForm({ ...form, department: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Section *</Label>
                  <Select value={form.section} onValueChange={(v) => setForm({ ...form, section: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{SECTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Semester *</Label>
                  <Select value={form.semester} onValueChange={(v) => setForm({ ...form, semester: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{SEMESTERS.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={handleSave} className="w-full">{editing ? "Update" : "Create"} Class</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Deletion</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this class?
              </DialogDescription>
            </DialogHeader>

            {classToDelete && (
              <div className="bg-destructive/5 p-4 rounded-lg border border-destructive/10 my-4 text-center">
                <p className="font-bold text-lg text-destructive">{classToDelete.class_name}</p>
                <div className="text-sm text-muted-foreground mt-1">
                  {classToDelete.department} • Section {classToDelete.section} • Semester {classToDelete.semester}
                </div>
                <p className="text-xs mt-3 text-destructive/80 italic font-medium">
                  Note: This class will be removed from future schedules, but all past attendance records will be preserved.
                </p>
              </div>
            )}

            <DialogFooter className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={confirmDelete}>Delete Class</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Update Dialog */}
        <Dialog open={bulkUpdateDialogOpen} onOpenChange={setBulkUpdateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Bulk Update Classes</DialogTitle>
              <DialogDescription>Apply changes to {selectedIds.size} selected classes.</DialogDescription>
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
                  id="applySection"
                  checked={bulkUpdateForm.applySection}
                  onCheckedChange={(checked) => setBulkUpdateForm({ ...bulkUpdateForm, applySection: !!checked })}
                />
                <div className="flex-1 space-y-2">
                  <Label htmlFor="applySection" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Update Section
                  </Label>
                  <Select
                    disabled={!bulkUpdateForm.applySection}
                    value={bulkUpdateForm.section}
                    onValueChange={(v) => setBulkUpdateForm({ ...bulkUpdateForm, section: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SECTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
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

              <Button onClick={handleBulkUpdate} className="w-full">Update {selectedIds.size} Classes</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Bulk Delete Confirm Dialog */}
        <Dialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Bulk Deletion</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete {selectedIds.size} selected classes?
              </DialogDescription>
            </DialogHeader>
            <div className="bg-destructive/5 p-4 rounded-lg border border-destructive/10 my-4">
              <p className="text-sm text-destructive font-medium">
                Warning: This will mark these classes as deleted and remove them from future schedules. This action can be undone by an administrator through the database if necessary.
              </p>
            </div>
            <DialogFooter className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setBulkDeleteDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleBulkDelete}>Delete {selectedIds.size} Classes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ImportDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          title="Import Classes"
          onImport={handleImportClasses}
          validateData={validateClassData}
          templateData={CLASS_TEMPLATE}
          templateFilename="classes_template.xlsx"
        />
      </div>
    </DashboardLayout>
  );
};

export default AdminClassesPage;
