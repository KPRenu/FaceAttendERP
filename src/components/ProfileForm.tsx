import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, User, Lock, AlertTriangle, Users, Shield } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

const DEPARTMENTS = ["CSE", "ECE", "ME", "EEE", "CE", "ISE", "AI&ML"];
const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];
const SECTIONS = ["A", "B", "C"];

interface ProfileFormProps {
  initialData?: any;
  role: string;
  userId: string;
  onSuccess?: () => void;
  isAdminView?: boolean;
}

const ProfileForm = ({ initialData, role, userId, onSuccess, isAdminView = false }: ProfileFormProps) => {
  const { user: authUser } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(initialData?.avatar_url || null);

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    department: "",
    college: "",
    address: "",
    usn: "",
    semester: "",
    section: "",
    teacher_id: "",
    email: "",
    role: "" as "student" | "teacher" | "admin" | "",
  });

  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showReverifyDialog, setShowReverifyDialog] = useState(false);
  const [showAdminReverifyDialog, setShowAdminReverifyDialog] = useState(false);
  const [showRoleTransitionDialog, setShowRoleTransitionDialog] = useState(false);
  const [transitionData, setTransitionData] = useState({
    department: "",
    semester: "",
    section: "",
  });

  useEffect(() => {
    if (initialData) {
      setForm({
        full_name: initialData.full_name || "",
        phone: initialData.phone || "",
        department: initialData.department || "",
        college: initialData.college || "",
        address: initialData.address || "",
        usn: initialData.usn || "",
        semester: initialData.semester ? String(initialData.semester) : "",
        section: initialData.section || "",
        teacher_id: initialData.teacher_id || "",
        email: initialData.email || (!isAdminView && userId === authUser?.id ? authUser?.email : "") || "",
        role: initialData.role || role || "",
      });
      setAvatarPreview(initialData.avatar_url);
    }

    // Check for pending email change in Supabase Auth
    if (authUser?.new_email) {
      setPendingEmail(authUser.new_email);
    } else {
      setPendingEmail(null);
    }
  }, [initialData, authUser]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Basic validation
    if (!avatarFile && !initialData?.avatar_url) {
      toast({ title: "Photo required", description: "Please upload a profile photo.", variant: "destructive" });
      return;
    }
    if (!form.full_name || !form.phone || (role !== "admin" && !form.department)) {
      toast({ title: "Missing fields", description: "Please fill all required fields.", variant: "destructive" });
      return;
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        toast({ title: "Password too short", description: "Password must be at least 6 characters.", variant: "destructive" });
        return;
      }
      if (newPassword !== confirmPassword) {
        toast({ title: "Passwords mismatch", description: "New password and confirmation do not match.", variant: "destructive" });
        return;
      }
    }

    // Check for critical changes (Student only, non-admin view)
    const emailChanged = !isAdminView && form.email !== (authUser?.email || "");
    const hasCriticalChanges = (role === "student" && !isAdminView && (
      form.department !== (initialData?.department || "") ||
      form.semester !== (initialData?.semester ? String(initialData.semester) : "") ||
      form.section !== (initialData?.section || "")
    )) || emailChanged;

    if (isAdminView && form.role && form.role !== role) {
      // Initialize transition dialog data with current values or defaults
      setTransitionData({
        department: form.department || initialData?.department || "",
        semester: form.semester || (initialData?.semester ? String(initialData.semester) : ""),
        section: form.section || initialData?.section || "",
      });
      setShowRoleTransitionDialog(true);
      return;
    }

    if (hasCriticalChanges) {
      if (!isAdminView && role === "admin") {
        setShowAdminReverifyDialog(true);
      } else {
        setShowReverifyDialog(true);
      }
    } else {
      saveProfile(false, emailChanged);
    }
  };

  const saveProfile = async (forceReverify: boolean, emailWasChanged: boolean = false) => {
    setLoading(true);
    setShowReverifyDialog(false);

    // Handle Email Update with robust validation
    const cleanEmail = form.email.trim().toLowerCase().replace(/\s/g, '');
    const currentEmail = (authUser?.email || "").trim().toLowerCase();

    // Basic regex validation
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    if (!isAdminView && cleanEmail !== currentEmail) {
      if (!emailRegex.test(cleanEmail)) {
        toast({ title: "Invalid Email", description: "Please enter a valid email address.", variant: "destructive" });
        setLoading(false);
        return;
      }

      const { error: emailError } = await supabase.auth.updateUser({ email: cleanEmail });
      if (emailError) {
        toast({
          title: "Email Update Failed",
          description: `Database rejected "${cleanEmail}". Error: ${emailError.message}`,
          variant: "destructive"
        });
        setLoading(false);
        return;
      }
      toast({ title: "Confirmation Sent", description: "Verification link sent to your new email. Please confirm it to complete the change." });
    }

    // Handle Password Update
    if (newPassword) {
      const { error: pwdError } = await supabase.auth.updateUser({ password: newPassword });
      if (pwdError) {
        toast({ title: "Password Update Failed", description: pwdError.message, variant: "destructive" });
        setLoading(false);
        return;
      }
      toast({ title: "Password Updated", description: "Your password has been changed." });
    }

    let avatarUrl = initialData?.avatar_url;

    if (avatarFile) {
      const ext = avatarFile.name.split(".").pop();
      const path = `${userId}/avatar_${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("avatars").upload(path, avatarFile, { upsert: true });

      if (uploadErr) {
        toast({ title: "Upload failed", description: uploadErr.message, variant: "destructive" });
        setLoading(false);
        return;
      }

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      avatarUrl = urlData.publicUrl;
    }

    const profileData: any = {
      full_name: form.full_name,
      phone: form.phone,
      college: form.college,
      address: form.address,
      avatar_url: avatarUrl,
      // We only update the profile email if it hasn't changed, 
      // or if we want the local DB to reflect the *target* email (which can be confusing if login fails).
      // Keeping it as form.email for now as requested, but adding a note in the toast.
      email: form.email.trim().toLowerCase().replace(/\s/g, ''),
      profile_completed: true,
    };

    // Role specific logic - Use the NEW role (form.role)
    const targetRole = form.role || role;

    if (targetRole === "student") {
      profileData.department = form.department;
      profileData.usn = form.usn;
      profileData.semester = form.semester ? parseInt(form.semester) : null;
      profileData.section = form.section;
      profileData.teacher_id = null;
    } else if (targetRole === "teacher") {
      profileData.department = form.department;
      profileData.teacher_id = form.teacher_id;
      profileData.usn = null;
      profileData.semester = null;
      profileData.section = null;
    } else if (targetRole === "admin") {
      // Admin department is optional
      profileData.department = (form.department && form.department !== "—") ? form.department : null;
      profileData.usn = null;
      profileData.semester = null;
      profileData.section = null;
      profileData.teacher_id = null;
    }

    // photo_status logic
    const emailChangedForReverify = !isAdminView && form.email !== (authUser?.email || "");
    if (isAdminView) {
      profileData.photo_status = "verified";
    } else if (forceReverify || emailChangedForReverify) {
      profileData.photo_status = "pending";
    } else if (avatarFile) {
      // Admin editing themselves
      if (role === 'admin') {
        const { count, error: countErr } = await supabase
          .from("user_roles")
          .select("*", { count: 'exact', head: true })
          .eq("role", "admin")
          .neq("user_id", userId);

        if (!countErr && count !== null && count > 0) {
          // Other admins exist, need verification
          profileData.photo_status = "pending";
          toast({
            title: "Verification Required",
            description: "Since other admins exist, your photo change must be verified by one of them.",
            variant: "default"
          });
        } else {
          // No other admins, auto-verify
          profileData.photo_status = "verified";
        }
      } else {
        // Teacher/Student editing themselves
        profileData.photo_status = "pending";
      }
    }

    // Handle Role Update (Admin only)
    if (isAdminView && form.role && form.role !== role) {
      const { error: roleErr } = await supabase
        .from("user_roles")
        .upsert(
          { user_id: userId, role: form.role as any },
          { onConflict: 'user_id' }
        );

      if (roleErr) {
        toast({ title: "Role Update Failed", description: roleErr.message, variant: "destructive" });
        setLoading(false);
        return;
      }
    }

    const { error } = await supabase
      .from("profiles")
      .upsert({ ...profileData, user_id: userId }, { onConflict: "user_id" });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      if (isAdminView && avatarFile) {
        try {
          toast({ title: "Syncing", description: "Generating face patterns for this student..." });
          const response = await fetch(avatarUrl);
          const blob = await response.blob();
          const reader = new FileReader();
          const base64Promise = new Promise((resolve) => {
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
          const base64Image = await base64Promise;

          const aiServerUrl = import.meta.env.VITE_AI_SERVER_URL || 'http://localhost:8000';
          const verifyRes = await fetch(`${aiServerUrl}/generate-embedding`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId, image: base64Image })
          });

          if (!verifyRes.ok) {
            toast({ title: "Warning", description: "Profile saved, but face pattern generation failed.", variant: "destructive" });
          } else {
            toast({ title: "Verified", description: "Profile updated and face patterns generated." });
          }
        } catch (vErr) {
          console.error("Auto-verification error:", vErr);
        }
      } else {
        let msg = forceReverify
          ? "Profile updated. Your account needs admin re-verification due to major changes."
          : "Profile updated successfully.";

        if (emailWasChanged) {
          msg += " IMPORTANT: You must click the link in your NEW email before you can login with it.";
        }

        toast({ title: "Success", description: msg });
      }

      if (onSuccess) onSuccess();
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex flex-col items-center gap-3">
        <Avatar className="w-24 h-24 border-2 border-border">
          <AvatarImage src={avatarPreview || ""} />
          <AvatarFallback className="bg-muted"><User className="w-10 h-10 text-muted-foreground" /></AvatarFallback>
        </Avatar>
        <label className="cursor-pointer">
          <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
            <Camera className="w-4 h-4" />
            {initialData?.avatar_url ? "Change Photo" : "Upload Photo *"}
          </div>
        </label>
        {role === "admin" && <p className="text-xs text-muted-foreground">Admin photos are auto-verified.</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="full_name">Full Name *</Label>
          <Input id="full_name" name="full_name" autoComplete="name" placeholder="Enter full name" value={form.full_name} onChange={(e) => updateField("full_name", e.target.value)} required disabled={isAdminView} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone *</Label>
          <Input id="phone" name="phone" autoComplete="tel" placeholder="Phone number" value={form.phone} onChange={(e) => updateField("phone", e.target.value)} required disabled={isAdminView} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email Address</Label>
          <Input id="email" name="email" type="email" autoComplete="email" placeholder="Enter email address" value={form.email} onChange={(e) => updateField("email", e.target.value)} disabled={isAdminView} />
          {pendingEmail && !isAdminView && (
            <p className="text-xs font-medium text-amber-600 bg-amber-50 p-2 rounded border border-amber-100 mt-1">
              Change pending confirmation for: <strong>{pendingEmail}</strong>.
              Check your inbox to complete the switch.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="role">User Role</Label>
          {isAdminView ? (
            <Select value={form.role} onValueChange={(v) => updateField("role", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="student">Student</SelectItem>
                <SelectItem value="teacher">Teacher</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Input id="role" value={form.role || role} disabled />
          )}
          <p className="text-[10px] text-muted-foreground mt-1">
            {isAdminView ? "Changing this will update the user's dashboard access immediately." : "Contact admin to change your role."}
          </p>
        </div>
      </div>

      {/* Student Fields */}
      {role === "student" && (
        <>
          <div className="space-y-2">
            <Label htmlFor="usn">USN *</Label>
            <Input id="usn" name="usn" autoComplete="off" placeholder="University Seat Number" value={form.usn} onChange={(e) => updateField("usn", e.target.value)} required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Department *</Label>
              <Select value={form.department} onValueChange={(v) => updateField("department", v)}>
                <SelectTrigger><SelectValue placeholder="Dept" /></SelectTrigger>
                <SelectContent>{DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Semester *</Label>
              <Select value={form.semester} onValueChange={(v) => updateField("semester", v)}>
                <SelectTrigger><SelectValue placeholder="Sem" /></SelectTrigger>
                <SelectContent>{SEMESTERS.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Section *</Label>
              <Select value={form.section} onValueChange={(v) => updateField("section", v)}>
                <SelectTrigger><SelectValue placeholder="Sec" /></SelectTrigger>
                <SelectContent>{SECTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </>
      )}

      {/* Teacher Fields */}
      {role === "teacher" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="teacher_id">Teacher ID *</Label>
            <Input id="teacher_id" name="teacher_id" autoComplete="off" placeholder="TID" value={form.teacher_id} onChange={(e) => updateField("teacher_id", e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Department *</Label>
            <Select value={form.department} onValueChange={(v) => updateField("department", v)}>
              <SelectTrigger><SelectValue placeholder="Department" /></SelectTrigger>
              <SelectContent>{DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Admin Fields */}
      {role === "admin" && (
        <div className="space-y-2">
          <Label>Department (Optional)</Label>
          <Select value={form.department || "—"} onValueChange={(v) => updateField("department", v === "—" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Select Department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="—">—</SelectItem>
              {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="college">College</Label>
        <Input id="college" name="college" autoComplete="organization" placeholder="College name" value={form.college} onChange={(e) => updateField("college", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="address">Address</Label>
        <Textarea id="address" name="address" autoComplete="street-address" placeholder="Full address" value={form.address} onChange={(e) => updateField("address", e.target.value)} rows={2} />
      </div>

      {/* Password Reset Section */}
      {!isAdminView && (
        <div className="pt-4 border-t border-border">
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2"><Lock className="w-4 h-4" /> Security</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="new_password">New Password</Label>
              <Input id="new_password" name="new_password" autoComplete="new-password" type="password" placeholder="Leave blank to keep current" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm_password">Confirm New Password</Label>
              <Input id="confirm_password" name="confirm_password" autoComplete="new-password" type="password" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Saving..." : "Save Profile"}
      </Button>

      <Dialog open={showReverifyDialog} onOpenChange={setShowReverifyDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="w-5 h-5" />
              Re-verification Required
            </DialogTitle>
            <div className="pt-2 text-sm text-muted-foreground">
              You are changing critical information:
              <div className="bg-muted p-3 rounded-lg my-3 space-y-1 text-sm text-foreground">
                {form.email.trim().toLowerCase() !== (authUser?.email || "").toLowerCase() && <div>• Email: <span className="font-bold">{form.email.trim().toLowerCase()}</span></div>}
                {role === "student" && form.department !== initialData?.department && <div>• Department: <span className="font-bold">{form.department}</span></div>}
                {role === "student" && form.semester !== String(initialData?.semester || "") && <div>• Semester: <span className="font-bold">{form.semester}</span></div>}
                {role === "student" && form.section !== initialData?.section && <div>• Section: <span className="font-bold">{form.section}</span></div>}
              </div>
              Changing these fields will require your profile to be **verified again by the admin**. You won't be able to mark attendance until re-verified.
              {form.email.trim().toLowerCase() !== (authUser?.email || "").toLowerCase() && (
                <div className="mt-2 text-primary font-medium">Important: Check your new email for the confirmation link!</div>
              )}
            </div>
          </DialogHeader>
          <DialogFooter className="flex gap-2 justify-end mt-4">
            <Button variant="outline" onClick={() => setShowReverifyDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => {
              const emailChanged = !isAdminView && form.email.trim().toLowerCase().replace(/\s/g, '') !== (authUser?.email || "").toLowerCase();
              saveProfile(true, emailChanged);
            }}>Save and Re-verify</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role Transition Dialog (Admin Only) */}
      <Dialog open={showRoleTransitionDialog} onOpenChange={setShowRoleTransitionDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <Users className="w-5 h-5" />
              Role Transition Required
            </DialogTitle>
            <DialogDescription>
              Changing <strong>{initialData?.full_name}</strong> from <strong>{role}</strong> to <strong>{form.role}</strong>.
              Please provide the necessary academic details for the new role.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Department *</Label>
              <Select value={transitionData.department} onValueChange={(v) => setTransitionData(prev => ({ ...prev, department: v }))}>
                <SelectTrigger><SelectValue placeholder="Select Department" /></SelectTrigger>
                <SelectContent>{DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {form.role === "student" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Semester *</Label>
                  <Select value={transitionData.semester} onValueChange={(v) => setTransitionData(prev => ({ ...prev, semester: v }))}>
                    <SelectTrigger><SelectValue placeholder="Sem" /></SelectTrigger>
                    <SelectContent>{SEMESTERS.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Section *</Label>
                  <Select value={transitionData.section} onValueChange={(v) => setTransitionData(prev => ({ ...prev, section: v }))}>
                    <SelectTrigger><SelectValue placeholder="Sec" /></SelectTrigger>
                    <SelectContent>{SECTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => {
              setShowRoleTransitionDialog(false);
              updateField("role", role); // Revert role
            }}>Cancel</Button>
            <Button onClick={() => {
              if (!transitionData.department || (form.role === "student" && (!transitionData.semester || !transitionData.section))) {
                toast({ title: "Missing fields", description: "Please provide all academic details.", variant: "destructive" });
                return;
              }
              // Update form with transition data
              setForm(prev => ({
                ...prev,
                department: transitionData.department,
                semester: transitionData.semester,
                section: transitionData.section
              }));
              setShowRoleTransitionDialog(false);
              saveProfile(false);
            }}>Confirm & Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin Specific Re-verification Warning */}
      <Dialog open={showAdminReverifyDialog} onOpenChange={setShowAdminReverifyDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Shield className="w-5 h-5" />
              Loss of Management Access
            </DialogTitle>
            <div className="pt-2 text-sm text-muted-foreground">
              <p className="mb-4">
                Changing your <strong>Photo</strong> or <strong>Department</strong> will trigger a mandatory re-verification.
              </p>
              <div className="bg-destructive/5 border border-destructive/10 p-4 rounded-lg text-destructive font-medium space-y-2 text-left">
                <p>⚠️ IMPORTANT:</p>
                <ul className="list-disc pl-4 text-xs space-y-1">
                  <li>You will be restricted from all management pages immediately.</li>
                  <li>You must be verified by **any one** of the other admins to regain access.</li>
                  <li>This is a security measure to prevent unauthorized profile takeovers.</li>
                </ul>
              </div>
            </div>
          </DialogHeader>
          <DialogFooter className="flex gap-2 justify-end mt-4">
            <Button variant="outline" onClick={() => {
              setShowAdminReverifyDialog(false);
              // Reset values to initial
              if (initialData) {
                setForm(initialData as any);
                setAvatarFile(null);
              }
            }}>Cancel</Button>
            <Button variant="destructive" onClick={() => {
              setShowAdminReverifyDialog(false);
              saveProfile(true);
            }}>Save & Re-verify</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
};

export default ProfileForm;
