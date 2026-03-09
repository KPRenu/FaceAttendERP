import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Send, Clock, CheckCircle, AlertCircle, RotateCcw, Check, X, Settings2, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

interface Issue {
  id: string;
  subject: string;
  description: string;
  status: string;
  admin_response: string | null;
  created_at: string;
  user_id: string;
  is_admin_initiated: boolean;
  is_read: boolean;
  user_response: string | null;
  user_details?: {
    full_name: string | null;
    role: string;
    department: string | null;
    id_number: string | null;
  };
}

const IssuesPage = () => {
  const { user, role, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [activeTab, setActiveTab] = useState<"issues" | "messages">("issues");
  const [response, setResponse] = useState("");
  const [userReply, setUserReply] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Selection & Bulk Resolve State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [bulkResolveDialogOpen, setBulkResolveDialogOpen] = useState(false);
  const [resolutionMessage, setResolutionMessage] = useState("");
  const [issueToResolve, setIssueToResolve] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [issueToDelete, setIssueToDelete] = useState<string | null>(null);

  const fetchIssues = async () => {
    setLoading(true);
    const { data: rawIssues } = role === "admin"
      ? await supabase.from("issues").select("*").order("created_at", { ascending: false })
      : await supabase.from("issues").select("*").eq("user_id", user?.id).order("created_at", { ascending: false });

    if (role === "admin" && rawIssues && rawIssues.length > 0) {
      const uids = rawIssues.map(i => i.user_id);

      // Fetch profiles
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, department, usn, teacher_id").in("user_id", uids);
      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      // Fetch roles
      const { data: userRoles } = await supabase.from("user_roles").select("user_id, role").in("user_id", uids);
      const roleMap = new Map(userRoles?.map(r => [r.user_id, r.role]) || []);

      const enrichedIssues = rawIssues.map(issue => ({
        ...issue,
        user_details: {
          full_name: profileMap.get(issue.user_id)?.full_name || "Unknown User",
          role: roleMap.get(issue.user_id) || "student",
          department: profileMap.get(issue.user_id)?.department || null,
          id_number: profileMap.get(issue.user_id)?.usn || profileMap.get(issue.user_id)?.teacher_id || null
        }
      }));
      setIssues(enrichedIssues as Issue[]);
    } else {
      setIssues((rawIssues || []) as Issue[]);
    }

    // Mark messages as read when on the messages tab
    if (role !== "admin" && activeTab === "messages" && rawIssues) {
      const unreadIds = rawIssues.filter(i => i.is_admin_initiated && !i.is_read).map(i => i.id);
      if (unreadIds.length > 0) {
        await supabase.from("issues").update({ is_read: true }).in("id", unreadIds);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    if (!authLoading && role) {
      fetchIssues();
    }
  }, [authLoading, role, activeTab]);

  const handleSubmit = async () => {
    if (!subject || !description) { toast({ title: "Fill all fields", variant: "destructive" }); return; }
    const { error } = await supabase.from("issues").insert({ user_id: user?.id, subject, description });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Issue submitted" });
    setSubject(""); setDescription("");
    fetchIssues();
  };

  const handleResolve = async (issueId?: string) => {
    const targetId = issueId || issueToResolve;
    if (!targetId) return;

    setLoading(true);
    const { error } = await supabase
      .from("issues")
      .update({
        admin_response: response || null,
        status: "resolved"
      })
      .eq("id", targetId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Issue Resolved" });
      setResolveDialogOpen(false);
      setIssueToResolve(null);
      setResponse("");
      fetchIssues();
    }
    setLoading(false);
  };

  const handleBulkResolve = async () => {
    if (selectedIds.size === 0) return;
    setLoading(true);

    const unresolvedSelected = issues
      .filter(i => selectedIds.has(i.id) && i.status !== "resolved")
      .map(i => i.id);

    if (unresolvedSelected.length === 0) {
      toast({ title: "No unresolved issues selected" });
      setLoading(false);
      return;
    }

    const { error } = await supabase
      .from("issues")
      .update({
        admin_response: resolutionMessage || null,
        status: "resolved"
      })
      .in("id", unresolvedSelected);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Bulk Resolution Complete", description: `Resolved ${selectedIds.size} issues.` });
      setBulkResolveDialogOpen(false);
      setResolutionMessage("");
      setSelectedIds(new Set());
      fetchIssues();
    }
    setLoading(false);
  };

  const handleDelete = async (issueId?: string) => {
    const targetId = issueId || issueToDelete;
    if (!targetId) return;

    setLoading(true);
    const { error, count } = await supabase
      .from("issues")
      .delete({ count: 'exact' })
      .eq("id", targetId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else if (count === 0) {
      toast({
        title: "Deletion Failed",
        description: "The record could not be deleted. This is likely due to database permissions (RLS). Please contact an administrator.",
        variant: "destructive"
      });
    } else {
      toast({ title: "Issue Deleted" });
      setDeleteDialogOpen(false);
      setIssueToDelete(null);
      fetchIssues();
    }
    setLoading(false);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setLoading(true);

    const { error, count } = await supabase
      .from("issues")
      .delete({ count: 'exact' })
      .in("id", Array.from(selectedIds));

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else if (count === 0) {
      toast({
        title: "Bulk Deletion Failed",
        description: "None of the selected records could be deleted. This is likely due to database permissions (RLS).",
        variant: "destructive"
      });
    } else {
      toast({ title: "Bulk Deletion Complete", description: `Successfully deleted ${count} issues.` });
      setBulkDeleteDialogOpen(false);
      setSelectedIds(new Set());
      fetchIssues();
    }
    setLoading(false);
  };

  const toggleSelectAll = () => {
    const filteredIds = issues
      .filter(i => {
        if (role !== "admin") return false;
        const matchesSearch = !searchQuery || i.user_details?.full_name?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesRole = roleFilter === "all" || i.user_details?.role === roleFilter;
        const matchesDept = deptFilter === "all" || i.user_details?.department === deptFilter;
        const matchesStatus = statusFilter === "all" || (statusFilter === "resolved" ? i.status === "resolved" : i.status !== "resolved");

        return matchesSearch && matchesRole && matchesDept && matchesStatus;
      })
      .map(i => i.id);

    if (selectedIds.size === filteredIds.length && filteredIds.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredIds));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleUserReply = async (issueId: string) => {
    if (!userReply.trim()) return;
    const { error } = await supabase.from("issues").update({ user_response: userReply }).eq("id", issueId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Reply sent" });
    setReplyingTo(null); setUserReply("");
    fetchIssues();
  };

  const statusIcon = (s: string) => {
    if (s === "resolved" || s === "closed") return <CheckCircle className="w-3 h-3" />;
    if (s === "in_progress") return <Clock className="w-3 h-3" />;
    return <AlertCircle className="w-3 h-3" />;
  };

  const statusColor = (s: string) => {
    if (s === "resolved" || s === "closed") return "border-success text-success";
    if (s === "in_progress") return "border-warning text-warning";
    return "border-info text-info";
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">
            {role === "admin" ? "Issue Management" : "Report an Issue"}
          </h2>
          <p className="text-muted-foreground mt-1">
            {role === "admin" ? "View and respond to user issues" : "Raise issues and track their status"}
          </p>
        </div>

        {role !== "admin" && (
          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-lg font-display">New Issue</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2"><Label>Subject</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Brief subject" /></div>
              <div className="space-y-2"><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe your issue in detail..." rows={3} /></div>
              <Button onClick={handleSubmit}><Send className="w-4 h-4 mr-2" /> Submit Issue</Button>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg font-display flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                {role === "admin" ? "All Issues" : (
                  <div className="flex gap-4">
                    <button
                      onClick={() => setActiveTab("issues")}
                      className={`pb-1 border-b-2 transition-all ${activeTab === "issues" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
                    >
                      Your Issues ({issues.filter(i => !i.is_admin_initiated).length})
                    </button>
                    <button
                      onClick={() => setActiveTab("messages")}
                      className={`pb-1 border-b-2 transition-all relative ${activeTab === "messages" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
                    >
                      Messages from Admin ({issues.filter(i => i.is_admin_initiated).length})
                      {issues.some(i => i.is_admin_initiated && !i.is_read) && (
                        <span className="absolute -top-1 -right-2 w-2 h-2 bg-destructive rounded-full" />
                      )}
                    </button>
                  </div>
                )}
              </div>
              {role === "admin" && <Badge variant="secondary">{issues.length}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              {role === "admin" ? (
                <>
                  <div className="flex-1">
                    <Input
                      placeholder="Search by name..."
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
                    </SelectContent>
                  </Select>
                  <Select value={deptFilter} onValueChange={setDeptFilter}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Depts</SelectItem>
                      {Array.from(new Set(issues.map(i => i.user_details?.department).filter(Boolean))).map(dept => (
                        <SelectItem key={dept} value={dept as string}>{dept}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              ) : (
                <div className="flex-1" />
              )}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="unresolved">Unresolved</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
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
                    className="h-8 text-xs bg-success hover:bg-success/90 text-success-foreground"
                    onClick={() => setBulkResolveDialogOpen(true)}
                  >
                    <CheckCircle className="w-3 h-3 mr-1" /> Bulk Resolve
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

            {role === "admin" && issues.length > 0 && (
              <div className="flex items-center gap-2 mb-4 px-1">
                <Checkbox
                  id="select-all"
                  checked={selectedIds.size > 0 && selectedIds.size === issues.filter(i => {
                    const matchesSearch = !searchQuery || i.user_details?.full_name?.toLowerCase().includes(searchQuery.toLowerCase());
                    const matchesRole = roleFilter === "all" || i.user_details?.role === roleFilter;
                    const matchesDept = deptFilter === "all" || i.user_details?.department === deptFilter;
                    const matchesStatus = statusFilter === "all" || (statusFilter === "resolved" ? i.status === "resolved" : i.status !== "resolved");
                    return matchesSearch && matchesRole && matchesDept && matchesStatus;
                  }).length}
                  onCheckedChange={toggleSelectAll}
                />
                <Label htmlFor="select-all" className="text-sm text-muted-foreground cursor-pointer">
                  Select all visible issues
                </Label>
              </div>
            )}
            {loading ? <p className="text-center text-muted-foreground py-8">Loading...</p> :
              (role !== "admin" && activeTab === "issues" && issues.filter(i => !i.is_admin_initiated).length === 0) ||
                (role !== "admin" && activeTab === "messages" && issues.filter(i => i.is_admin_initiated).length === 0) ||
                (role === "admin" && issues.length === 0) ? (
                <p className="text-center text-muted-foreground py-8">No items found.</p>
              ) : (
                <div className="space-y-4">
                  {issues
                    .filter(issue => {
                      if (role !== "admin") {
                        const matchesTab = activeTab === "issues" ? !issue.is_admin_initiated : issue.is_admin_initiated;
                        const matchesStatus = statusFilter === "all" || (statusFilter === "resolved" ? issue.status === "resolved" : issue.status !== "resolved");
                        return matchesTab && matchesStatus;
                      }

                      const matchesSearch = !searchQuery ||
                        (issue.user_details?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()));
                      const matchesRole = roleFilter === "all" || issue.user_details?.role === roleFilter;
                      const matchesDept = deptFilter === "all" || issue.user_details?.department === deptFilter;
                      const matchesStatus = statusFilter === "all" || (statusFilter === "resolved" ? issue.status === "resolved" : issue.status !== "resolved");

                      return matchesSearch && matchesRole && matchesDept && matchesStatus;
                    })
                    .map((issue) => (
                      <div key={issue.id} className={`border border-border rounded-lg p-4 space-y-2 relative transition-colors ${selectedIds.has(issue.id) ? "bg-primary/5 border-primary/20" : ""} ${!issue.is_read && issue.is_admin_initiated && role !== "admin" ? "bg-primary/5 border-primary/20" : ""}`}>
                        {role === "admin" && (
                          <div className="absolute top-4 right-4 z-10">
                            <Checkbox
                              checked={selectedIds.has(issue.id)}
                              onCheckedChange={() => toggleSelect(issue.id)}
                            />
                          </div>
                        )}
                        <div className="flex items-center justify-between pr-8">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-foreground">{issue.subject}</h3>
                            {issue.is_admin_initiated && (
                              <Badge variant="outline" className="text-[10px] py-0 h-4 bg-primary/10 text-primary border-primary/20">ADMIN INITIATED</Badge>
                            )}
                          </div>
                          <Badge variant="outline" className={statusColor(issue.status)}>
                            {statusIcon(issue.status)} <span className="ml-1">{issue.status}</span>
                          </Badge>
                        </div>
                        {role === "admin" && issue.user_details && (
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs mb-2 items-center bg-primary/5 p-2 rounded border border-primary/10">
                            <span className="font-bold text-foreground">{issue.user_details.full_name}</span>
                            <Badge variant="secondary" className="scale-90 h-5 px-1.5">{issue.user_details.role}</Badge>
                            {issue.user_details.department && (
                              <span className="text-muted-foreground">• {issue.user_details.department}</span>
                            )}
                            {issue.user_details.id_number && (
                              <span className="text-muted-foreground font-mono">({issue.user_details.id_number})</span>
                            )}
                          </div>
                        )}
                        <p className="text-sm text-muted-foreground">{issue.description}</p>
                        {issue.is_admin_initiated && issue.user_response && (
                          <div className="bg-primary/5 rounded-lg p-3 mt-2 border border-primary/10">
                            <p className="text-xs font-medium text-primary mb-1">User Response:</p>
                            <p className="text-sm text-foreground">{issue.user_response}</p>
                          </div>
                        )}
                        {issue.admin_response && (
                          <div className="bg-muted rounded-lg p-3 mt-2">
                            <p className="text-xs font-medium text-muted-foreground mb-1">Admin Response:</p>
                            <p className="text-sm text-foreground">{issue.admin_response}</p>
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          <p className="text-xs text-muted-foreground">{new Date(issue.created_at).toLocaleDateString()}</p>
                          {role !== "admin" && issue.is_admin_initiated && !issue.user_response && (
                            <Button size="sm" variant="outline" onClick={() => setReplyingTo(issue.id)}>Reply</Button>
                          )}
                        </div>

                        {replyingTo === issue.id && (
                          <div className="space-y-2 mt-2">
                            <Textarea value={userReply} onChange={(e) => setUserReply(e.target.value)} placeholder="Type your reply..." rows={2} />
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => handleUserReply(issue.id)}>Send Reply</Button>
                              <Button size="sm" variant="outline" onClick={() => setReplyingTo(null)}>Cancel</Button>
                            </div>
                          </div>
                        )}
                        {role === "admin" && (
                          <div className="flex gap-2">
                            {issue.status !== "resolved" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-primary text-primary hover:bg-primary/5"
                                onClick={() => {
                                  setIssueToResolve(issue.id);
                                  setResolveDialogOpen(true);
                                }}
                              >
                                Resolve
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-destructive text-destructive hover:bg-destructive/5"
                              onClick={() => {
                                setIssueToDelete(issue.id);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
          </CardContent>
        </Card>

        {/* Single Resolve Dialog */}
        <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Resolve Issue</DialogTitle>
              <DialogDescription>
                Provide an optional resolution message for the user.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="resolve-message">Resolution Message (Optional)</Label>
                <Textarea
                  id="resolve-message"
                  placeholder="Summarize how the issue was addressed..."
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setResolveDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => handleResolve()} disabled={loading}>
                {loading ? "Resolving..." : "Mark as Resolved"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Resolve Dialog */}
        <Dialog open={bulkResolveDialogOpen} onOpenChange={setBulkResolveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Bulk resolve {selectedIds.size} Issues</DialogTitle>
              <DialogDescription>
                This will mark all selected issues as resolved.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="bulk-resolve-message">Common Resolution Message (Optional)</Label>
                <Textarea
                  id="bulk-resolve-message"
                  placeholder="Message to be sent with all selected resolutions..."
                  value={resolutionMessage}
                  onChange={(e) => setResolutionMessage(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setBulkResolveDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleBulkResolve} className="bg-success hover:bg-success/90 text-success-foreground" disabled={loading}>
                {loading ? "Resolving..." : `Resolve ${selectedIds.size} Issues`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Issue</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this issue? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={() => handleDelete()} disabled={loading}>
                {loading ? "Deleting..." : "Delete Issue"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Delete Confirmation Dialog */}
        <Dialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Bulk Delete {selectedIds.size} Issues</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete {selectedIds.size} selected issues? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setBulkDeleteDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleBulkDelete} disabled={loading}>
                {loading ? "Deleting..." : `Delete ${selectedIds.size} Issues`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default IssuesPage;
