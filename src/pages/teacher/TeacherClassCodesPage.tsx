import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Key, Copy, Clock, Ban, FolderCheck, Loader2, ScanFace, Trash2, RotateCcw, Fingerprint } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { formatTime, getLocalDate } from "@/lib/utils";
import { speak, playBeep } from "@/lib/audioUtils";
import { verifyFaceWithRetry, startKeepAlivePing } from "@/lib/apiUtils";
import Webcam from "react-webcam";


interface ClassItem { id: string; class_name: string; department: string; section: string; semester: number; }
interface SubjectItem { id: string; subject_name: string; }
interface TimetableEntry { id: string; class_id: string; subject_id: string; day_of_week: string; start_time: string; end_time: string; is_deleted?: boolean; }
interface ClassCode { id: string; code: string; expires_at: string; is_active: boolean; created_at: string; timetable_id: string; is_finalized: boolean; is_deleted?: boolean; }

const TeacherClassCodesPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [timetableEntries, setTimetableEntries] = useState<TimetableEntry[]>([]);
  const [codes, setCodes] = useState<ClassCode[]>([]);
  const [finalizedIds, setFinalizedIds] = useState<Set<string>>(new Set());
  const [finalizing, setFinalizing] = useState<string | null>(null);
  const [form, setForm] = useState({ class_id: "", subject_id: "", duration: "3" });
  const [showVerification, setShowVerification] = useState(false);
  const [showVerificationChoice, setShowVerificationChoice] = useState(false);
  const [biometricStatus, setBiometricStatus] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [codeToDelete, setCodeToDelete] = useState<string | null>(null);
  const webcamRef = useRef<Webcam>(null);

  const fetchCodes = useCallback(async () => {
    if (!user) return;
    const { data: codesData } = await supabase.from("class_codes")
      .select("*")
      .eq("teacher_id", user.id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false });
    setCodes((codesData || []) as ClassCode[]);
  }, [user]);

  useEffect(() => {
    const fetchTimetableAndRelated = async () => {
      if (!user) return;
      const { data: ttData } = await supabase.from("timetable")
        .select("*")
        .eq("teacher_id", user.id)
        .eq("is_deleted", false);
      const entries = (ttData || []) as TimetableEntry[];
      setTimetableEntries(entries);

      const classIds = [...new Set(entries.map((e) => e.class_id))];
      const subjectIds = [...new Set(entries.map((e) => e.subject_id))];

      if (classIds.length) {
        const { data } = await supabase.from("classes")
          .select("*")
          .in("id", classIds)
          .eq("is_deleted", false);
        setClasses((data || []) as ClassItem[]);
      }
      if (classIds.length === 0) setClasses([]);

      if (subjectIds.length) {
        const { data } = await supabase.from("subjects")
          .select("id, subject_name")
          .in("id", subjectIds)
          .eq("is_deleted", false);
        setSubjects((data || []) as SubjectItem[]);
      }
      if (subjectIds.length === 0) setSubjects([]);

      await fetchCodes();
    };

    const fetchBiometricStatus = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("user_biometrics")
        .select("status")
        .eq("user_id", user.id)
        .eq("active", true)
        .maybeSingle();
      setBiometricStatus(data?.status || null);
    };

    fetchTimetableAndRelated();
    fetchBiometricStatus();
  }, [user, fetchCodes]);

  const activeTimetableEntries = timetableEntries.filter(e => !e.is_deleted);

  const filteredSubjects = form.class_id
    ? Array.from(new Map(
      activeTimetableEntries
        .filter((e) => e.class_id === form.class_id)
        .map((e) => subjects.find((s) => s.id === e.subject_id))
        .filter((s): s is SubjectItem => !!s)
        .map((s) => [s.id, s])
    ).values())
    : [];

  const handleGenerateClick = () => {
    if (!form.class_id || !form.subject_id || !user) {
      toast({ title: "Select class and subject", variant: "destructive" });
      return;
    }

    const now = new Date();
    const day = now.toLocaleDateString('en-US', { weekday: 'long' });
    const time = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const candidates = activeTimetableEntries.filter((e) => e.class_id === form.class_id && e.subject_id === form.subject_id);
    const ttEntry = candidates.find(e => e.day_of_week === day && e.start_time <= time && e.end_time >= time);

    if (!ttEntry) {
      toast({
        title: "Access Denied",
        description: "Can't generate code for the current timings. Please check your timetable.",
        variant: "destructive"
      });
      return;
    }

    if (biometricStatus === 'verified') {
      setShowVerificationChoice(true);
    } else {
      setShowVerification(true);
    }
  };

  const handleVerifyBiometric = async () => {
    if (!user) return;
    setVerifying(true);

    try {
      // 1. Fetch the LATEST verified credential ID from database
      const { data: bioData, error: bioError } = await supabase
        .from("user_biometrics")
        .select("credential_id")
        .eq("user_id", user.id)
        .eq("status", "verified")
        .eq("active", true)
        .single();

      if (bioError || !bioData) {
        throw new Error("No verified biometric found. Please register or wait for admin approval.");
      }

      // 2. Prepare verification with specific allowed credential
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      // Convert base64 credential ID back to Uint8Array
      const rawId = Uint8Array.from(atob(bioData.credential_id), c => c.charCodeAt(0));

      const options: CredentialRequestOptions = {
        publicKey: {
          challenge,
          rpId: window.location.hostname,
          userVerification: "required",
          allowCredentials: [{
            id: rawId,
            type: "public-key"
          }],
          timeout: 60000,
        },
      };

      const assertion = await navigator.credentials.get(options);
      if (assertion) {
        await finalGenerateCode();
        setShowVerificationChoice(false);
      }
    } catch (error: any) {
      console.error(error);
      playBeep();
      toast({ 
        title: "Biometric Failed", 
        description: error.message || "Failed to verify fingerprint.", 
        variant: "destructive" 
      });
    } finally {
      setVerifying(false);
    }
  };

  const captureAndVerify = useCallback(async () => {
    if (!webcamRef.current || !user) return;

    setVerifying(true);
    const imageSrc = webcamRef.current.getScreenshot();

    if (!imageSrc) {
      toast({ title: "Camera Error", description: "Failed to capture image", variant: "destructive" });
      setVerifying(false);
      return;
    }

    try {
      const result = await verifyFaceWithRetry(
        user.id, 
        imageSrc, 
        (status) => toast({ title: "AI Status", description: status })
      );

      if (result.match) {
        toast({ title: "Verified", description: "Identity confirmed. Generating code..." });
        await finalGenerateCode();
        setShowVerification(false);
      } else {
        playBeep();
        toast({
          title: "Verification Failed",
          description: `Face does not match. (Confidence: ${(result.confidence * 100).toFixed(1)}%)`,
          variant: "destructive"
        });
      }
    } catch (err: any) {
      playBeep();
      toast({ title: "Verification Error", description: err.message, variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  }, [user, form, toast]);

  const finalGenerateCode = async () => {
    const now = new Date();
    const day = now.toLocaleDateString('en-US', { weekday: 'long' });
    const time = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const candidates = activeTimetableEntries.filter((e) => e.class_id === form.class_id && e.subject_id === form.subject_id);
    const ttEntry = candidates.find(e => e.day_of_week === day && e.start_time <= time && e.end_time >= time);

    if (!ttEntry) {
      toast({ title: "Session Expired", description: "The timetable slot is no longer active.", variant: "destructive" });
      return;
    }

    setVerifying(true);
    let locationData = null;

    try {
      toast({ title: "Capturing Location", description: "Fetching room coordinates..." });
      const { getHighAccuracyLocation } = await import("@/lib/locationUtils");
      locationData = await getHighAccuracyLocation();
      
      if (locationData.accuracy > 150) {
        toast({ title: "GPS Inaccurate", description: "Please ensure you have a clearer GPS signal (Accuracy > 150m).", variant: "destructive" });
        setVerifying(false);
        return;
      }
    } catch (locErr: any) {
      toast({ title: "Location Error", description: locErr.message, variant: "destructive" });
      setVerifying(false);
      return;
    }

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + parseInt(form.duration) * 60 * 1000).toISOString();

    const { data: newCode, error } = await supabase.from("class_codes").insert({
      teacher_id: user.id,
      timetable_id: ttEntry.id,
      code,
      expires_at: expiresAt,
      slot_start_time: ttEntry.start_time,
      slot_end_time: ttEntry.end_time
    }).select().single();

    if (error) { 
      toast({ title: "Error", description: error.message, variant: "destructive" }); 
      setVerifying(false);
      return; 
    }

    // Store location mapping
    if (locationData && newCode) {
      const { error: locError } = await supabase.from("class_code_locations").insert({
        class_code_id: newCode.id,
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        radius: 100, // Valid within 100m
        accuracy_threshold: 150 // Accept signals with up to 150m error
      });

      if (locError) {
        console.error("Failed to store location mapping:", locError);
        toast({ title: "Warning", description: "Code generated, but location geofencing could not be set.", variant: "default" });
      }
    }

    speak("Code generated");
    toast({ title: "Code generated!", description: `Code: ${code}` });
    await fetchCodes();
    setVerifying(false);
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Copied!", description: `Code ${code} copied to clipboard.` });
  };

  const deactivateCode = async (id: string) => {
    // Optimistic update
    setCodes(prev => prev.map(c => c.id === id ? { ...c, is_active: false, expires_at: new Date().toISOString() } : c));

    const { error } = await supabase.from("class_codes").update({ is_active: false, expires_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      await fetchCodes(); // Rollback on error
      return;
    }
    toast({ title: "Code deactivated" });
    await fetchCodes();
  };

  const executeFinalize = async (timetableId: string, createdAt: string, codeId: string) => {
    if (!user) return { success: false, error: "No user" };
    const date = getLocalDate(new Date(createdAt));

    try {
      const { data: codeData } = await supabase.from("class_codes").select("timetable_id, slot_start_time, slot_end_time").eq("id", codeId).single();
      if (!codeData) return { success: false, error: "Class code not found" };

      const { data: ttEntry } = await supabase.from("timetable").select("class_id, subject_id").eq("id", codeData.timetable_id).single();
      if (!ttEntry) return { success: false, error: "Timetable entry not found" };

      const { data: classData } = await supabase.from("classes").select("*").eq("id", ttEntry.class_id).single();
      if (!classData) return { success: false, error: "Class not found" };

      const { data: subjectData } = await supabase.from("subjects").select("subject_name").eq("id", ttEntry.subject_id).single();
      const { data: teacherData } = await supabase.from("profiles").select("full_name").eq("user_id", user.id).single();

      const { data: allProfiles } = await supabase.from("profiles")
        .select("user_id")
        .eq("department", classData.department)
        .eq("section", classData.section)
        .eq("semester", classData.semester)
        .eq("profile_completed", true);

      const { data: studentRoles } = await supabase.from("user_roles").select("user_id").eq("role", "student");
      const studentUserIds = new Set(studentRoles?.map(r => r.user_id));
      const eligibleStudents = (allProfiles || []).filter(p => studentUserIds.has(p.user_id));

      if (eligibleStudents.length === 0) return { success: true, count: 0 };

      const { data: existingRecords } = await supabase.from("attendance")
        .select("student_id, status")
        .eq("timetable_id", codeData.timetable_id)
        .eq("date", date)
        .eq("slot_start_time", codeData.slot_start_time)
        .eq("slot_end_time", codeData.slot_end_time);

      const handledStudentIds = new Set(existingRecords?.map(r => r.student_id));
      const absentees = eligibleStudents.filter(s => !handledStudentIds.has(s.user_id));
      const alreadyAbsentCount = existingRecords?.filter(r => r.status === 'absent').length || 0;

      if (absentees.length > 0) {
        const { error } = await supabase.from("attendance").insert(
          absentees.map(s => ({
            student_id: s.user_id,
            timetable_id: codeData.timetable_id,
            class_code_id: codeId,
            status: "absent",
            date: date,
            slot_start_time: codeData.slot_start_time,
            slot_end_time: codeData.slot_end_time,
            subject_name: subjectData?.subject_name || "Unknown",
            teacher_name: teacherData?.full_name || "Unknown",
            class_name: classData.class_name,
            department: classData.department,
            semester: classData.semester,
            teacher_id: user.id,
            created_at: new Date().toISOString()
          }))
        );
        if (error) return { success: false, error: error.message };
      }

      await supabase.from("class_codes").update({ is_finalized: true }).eq("id", codeId);
      return { success: true, count: absentees.length + alreadyAbsentCount };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const finalizeAttendance = async (timetableId: string, createdAt: string, codeId: string) => {
    const uniqueId = codeId;
    setFinalizing(uniqueId);
    const result = await executeFinalize(timetableId, createdAt, codeId);
    if (result.success) {
      toast({ title: "Attendance Finalized", description: `Marked ${result.count} students as absent.` });
      setFinalizedIds(prev => new Set(prev).add(uniqueId));
      await fetchCodes();
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    }
    setFinalizing(null);
  };

  const handleBulkFinalize = async () => {
    if (selectedIds.size === 0) return;
    const toFinalize = codes.filter(c => selectedIds.has(c.id) && !c.is_finalized && !finalizedIds.has(c.id));
    if (toFinalize.length === 0) {
      toast({ title: "No unfinalized codes selected" });
      return;
    }

    setVerifying(true); // Re-use loading state or add new one
    let successCount = 0;
    for (const code of toFinalize) {
      const result = await executeFinalize(code.timetable_id, code.created_at, code.id);
      if (result.success) {
        successCount++;
        setFinalizedIds(prev => new Set(prev).add(code.id));
      }
    }
    toast({ title: "Bulk Finalize Complete", description: `Successfully finalized ${successCount} classes.` });
    setSelectedIds(new Set());
    await fetchCodes();
    setVerifying(false);
  };

  const handleDelete = async (id?: string) => {
    const targetId = id || codeToDelete;
    if (!targetId) return;

    const { error } = await supabase.from("class_codes").update({ is_deleted: true }).eq("id", targetId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Code deleted" });
      setCodes(prev => prev.filter(c => c.id !== targetId));
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });
      setDeleteConfirmOpen(false);
      setCodeToDelete(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    const { error } = await supabase.from("class_codes").update({ is_deleted: true }).in("id", Array.from(selectedIds));
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Bulk Delete Complete", description: `Deleted ${selectedIds.size} codes.` });
      setCodes(prev => prev.filter(c => !selectedIds.has(c.id)));
      setSelectedIds(new Set());
      setBulkDeleteConfirmOpen(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === codes.length && codes.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(codes.map(c => c.id)));
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">Class Code Management</h2>
          <p className="text-muted-foreground mt-1">Generate codes for students to mark attendance</p>
        </div>

        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-lg font-display">Generate Class Code</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Class</Label>
                <Select value={form.class_id} onValueChange={(v) => setForm({ ...form, class_id: v, subject_id: "" })}>
                  <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.class_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Subject</Label>
                <Select value={form.subject_id} onValueChange={(v) => setForm({ ...form, subject_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                  <SelectContent>{filteredSubjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.subject_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Duration (minutes)</Label>
                <Input type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} min="1" max="120" />
              </div>
            </div>
            <Button onClick={handleGenerateClick}><Key className="w-4 h-4 mr-2" /> Generate Code</Button>

            <Dialog open={showVerificationChoice} onOpenChange={setShowVerificationChoice}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Verify Identity</DialogTitle>
              <DialogDescription>
                Choose a verification method to generate the class code.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-8">
              <Button 
                variant="outline" 
                className="flex flex-col h-auto p-8 gap-3 border-2 hover:border-primary hover:bg-primary/5 transition-all"
                onClick={() => {
                  setShowVerificationChoice(false);
                  setShowVerification(true);
                }}
              >
                <ScanFace className="w-12 h-12 text-primary" />
                <span className="font-bold">Face Recognition</span>
              </Button>
              <Button 
                variant="outline" 
                className="flex flex-col h-auto p-8 gap-3 border-2 hover:border-primary hover:bg-primary/5 transition-all"
                disabled={verifying}
                onClick={handleVerifyBiometric}
              >
                {verifying ? <Loader2 className="w-12 h-12 animate-spin text-primary" /> : <Fingerprint className="w-12 h-12 text-primary" />}
                <span className="font-bold">Fingerprint</span>
              </Button>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowVerificationChoice(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showVerification} onOpenChange={setShowVerification}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-center font-display">Verify your identity to generate code</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4 text-center">
                  <div className="relative w-full aspect-square max-w-[300px] mx-auto rounded-xl overflow-hidden bg-black border-2 border-border">
                    <Webcam
                      audio={false}
                      ref={webcamRef}
                      screenshotFormat="image/jpeg"
                      className="w-full h-full object-cover mirror"
                      videoConstraints={{
                        facingMode: "user",
                        width: 480,
                        height: 480
                      }}
                    />
                    {verifying && (
                      <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white z-10">
                        <Loader2 className="w-8 h-8 animate-spin mb-2" />
                        <p className="text-sm font-medium">Verifying Face...</p>
                      </div>
                    )}
                    <div className="absolute inset-0 border-[20px] border-black/10 pointer-events-none">
                      <div className="w-full h-full border-2 border-primary/40 dashed-rounded rounded-full opacity-40"></div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-medium flex items-center justify-center gap-2">
                      <ScanFace className="w-4 h-4 text-primary" /> Face Verification
                    </h4>
                    <p className="text-sm text-muted-foreground px-4">
                      Position your face in the center of the frame and click generate code
                    </p>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button variant="outline" onClick={() => setShowVerification(false)} className="flex-1" disabled={verifying}>
                      Back
                    </Button>
                    <Button onClick={captureAndVerify} className="flex-1" disabled={verifying}>
                      {verifying ? "Verifying..." : "Generate Code"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-lg font-display flex items-center gap-2"><Clock className="w-5 h-5" /> Code History</CardTitle></CardHeader>
          <CardContent>
            {codes.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No codes generated yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-center">
                      <Checkbox
                        checked={selectedIds.size === codes.length && codes.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {codes.map((c) => {
                    const isExpired = new Date(c.expires_at) < new Date();
                    const ttEntry = timetableEntries.find(t => t.id === c.timetable_id);
                    const classInfo = ttEntry ? classes.find(cl => cl.id === ttEntry.class_id) : null;
                    const subjectInfo = ttEntry ? subjects.find(s => s.id === ttEntry.subject_id) : null;

                    return (
                      <TableRow key={c.id} className={selectedIds.has(c.id) ? "bg-muted/50" : ""}>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={selectedIds.has(c.id)}
                            onCheckedChange={() => toggleSelect(c.id)}
                          />
                        </TableCell>
                        <TableCell className="font-mono font-bold text-lg tracking-wider">{c.code}</TableCell>
                        <TableCell>{classInfo?.class_name || "—"}</TableCell>
                        <TableCell>{subjectInfo?.subject_name || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={isExpired ? "border-muted-foreground text-muted-foreground" : "border-success text-success"}>
                            {isExpired ? "Expired" : "Active"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {new Date(c.expires_at).toLocaleDateString()} {new Date(c.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </TableCell>
                        <TableCell className="text-sm">
                          {new Date(c.created_at).toLocaleDateString()} {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button size="sm" variant="ghost" onClick={() => copyCode(c.code)} title="Copy Code"><Copy className="w-3 h-3" /></Button>
                            {!isExpired && c.is_active ? (
                              <Button size="sm" variant="destructive" onClick={() => deactivateCode(c.id)} title="Deactivate">
                                <Ban className="w-3 h-3" />
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => finalizeAttendance(c.timetable_id, c.created_at, c.id)}
                                title="Finalize Attendance (Mark Absent)"
                                className={c.is_finalized || finalizedIds.has(c.id) ? "bg-success hover:bg-success/90" : ""}
                                disabled={c.is_finalized || finalizedIds.has(c.id) || finalizing === c.id}
                              >
                                {finalizing === c.id ? (
                                  <Clock className="w-3 h-3 animate-spin" />
                                ) : (
                                  <FolderCheck className="w-3 h-3" />
                                )}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                setCodeToDelete(c.id);
                                setDeleteConfirmOpen(true);
                              }}
                              title="Delete Code"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {selectedIds.size > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <Card className="shadow-2xl border-primary/20 bg-background/95 backdrop-blur-md">
              <CardContent className="py-3 px-6 flex items-center gap-6">
                <div className="flex items-center gap-2 border-r pr-6 border-border">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {selectedIds.size}
                  </span>
                  <span className="text-sm font-medium text-muted-foreground transition-colors">
                    Selected
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 hover:bg-success/10 hover:text-success hover:border-success/30 transition-all gap-2"
                    onClick={handleBulkFinalize}
                    disabled={verifying}
                  >
                    {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderCheck className="w-4 h-4" />}
                    Bulk Finalize
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all gap-2"
                    onClick={() => setBulkDeleteConfirmOpen(true)}
                  >
                    <Trash2 className="w-4 h-4" />
                    Bulk Delete
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 transition-all gap-2"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    <RotateCcw className="w-4 h-4" />
                    Clear
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Class Code?</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this class code? This action will remove it from the history,
                but <strong>attendance data already marked using this code will be preserved</strong>.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={() => handleDelete()}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={bulkDeleteConfirmOpen} onOpenChange={setBulkDeleteConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Bulk Delete Class Codes?</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete <strong>{selectedIds.size}</strong> selected class codes?
                This will remove them from your history, but <strong>all associated attendance records will remain intact</strong>.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBulkDeleteConfirmOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleBulkDelete}>Delete All Selected</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default TeacherClassCodesPage;
