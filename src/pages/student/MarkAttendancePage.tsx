import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Camera, ScanFace, CheckCircle, Clock, MapPin, User, Loader2, Fingerprint } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatTime, getLocalDate } from "@/lib/utils";
import { speak, playBeep } from "@/lib/audioUtils";
import { verifyFaceWithRetry, startKeepAlivePing } from "@/lib/apiUtils";
import Webcam from "react-webcam";

const MarkAttendancePage = () => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [classCode, setClassCode] = useState("");
  const [step, setStep] = useState<"code" | "verify" | "choice" | "done">("code");
  const [currentClass, setCurrentClass] = useState<any>(null);
  const [activeCode, setActiveCode] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [biometricStatus, setBiometricStatus] = useState<string | null>(null);
  const [classDetails, setClassDetails] = useState<any>(null);
  const webcamRef = useRef<Webcam>(null);

  useEffect(() => {
    const fetchCurrentClass = async () => {
      if (!profile) return;
      setLoading(true);
      const now = new Date();
      const day = now.toLocaleDateString('en-US', { weekday: 'long' });
      const currentTime = now.toLocaleTimeString('en-US', { hour12: false });

      const { data: classes } = await supabase.from("classes")
        .select("*")
        .eq("department", profile.department)
        .eq("section", profile.section)
        .eq("semester", profile.semester)
        .eq("is_deleted", false);

      const classIds = classes?.map(c => c.id) || [];

      if (classIds.length > 0) {
        const { data: timetable } = await supabase.from("timetable")
          .select("*")
          .in("class_id", classIds)
          .eq("day_of_week", day)
          .eq("is_deleted", false)
          .eq("is_on_hold", false)
          .lte("start_time", currentTime)
          .gte("end_time", currentTime)
          .maybeSingle();

        if (timetable) {
          const classData = classes?.find(c => c.id === timetable.class_id);
          const { data: subject } = await supabase.from("subjects").select("subject_name").eq("id", timetable.subject_id).single();
          const { data: teacher } = await supabase.from("profiles").select("full_name").eq("user_id", timetable.teacher_id).single();

          setCurrentClass({
            ...timetable,
            subject_name: subject?.subject_name,
            teacher_name: teacher?.full_name,
            class_name: classData?.class_name,
            department: classData?.department,
            semester: classData?.semester
          });
        } else {
          setCurrentClass(null);
        }
      }
      setLoading(false);
    };
    fetchCurrentClass();
  }, [profile]);

  useEffect(() => {
    const fetchBiometricStatus = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("user_biometrics")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle();
      setBiometricStatus(data?.status || null);
    };
    fetchBiometricStatus();
  }, [user]);

  // Keep-alive ping for AI server
  useEffect(() => {
    return startKeepAlivePing();
  }, []);

  const handleCodeSubmit = async () => {
    if (!classCode.trim()) {
      toast({ title: "Enter class code", variant: "destructive" });
      return;
    }
    if (profile?.photo_status !== "verified") {
      toast({ title: "Photo not verified", description: "Your profile photo must be verified by admin before you can mark attendance.", variant: "destructive" });
      return;
    }

    if (!currentClass) {
      toast({ title: "No active class", description: "You can only mark attendance during your scheduled class time.", variant: "destructive" });
      return;
    }

    const queryCode = classCode.trim().toUpperCase();
    const { data: codeData, error } = await supabase.from("class_codes")
      .select("*")
      .eq("code", queryCode)
      .eq("timetable_id", currentClass.id)
      .eq("is_active", true)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error || !codeData) {
      toast({ title: "Invalid Code", description: "This code is invalid, expired, or not for this class.", variant: "destructive" });
      return;
    }

    setActiveCode(codeData);
    setClassDetails({ ...currentClass, ...codeData }); // Consolidate class and code data
    if (biometricStatus === 'verified') {
      setStep("choice");
    } else {
      setStep("verify"); // Default to face verification if no biometric or not verified
    }
  };

  const handleVerifyBiometric = async () => {
    if (!user || !classDetails) return;

    setVerifying(true);
    try {
      // 1. Fetch the LATEST verified credential ID from database
      const { data: bioData, error: bioError } = await supabase
        .from("user_biometrics")
        .select("credential_id")
        .eq("user_id", user.id)
        .eq("status", "verified")
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
        // Biometric verified, mark attendance
        const date = getLocalDate();

        // 1. Check for existing record for THIS specific slot
        const { data: existing } = await supabase.from("attendance")
          .select("status")
          .eq("student_id", user.id)
          .eq("timetable_id", classDetails.timetable_id) // Use classDetails.timetable_id
          .eq("date", date)
          .eq("slot_start_time", classDetails.slot_start_time)
          .eq("slot_end_time", classDetails.slot_end_time)
          .maybeSingle();

        if (existing?.status === 'present') {
          speak("Attendance already marked");
          toast({ title: "Already Marked", description: "You are already marked as present for this class." });
          setStep("done");
          return;
        }

        // 2. Upsert attendance with slot identity
        const { error } = await supabase.from("attendance").upsert({
          student_id: user.id,
          timetable_id: classDetails.timetable_id,
          class_code_id: activeCode?.id || classDetails.id, 
          status: "present",
          date: date,
          slot_start_time: classDetails.slot_start_time,
          slot_end_time: classDetails.slot_end_time,
          subject_name: classDetails.subject_name,
          teacher_name: classDetails.teacher_name,
          class_name: classDetails.class_name,
          department: classDetails.department,
          semester: classDetails.semester,
          teacher_id: classDetails.teacher_id,
          marked_at: new Date().toISOString()
        }, {
          onConflict: 'student_id,timetable_id,date,slot_start_time,slot_end_time'
        });

        if (error) {
          throw error;
        } else {
          setStep("done");
          const msg = existing?.status === 'absent'
            ? "Attendance updated from absent to present!"
            : "Attendance marked successfully!";
          speak("Attendance marked");
          toast({ title: "Success", description: msg });
        }
      }
    } catch (error: any) {
      console.error(error);
      playBeep();
      toast({
        title: "Biometric Failed",
        description: error.name === "NotAllowedError" ? "Verification cancelled." : "Failed to verify fingerprint.",
        variant: "destructive"
      });
    } finally {
      setVerifying(false);
    }
  };

  const captureAndVerify = useCallback(async () => {
    if (!webcamRef.current || !user || !currentClass || !activeCode) return;

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
        toast({ title: "Verified", description: "Face match confirmed! Marking attendance..." });

        const date = getLocalDate();

        // 1. Check for existing record for THIS specific slot
        const { data: existing } = await supabase.from("attendance")
          .select("status")
          .eq("student_id", user.id)
          .eq("timetable_id", currentClass.id)
          .eq("date", date)
          .eq("slot_start_time", activeCode.slot_start_time)
          .eq("slot_end_time", activeCode.slot_end_time)
          .maybeSingle();

        if (existing?.status === 'present') {
          speak("Attendance already marked");
          toast({ title: "Already Marked", description: "You are already marked as present for this class." });
          setStep("done");
          return;
        }

        // 2. Upsert attendance with slot identity
        const { error } = await supabase.from("attendance").upsert({
          student_id: user.id,
          timetable_id: currentClass.id,
          class_code_id: activeCode.id,
          status: "present",
          date: date,
          slot_start_time: activeCode.slot_start_time,
          slot_end_time: activeCode.slot_end_time,
          subject_name: currentClass.subject_name,
          teacher_name: currentClass.teacher_name,
          class_name: currentClass.class_name,
          department: currentClass.department,
          semester: currentClass.semester,
          teacher_id: currentClass.teacher_id,
          marked_at: new Date().toISOString()
        }, {
          onConflict: 'student_id,timetable_id,date,slot_start_time,slot_end_time'
        });

        if (error) {
          throw error;
        } else {
          setStep("done");
          const msg = existing?.status === 'absent'
            ? "Attendance updated from absent to present!"
            : "Attendance marked successfully!";
          speak("Attendance marked");
          toast({ title: "Success", description: msg });
        }
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
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  }, [user, currentClass, activeCode, toast]);

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-lg mx-auto">
        <div className="text-center">
          <h2 className="text-2xl font-display font-bold text-foreground">Mark Attendance</h2>
          <p className="text-muted-foreground mt-1">Verify your identity to record attendance</p>
        </div>

        {step === "code" && (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-lg font-display">Step 1: Class Code</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? <p className="text-center text-muted-foreground py-4">Checking schedule...</p> : currentClass ? (
                <div className="bg-primary/5 p-4 rounded-lg border border-primary/10 mb-4 text-center">
                  <h3 className="font-bold text-lg text-primary">{currentClass.subject_name}</h3>
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mt-1">
                    <User className="w-3 h-3" /> {currentClass.teacher_name}
                  </div>
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mt-1">
                    <Clock className="w-3 h-3" /> {formatTime(currentClass.start_time)} - {formatTime(currentClass.end_time)}
                  </div>
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mt-1">
                    <MapPin className="w-3 h-3" /> {currentClass.room_no}
                  </div>
                </div>
              ) : (
                <div className="bg-destructive/5 p-4 rounded-lg border border-destructive/10 mb-4 text-center text-destructive">
                  <p className="font-medium">No class scheduled right now.</p>
                  <p className="text-xs mt-1">Attendance can only be marked during class hours.</p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Class Code</Label>
                <Input
                  placeholder={currentClass ? "Enter code from teacher" : "No active class"}
                  value={classCode}
                  onChange={(e) => setClassCode(e.target.value)}
                  className="text-center text-lg tracking-widest"
                  disabled={!currentClass}
                />
              </div>
              <Button onClick={handleCodeSubmit} className="w-full" disabled={!currentClass}>
                <ScanFace className="w-4 h-4 mr-2" /> Next Step
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "choice" && (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-lg font-display text-center">Verify Identity</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 py-8">
              <Button 
                variant="outline" 
                className="flex items-center justify-start h-auto p-6 gap-4 border-2 hover:border-primary hover:bg-primary/5 transition-all text-left"
                onClick={() => setStep("verify")}
              >
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <ScanFace className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <div className="font-bold text-lg">Face Recognition</div>
                  <div className="text-sm text-muted-foreground">Verify using your registered photo</div>
                </div>
              </Button>
              <Button 
                variant="outline" 
                className="flex items-center justify-start h-auto p-6 gap-4 border-2 hover:border-primary hover:bg-primary/5 transition-all text-left"
                disabled={verifying}
                onClick={handleVerifyBiometric}
              >
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  {verifying ? <Loader2 className="w-8 h-8 animate-spin text-primary" /> : <Fingerprint className="w-8 h-8 text-primary" />}
                </div>
                <div>
                  <div className="font-bold text-lg">Fingerprint Sensor</div>
                  <div className="text-sm text-muted-foreground">Verify using your device biometric</div>
                </div>
              </Button>
              <Button variant="ghost" className="mt-4" onClick={() => setStep("code")}>
                Back to step 1
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "verify" && (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-lg font-display">Step 2: Identity Verification</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-center">
              <div className="relative w-full aspect-square max-w-[320px] mx-auto rounded-xl overflow-hidden bg-black border-2 border-border">
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
                  <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white">
                    <Loader2 className="w-8 h-8 animate-spin mb-2" />
                    <p className="text-sm font-medium">Verifying Face...</p>
                  </div>
                )}
                <div className="absolute inset-0 border-[30px] border-black/20 pointer-events-none">
                  <div className="w-full h-full border-2 border-primary/50 dashed-rounded rounded-full opacity-50"></div>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Position your face in the center of the frame and click verify.
                </p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(biometricStatus === 'verified' ? "choice" : "code")} className="flex-1" disabled={verifying}>
                  Back
                </Button>
                <Button onClick={captureAndVerify} className="flex-1" disabled={verifying}>
                  {verifying ? "Verifying..." : "Verify & Mark"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "done" && (
          <Card className="shadow-card">
            <CardContent className="py-12 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success/10 mb-4">
                <CheckCircle className="w-8 h-8 text-success" />
              </div>
              <h3 className="text-xl font-display font-bold text-foreground mb-2">Attendance Marked!</h3>
              <p className="text-muted-foreground mb-4">Your attendance has been recorded successfully.</p>
              <Button variant="outline" onClick={() => { setStep("code"); setClassCode(""); }}>Return to Dashboard</Button>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default MarkAttendancePage;
