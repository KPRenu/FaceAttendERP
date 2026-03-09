import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CheckCircle, XCircle, Clock, Users, Trash2, MessageSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RotateCcw, Check, X, Settings2 } from "lucide-react";

const DEPARTMENTS = ["CSE", "ECE", "ME", "EEE", "CE", "ISE", "AI&ML"];
const SECTIONS = ["A", "B", "C", "D"];
const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];

interface UserProfile {
  id: string;
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  photo_status: string;
  department: string | null;
  usn: string | null;
  teacher_id: string | null;
  profile_completed: boolean;
  email?: string | null;
  role?: string;
}

const AdminUsersPage = () => {
  const { role } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [verificationDialogOpen, setVerificationDialogOpen] = useState(false);
  const [deleteUserDialogOpen, setDeleteUserDialogOpen] = useState(false);
  const [messageDialogOpen, setMessageDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [userToMessage, setUserToMessage] = useState<UserProfile | null>(null);
  const [adminMessage, setAdminMessage] = useState("");

  // Bulk Selection and Actions State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkVerifyDialogOpen, setBulkVerifyDialogOpen] = useState(false);
  const [bulkEditDialogOpen, setBulkEditDialogOpen] = useState(false);
  const [bulkMessageDialogOpen, setBulkMessageDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkEditForm, setBulkEditForm] = useState({
    department: DEPARTMENTS[0],
    section: SECTIONS[0],
    semester: String(SEMESTERS[0]),
    applyDept: false,
    applySection: false,
    applySem: false
  });
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkActionType, setBulkActionType] = useState<"verified" | "rejected" | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    const { data: profiles } = await supabase.from("profiles").select("*").eq("profile_completed", true);
    if (profiles) {
      // Fetch roles for each user
      const userIds = profiles.map((p) => p.user_id);
      const { data: roles } = await supabase.from("user_roles").select("user_id, role").in("user_id", userIds);
      const roleMap = new Map(roles?.map((r) => [r.user_id, r.role]) || []);

      const { data: { user } } = await supabase.auth.getUser();
      const allUsers = profiles.map((p) => ({ ...p, role: roleMap.get(p.user_id) || "unknown" })) as UserProfile[];

      // Filter out current admin
      setUsers(allUsers.filter(u => u.user_id !== user?.id));
    }
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const imageUrlToBase64 = async (url: string): Promise<string> => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      // Target 400px for a good balance of speed and detection accuracy
      const maxDim = 400;
      let width = bitmap.width;
      let height = bitmap.height;

      if (width > height) {
        if (width > maxDim) {
          height *= maxDim / width;
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width *= maxDim / height;
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx?.drawImage(bitmap, 0, 0, width, height);

      return canvas.toDataURL("image/jpeg", 0.85); // High quality but compressed
    } catch (err) {
      console.error("Error resizing image:", err);
      throw new Error("Failed to process image for verification.");
    }
  };

  const updatePhotoStatus = async (userId: string, status: string) => {
    setLoading(true);
    try {
      if (status === "verified") {
        const userToVerify = users.find(u => u.user_id === userId);
        if (userToVerify?.avatar_url) {
          toast({ title: "Processing", description: "Preparing image for verification..." });
          const base64Image = await imageUrlToBase64(userToVerify.avatar_url);

          const aiServerUrl = import.meta.env.VITE_AI_SERVER_URL || 'http://localhost:8000';
          const response = await fetch(`${aiServerUrl}/generate-embedding`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId, image: base64Image })
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || "Failed to generate face embedding");
          }
          toast({ title: "Embedding Generated", description: "Face pattern stored successfully." });
        }
      }

      const { error } = await supabase.from("profiles").update({ photo_status: status }).eq("user_id", userId);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Updated", description: `Photo ${status} successfully.` });
        fetchUsers();
      }
    } catch (err: any) {
      toast({ title: "Verification Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const openVerificationDialog = (user: UserProfile) => {
    setSelectedUser(user);
    setVerificationDialogOpen(true);
  };

  const confirmReject = () => {
    if (selectedUser) {
      updatePhotoStatus(selectedUser.user_id, "rejected");
      setVerificationDialogOpen(false);
      setSelectedUser(null);
    }
  };

  const confirmVerify = () => {
    if (selectedUser) {
      updatePhotoStatus(selectedUser.user_id, "verified");
      setVerificationDialogOpen(false);
      setSelectedUser(null);
    }
  };

  const promptDeleteUser = (user: UserProfile) => {
    setUserToDelete(user);
    setDeleteUserDialogOpen(true);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    setLoading(true);
    setDeleteUserDialogOpen(false);

    try {
      // 1. Delete face patterns if they exist (local face_server)
      const aiServerUrl = import.meta.env.VITE_AI_SERVER_URL || 'http://localhost:8000';
      await fetch(`${aiServerUrl}/delete-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userToDelete.user_id })
      }).catch(err => console.error("Error deleting embedding:", err));

      // 2. Call the RPC to delete from Supabase Auth and Profiles
      const { error } = await supabase.rpc('delete_user_by_admin', { target_user_id: userToDelete.user_id });

      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "User Deleted", description: "The user has been permanently removed." });
        fetchUsers();
      }
    } catch (err: any) {
      toast({ title: "Deletion Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setUserToDelete(null);
    }
  };

  const handleSendMessage = async () => {
    if (!userToMessage || !adminMessage.trim()) return;
    setLoading(true);
    try {
      const { error } = await supabase.from("issues").insert({
        user_id: userToMessage.user_id,
        subject: "Message from Admin",
        description: adminMessage,
        is_admin_initiated: true,
        status: "open"
      });

      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Message Sent", description: `Message sent to ${userToMessage.full_name}` });
        setMessageDialogOpen(false);
        setAdminMessage("");
        setUserToMessage(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBulkPhotoStatus = async (status: "verified" | "rejected") => {
    if (selectedIds.size === 0) return;
    setLoading(true);
    setBulkVerifyDialogOpen(false);

    const ids = Array.from(selectedIds);
    let successCount = 0;
    let failCount = 0;

    for (const id of ids) {
      try {
        if (status === "verified") {
          const user = users.find(u => u.user_id === id);
          if (user?.avatar_url) {
            const base64Image = await imageUrlToBase64(user.avatar_url);
            const aiServerUrl = import.meta.env.VITE_AI_SERVER_URL || 'http://localhost:8000';
            await fetch(`${aiServerUrl}/generate-embedding`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ user_id: id, image: base64Image })
            });
          }
        }

        const { error } = await supabase.from("profiles").update({ photo_status: status }).eq("user_id", id);
        if (error) throw error;
        successCount++;
      } catch (err) {
        console.error(`Error processing user ${id}:`, err);
        failCount++;
      }
    }

    toast({
      title: "Batch Update Complete",
      description: `Successfully ${status} ${successCount} users. ${failCount > 0 ? `${failCount} failed.` : ""}`
    });

    setSelectedIds(new Set());
    fetchUsers();
    setLoading(false);
  };

  const handleBulkEdit = async () => {
    if (selectedIds.size === 0) return;
    const { applyDept, applySection, applySem, department, section, semester } = bulkEditForm;

    if (!applyDept && !applySection && !applySem) {
      toast({ title: "Select fields to update", variant: "destructive" });
      return;
    }

    setLoading(true);
    const payload: any = {};
    if (applyDept) payload.department = department;
    if (applySection) payload.section = section;
    if (applySem) payload.semester = parseInt(semester);

    const { error } = await supabase.from("profiles").update(payload).in("user_id", Array.from(selectedIds));

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Bulk update successful", description: `Updated ${selectedIds.size} users` });
      setBulkEditDialogOpen(false);
      setSelectedIds(new Set());
      fetchUsers();
    }
    setLoading(false);
  };

  const handleBulkMessage = async () => {
    if (selectedIds.size === 0 || !bulkMessage.trim()) return;
    setLoading(true);

    const ids = Array.from(selectedIds);
    const issues = ids.map(id => ({
      user_id: id,
      subject: "Message from Admin",
      description: bulkMessage,
      is_admin_initiated: true,
      status: "open"
    }));

    const { error } = await supabase.from("issues").insert(issues);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Broadcast Sent", description: `Message sent to ${ids.length} users` });
      setBulkMessageDialogOpen(false);
      setBulkMessage("");
      setSelectedIds(new Set());
    }
    setLoading(false);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setLoading(true);
    setBulkDeleteDialogOpen(false);

    const ids = Array.from(selectedIds);
    let successCount = 0;

    for (const userId of ids) {
      try {
        const aiServerUrl = import.meta.env.VITE_AI_SERVER_URL || 'http://localhost:8000';
        await fetch(`${aiServerUrl}/delete-user`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId })
        }).catch(() => { });

        const { error } = await supabase.rpc('delete_user_by_admin', { target_user_id: userId });
        if (!error) successCount++;
      } catch (err) {
        console.error(`Error deleting user ${userId}:`, err);
      }
    }

    toast({ title: "Deletion Complete", description: `Successfully removed ${successCount} user accounts.` });
    setSelectedIds(new Set());
    fetchUsers();
    setLoading(false);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredUsers.length && filteredUsers.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredUsers.map(u => u.user_id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };


  const filteredUsers = users.filter(user => {
    const matchesSearch = (
      (user.full_name?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
      (user.usn?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
      (user.teacher_id?.toLowerCase() || "").includes(searchQuery.toLowerCase())
    );
    const matchesRole = roleFilter === "all" || user.role === roleFilter;
    const matchesDept = deptFilter === "all" || user.department === deptFilter;
    const matchesStatus = statusFilter === "all" || user.photo_status === statusFilter;

    return matchesSearch && matchesRole && matchesDept && matchesStatus;
  });

  const departments = Array.from(new Set(users.map(u => u.department).filter(Boolean)));

  if (role !== "admin") return null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">User Management</h2>
          <p className="text-muted-foreground mt-1">Verify photos and manage all users</p>
          <div className="mt-2">
            <Badge variant="secondary" className="font-normal">
              Total Users: {filteredUsers.length}
            </Badge>
          </div>
        </div>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <Users className="w-5 h-5" /> All Users ({filteredUsers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="flex-1">
                <Input
                  placeholder="Search name, USN, or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="teacher">Teacher</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <Select value={deptFilter} onValueChange={setDeptFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Depts</SelectItem>
                  {departments.map(d => (
                    <SelectItem key={d} value={d as string}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
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
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs border-success text-success hover:bg-success/5"
                    onClick={() => {
                      setBulkActionType("verified");
                      setBulkVerifyDialogOpen(true);
                    }}
                  >
                    <CheckCircle className="w-3 h-3 mr-1" /> Verify
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs border-destructive text-destructive hover:bg-destructive/5"
                    onClick={() => {
                      setBulkActionType("rejected");
                      setBulkVerifyDialogOpen(true);
                    }}
                  >
                    <XCircle className="w-3 h-3 mr-1" /> Reject
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs border-primary text-primary hover:bg-primary/5"
                    onClick={() => setBulkEditDialogOpen(true)}
                  >
                    <Settings2 className="w-3 h-3 mr-1" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs border-primary text-primary hover:bg-primary/5"
                    onClick={() => setBulkMessageDialogOpen(true)}
                  >
                    <MessageSquare className="w-3 h-3 mr-1" /> Message
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-8 text-xs"
                    onClick={() => setBulkDeleteDialogOpen(true)}
                  >
                    <Trash2 className="w-3 h-3 mr-1" /> Delete
                  </Button>
                </div>
              </div>
            )}

            {loading ? (
              <p className="text-muted-foreground py-8 text-center">Loading users...</p>
            ) : filteredUsers.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center">No users found matching filters.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedIds.size === filteredUsers.length && filteredUsers.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Photo</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>ID</TableHead>
                      <TableHead>Photo Status</TableHead>
                      <TableHead>Actions</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Delete</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((u) => (
                      <TableRow key={u.id} className={selectedIds.has(u.user_id) ? "bg-primary/5" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(u.user_id)}
                            onCheckedChange={() => toggleSelect(u.user_id)}
                          />
                        </TableCell>
                        <TableCell>
                          <Avatar className="w-10 h-10">
                            <AvatarImage src={u.avatar_url || ""} />
                            <AvatarFallback>{u.full_name?.[0] || "?"}</AvatarFallback>
                          </Avatar>
                        </TableCell>
                        <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                            {u.role}
                          </Badge>
                        </TableCell>
                        <TableCell>{u.department || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{u.usn || u.teacher_id || "—"}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              u.photo_status === "verified" ? "border-success text-success"
                                : u.photo_status === "rejected" ? "border-destructive text-destructive"
                                  : "border-warning text-warning"
                            }
                          >
                            {u.photo_status === "verified" && <CheckCircle className="w-3 h-3 mr-1" />}
                            {u.photo_status === "rejected" && <XCircle className="w-3 h-3 mr-1" />}
                            {u.photo_status === "pending" && <Clock className="w-3 h-3 mr-1" />}
                            {u.photo_status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {u.photo_status === "pending" && (
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => openVerificationDialog(u)} className="bg-success hover:bg-success/90 text-success-foreground">
                                Verify
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => openVerificationDialog(u)}>
                                Reject
                              </Button>
                            </div>
                          )}
                          {u.photo_status === "verified" && (
                            <Button size="sm" variant="destructive" onClick={() => openVerificationDialog(u)}>
                              Reject
                            </Button>
                          )}
                          {u.photo_status === "rejected" && (
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => openVerificationDialog(u)} className="bg-success hover:bg-success/90 text-success-foreground">
                                Verify
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => updatePhotoStatus(u.user_id, "pending")}>
                                Reset
                              </Button>
                            </div>
                          )}
                          <Button size="sm" variant="outline" onClick={() => navigate(`/dashboard/profile/${u.user_id}`)}>
                            Edit
                          </Button>
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" onClick={() => { setUserToMessage(u); setMessageDialogOpen(true); }}>
                            <MessageSquare className="w-4 h-4 text-primary" />
                          </Button>
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="destructive" onClick={() => promptDeleteUser(u)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={verificationDialogOpen} onOpenChange={setVerificationDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Photo Verification</DialogTitle>
              <DialogDescription>
                Review the profile photo and take an action. Verified photos enable face attendance.
              </DialogDescription>
            </DialogHeader>

            {selectedUser && (
              <div className="flex flex-col items-center gap-4 py-4">
                <Avatar className="w-48 h-48 border-4 border-primary/10">
                  <AvatarImage src={selectedUser.avatar_url || ""} className="object-cover" />
                  <AvatarFallback className="text-4xl font-bold bg-primary/5 text-primary">
                    {selectedUser.full_name?.[0] || "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="text-center space-y-1">
                  <p className="font-bold text-xl text-foreground">{selectedUser.full_name}</p>
                  <div className="flex items-center justify-center gap-2">
                    <Badge variant="secondary">{selectedUser.role}</Badge>
                    <span className="text-sm text-muted-foreground">•</span>
                    <span className="text-sm font-medium text-muted-foreground">
                      {selectedUser.role === 'student' ? `USN: ${selectedUser.usn}` : `ID: ${selectedUser.teacher_id}`}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold pt-1">
                    {selectedUser.department} Department
                  </p>
                </div>
              </div>
            )}

            <DialogFooter className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setVerificationDialogOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  onClick={confirmReject}
                  className="px-6"
                >
                  Reject
                </Button>
                <Button
                  onClick={confirmVerify}
                  className="bg-success hover:bg-success/90 text-success-foreground px-6"
                >
                  Verify
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteUserDialogOpen} onOpenChange={setDeleteUserDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="w-5 h-5" />
                Confirm User Deletion
              </DialogTitle>
              <DialogDescription>
                This action is permanent and cannot be undone. All data for this user will be completely removed.
              </DialogDescription>
            </DialogHeader>

            {userToDelete && (
              <div className="bg-destructive/5 p-4 rounded-lg border border-destructive/10 my-4 text-center">
                <p className="font-bold text-lg text-destructive">{userToDelete.full_name}</p>
                <div className="text-sm text-muted-foreground mt-1">
                  {userToDelete.role} • {userToDelete.usn || userToDelete.teacher_id}
                </div>
                <p className="text-xs mt-3 text-destructive/80 italic font-medium">
                  Note: The user will be removed from future use and will need to sign up again to access the system.
                </p>
              </div>
            )}

            <DialogFooter className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteUserDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={confirmDeleteUser}>Delete User Account</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={messageDialogOpen} onOpenChange={setMessageDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-primary" />
                Send Message to User
              </DialogTitle>
              <DialogDescription>
                This message will appear in the user's Issues dashboard.
              </DialogDescription>
            </DialogHeader>

            {userToMessage && (
              <div className="space-y-4 py-2">
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={userToMessage.avatar_url || ""} />
                    <AvatarFallback>{userToMessage.full_name?.[0]}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold">{userToMessage.full_name}</p>
                    <p className="text-xs text-muted-foreground">{userToMessage.role} • {userToMessage.usn || userToMessage.teacher_id}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="admin-message">Message Content</Label>
                  <Textarea
                    id="admin-message"
                    placeholder="Type your message here..."
                    value={adminMessage}
                    onChange={(e) => setAdminMessage(e.target.value)}
                    rows={4}
                  />
                </div>
              </div>
            )}

            <DialogFooter className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setMessageDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSendMessage} disabled={loading || !adminMessage.trim()}>
                Send Message
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Photo Status Dialog */}
        <Dialog open={bulkVerifyDialogOpen} onOpenChange={setBulkVerifyDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Bulk {bulkActionType === "verified" ? "Verification" : "Rejection"}</DialogTitle>
              <DialogDescription>
                Are you sure you want to {bulkActionType === "verified" ? "verify" : "reject"} {selectedIds.size} selected users?
              </DialogDescription>
            </DialogHeader>
            <div className="bg-primary/5 p-4 rounded-lg border border-primary/10 my-4">
              <p className="text-sm font-medium">
                {bulkActionType === "verified"
                  ? "Verification will generate face embeddings for each user if an image is present. This process may take a few moments."
                  : "Rejected users will be notified and asked to re-upload their photos."}
              </p>
            </div>
            <DialogFooter className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setBulkVerifyDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={() => handleBulkPhotoStatus(bulkActionType!)}
                className={bulkActionType === "verified" ? "bg-success hover:bg-success/90 text-success-foreground" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"}
              >
                {bulkActionType === "verified" ? "Verify All" : "Reject All"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Edit Dialog */}
        <Dialog open={bulkEditDialogOpen} onOpenChange={setBulkEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Bulk Update User Profiles</DialogTitle>
              <DialogDescription>Update attributes for {selectedIds.size} selected users.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="bulkApplyDept"
                  checked={bulkEditForm.applyDept}
                  onCheckedChange={(checked) => setBulkEditForm({ ...bulkEditForm, applyDept: !!checked })}
                />
                <div className="flex-1 space-y-2">
                  <Label htmlFor="bulkApplyDept">Update Department</Label>
                  <Select
                    disabled={!bulkEditForm.applyDept}
                    value={bulkEditForm.department}
                    onValueChange={(v) => setBulkEditForm({ ...bulkEditForm, department: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Checkbox
                  id="bulkApplySection"
                  checked={bulkEditForm.applySection}
                  onCheckedChange={(checked) => setBulkEditForm({ ...bulkEditForm, applySection: !!checked })}
                />
                <div className="flex-1 space-y-2">
                  <Label htmlFor="bulkApplySection">Update Section</Label>
                  <Select
                    disabled={!bulkEditForm.applySection}
                    value={bulkEditForm.section}
                    onValueChange={(v) => setBulkEditForm({ ...bulkEditForm, section: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SECTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Checkbox
                  id="bulkApplySem"
                  checked={bulkEditForm.applySem}
                  onCheckedChange={(checked) => setBulkEditForm({ ...bulkEditForm, applySem: !!checked })}
                />
                <div className="flex-1 space-y-2">
                  <Label htmlFor="bulkApplySem">Update Semester</Label>
                  <Select
                    disabled={!bulkEditForm.applySem}
                    value={bulkEditForm.semester}
                    onValueChange={(v) => setBulkEditForm({ ...bulkEditForm, semester: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SEMESTERS.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <Button onClick={handleBulkEdit} className="w-full" disabled={loading}>
                {loading ? "Updating..." : `Update ${selectedIds.size} Users`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Bulk Message Dialog */}
        <Dialog open={bulkMessageDialogOpen} onOpenChange={setBulkMessageDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-primary" />
                Broadcast Message
              </DialogTitle>
              <DialogDescription>
                Send this message to {selectedIds.size} selected users.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="bulk-message">Message Content</Label>
                <Textarea
                  id="bulk-message"
                  placeholder="Type your message here..."
                  value={bulkMessage}
                  onChange={(e) => setBulkMessage(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setBulkMessageDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleBulkMessage} disabled={loading || !bulkMessage.trim()}>
                {loading ? "Sending..." : `Send to ${selectedIds.size} Users`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Delete Dialog */}
        <Dialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="w-5 h-5" />
                Bulk User Deletion
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to permanently delete {selectedIds.size} user accounts?
              </DialogDescription>
            </DialogHeader>
            <div className="bg-destructive/5 p-4 rounded-lg border border-destructive/10 my-4 space-y-2">
              <p className="text-sm font-bold text-destructive">Warning: This action is irreversible.</p>
              <ul className="text-xs text-destructive/80 list-disc list-inside">
                <li>Profiles will be removed.</li>
                <li>Authentication accounts will be deleted.</li>
                <li>Face embeddings will be cleared from the server.</li>
              </ul>
            </div>
            <DialogFooter className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setBulkDeleteDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleBulkDelete} disabled={loading}>
                {loading ? "Deleting..." : `Delete ${selectedIds.size} Accounts`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default AdminUsersPage;
