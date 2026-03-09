import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import ProfileForm from "@/components/ProfileForm";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const ProfilePage = () => {
    const { user, role, profile: authProfile } = useAuth();
    const { userId } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [targetProfile, setTargetProfile] = useState<any>(null);
    const [targetRole, setTargetRole] = useState<string>("");

    const isOwnProfile = !userId || userId === user?.id;
    const isAdminView = role === "admin" && !isOwnProfile;

    useEffect(() => {
        const fetchProfile = async () => {
            setLoading(true);
            if (isOwnProfile) {
                setTargetProfile(authProfile);
                setTargetRole(role || "");
                setLoading(false);
            } else {
                // Admin viewing another user
                if (role !== "admin") {
                    navigate("/dashboard"); // Unauthorized
                    return;
                }

                const { data: profileData, error } = await supabase
                    .from("profiles")
                    .select("*")
                    .eq("user_id", userId)
                    .single();

                const { data: roleData } = await supabase
                    .from("user_roles")
                    .select("role")
                    .eq("user_id", userId)
                    .single();

                if (error || !profileData) {
                    // Handle not found - treat as new profile
                    console.log("Profile not found, initializing empty");
                    setTargetProfile({});
                    setTargetRole(roleData?.role || "student");
                } else {
                    setTargetProfile(profileData);
                    setTargetRole(roleData?.role || "student");
                }
                setLoading(false);
            }
        };

        fetchProfile();
    }, [userId, isOwnProfile, authProfile, role, navigate]);

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center h-full">
                    <p className="text-muted-foreground">Loading profile...</p>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    {isAdminView && (
                        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/users")}>
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                    )}
                    <div>
                        <h2 className="text-2xl font-display font-bold text-foreground">
                            {isOwnProfile ? "My Profile" : "Edit User Profile"}
                        </h2>
                        <p className="text-muted-foreground mt-1">
                            {isOwnProfile ? "Manage your personal information" : `Managing profile for ${targetProfile?.full_name || "user"}`}
                        </p>
                    </div>
                </div>

                <Card className="shadow-card max-w-2xl mx-auto">
                    <CardHeader>
                        <CardTitle>Profile Details</CardTitle>
                        <CardDescription>
                            Make changes to profile information here.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {(targetProfile !== null || isOwnProfile) && (
                            <ProfileForm
                                initialData={targetProfile || {}}
                                role={targetRole || role || "student"}
                                userId={isOwnProfile ? user!.id : userId!}
                                isAdminView={isAdminView}
                                onSuccess={() => {/* Toast handled in form */ }}
                            />
                        )}
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    );
};

export default ProfilePage;
