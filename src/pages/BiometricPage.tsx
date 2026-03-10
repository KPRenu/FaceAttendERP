import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Fingerprint, Trash2, Clock, CheckCircle, XCircle, ShieldAlert, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";

interface BiometricData {
  id: string;
  status: string;
  created_at: string;
}

const BiometricPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [biometric, setBiometric] = useState<BiometricData | null>(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const fetchBiometric = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_biometrics")
        .select("id, status, created_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      setBiometric(data);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBiometric();
  }, [user]);

  const handleRegister = async () => {
    if (!user) return;
    setRegistering(true);

    try {
      // 1. Generate challenge and options
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);
      
      const userID = new TextEncoder().encode(user.id);
      
      const options: CredentialCreationOptions = {
        publicKey: {
          challenge,
          rp: { name: "FaceAttend ERP", id: window.location.hostname },
          user: {
            id: userID,
            name: user.email || "user@example.com",
            displayName: user.email || "User",
          },
          pubKeyCredParams: [{ alg: -7, type: "public-key" }, { alg: -257, type: "public-key" }],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
            residentKey: "required",
          },
          timeout: 60000,
          attestation: "none",
        },
      };

      // 2. Create credential
      const credential = (await navigator.credentials.create(options)) as PublicKeyCredential;
      
      if (!credential) throw new Error("Failed to create biometric credential");

      // 3. Extract public key and ID (In a real app, this should be verified on server)
      // For this implementation, we store the ID and a dummy public key as it's locally handled
      const credentialId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
      
      const { error } = await supabase.from("user_biometrics").insert({
        user_id: user.id,
        credential_id: credentialId,
        public_key: "webauthn_public_key_stored_locally", // In production, store the actual parsed public key
        status: "pending"
      });

      if (error) throw error;

      toast({ title: "Registered Successfully", description: "Your fingerprint is now pending admin verification." });
      fetchBiometric();
    } catch (error: any) {
      console.error(error);
      toast({ 
        title: "Registration Failed", 
        description: error.name === "NotAllowedError" ? "Registration cancelled or timed out." : error.message, 
        variant: "destructive" 
      });
    } finally {
      setRegistering(false);
    }
  };

  const handleDelete = async () => {
    if (!biometric || !user) return;
    setLoading(true);
    setDeleteConfirmOpen(false);

    try {
      const { error } = await supabase
        .from("user_biometrics")
        .delete()
        .eq("id", biometric.id);

      if (error) throw error;

      toast({ title: "Biometric Deleted", description: "Your fingerprint has been removed." });
      setBiometric(null);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">Biometric Authentication</h2>
          <p className="text-muted-foreground mt-1">Register your fingerprint to mark attendance quickly</p>
        </div>

        <Card className="shadow-card border-primary/10">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Fingerprint className="w-6 h-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-xl">Fingerprint Management</CardTitle>
                <CardDescription>Only one biometric can be registered per account</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {loading ? (
              <div className="flex flex-col items-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
                <p className="text-sm text-muted-foreground">Loading biometric data...</p>
              </div>
            ) : biometric ? (
              <div className="space-y-6">
                <div className="bg-muted/50 p-6 rounded-xl border border-border flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-full ${
                      biometric.status === 'verified' ? 'bg-success/10 text-success' : 
                      biometric.status === 'rejected' ? 'bg-destructive/10 text-destructive' : 
                      'bg-warning/10 text-warning'
                    }`}>
                      {biometric.status === 'verified' ? <CheckCircle className="w-6 h-6" /> : 
                       biometric.status === 'rejected' ? <XCircle className="w-6 h-6" /> : 
                       <Clock className="w-6 h-6" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground">Registered Fingerprint</span>
                        <Badge variant="outline" className={
                          biometric.status === 'verified' ? 'border-success text-success' : 
                          biometric.status === 'rejected' ? 'border-destructive text-destructive' : 
                          'border-warning text-warning'
                        }>
                          {biometric.status.charAt(0).toUpperCase() + biometric.status.slice(1)}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Registered on {new Date(biometric.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20" onClick={() => setDeleteConfirmOpen(true)}>
                    <Trash2 className="w-4 h-4 mr-2" /> Delete
                  </Button>
                </div>

                {biometric.status === 'pending' && (
                  <div className="bg-warning/5 border border-warning/20 p-4 rounded-lg flex gap-3">
                    <Clock className="w-5 h-5 text-warning shrink-0" />
                    <p className="text-sm text-black font-medium">
                      Your biometric is awaiting admin verification. You cannot use it for attendance until it is approved.
                    </p>
                  </div>
                )}

                {biometric.status === 'rejected' && (
                  <div className="bg-destructive/5 border border-destructive/20 p-4 rounded-lg flex gap-3">
                    <ShieldAlert className="w-5 h-5 text-destructive shrink-0" />
                    <p className="text-sm text-destructive font-medium">
                      Your biometric was rejected by an admin. Please delete it and register again if needed.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 space-y-4">
                <div className="w-20 h-20 bg-primary/5 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Fingerprint className="w-10 h-10 text-primary/40" />
                </div>
                <h3 className="text-lg font-bold">No registered biometric</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  Register your device's fingerprint sensor for faster and secure attendance verification.
                </p>
                <div className="pt-4">
                  <Button onClick={handleRegister} disabled={registering} size="lg" className="px-8 py-6 text-lg">
                    {registering ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Registering...
                      </>
                    ) : (
                      <>
                        <Fingerprint className="w-5 h-5 mr-2" />
                        Register Fingerprint
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground pt-4 flex items-center justify-center gap-1">
                  <ShieldAlert className="w-3 h-3" />
                  Your fingerprint data stays securely on your device.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Information</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-3">
            <p>• Only **one fingerprint** can be registered per user account.</p>
            <p>• If you want to change your fingerprint, you must **delete the current one** first.</p>
            <p>• Any new biometric registration requires **manual verification** by an admin.</p>
            <p>• Biometric verification is optional and serves as an alternative to face recognition.</p>
          </CardContent>
        </Card>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <ShieldAlert className="w-5 h-5" />
                Confirm Deletion
              </DialogTitle>
              <DialogDescription className="pt-3">
                <p className="font-bold text-foreground mb-2">Are you absolutely sure?</p>
                <p>Deleting your biometric will immediately disable fingerprint login for your account. You will need to register a new one and wait for **admin approval** to use it again.</p>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-6 flex gap-2">
              <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)} disabled={loading}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={loading}>
                {loading ? "Deleting..." : "Yes, Delete Biometric"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default BiometricPage;
