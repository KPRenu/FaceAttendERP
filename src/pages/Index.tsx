import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, Shield, Users, ScanFace, ArrowRight, Fingerprint, MapPin, Calendar, ShieldCheck, Github, Linkedin, Phone, Mail } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <header className="gradient-dark">
        <nav className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg gradient-primary flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-lg text-primary-foreground">FaceAttend</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost" className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-sidebar-accent">
                Sign In
              </Button>
            </Link>
            <Link to="/signup">
              <Button className="gradient-primary border-0 text-primary-foreground">
                Get Started
              </Button>
            </Link>
          </div>
        </nav>

        <div className="container mx-auto px-4 py-20 lg:py-32 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-sidebar-accent text-primary-foreground/80 text-sm mb-6">
            <ScanFace className="w-4 h-4" />
            Face Recognition Powered
          </div>
          <h1 className="text-4xl lg:text-6xl font-display font-bold text-primary-foreground max-w-3xl mx-auto leading-tight">
            Smart Attendance Management System
          </h1>
          <p className="text-lg lg:text-xl text-primary-foreground/70 mt-6 max-w-2xl mx-auto">
            Automated face recognition attendance with role-based dashboards for students, teachers, and administrators.
          </p>
          <div className="flex items-center justify-center gap-4 mt-8">
            <Link to="/signup">
              <Button size="lg" className="gradient-primary border-0 text-primary-foreground gap-2">
                Start Free <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline" className="border-primary-foreground/20 text-primary-foreground hover:bg-sidebar-accent">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Features */}
      <section className="container mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-display font-bold text-foreground">Comprehensive Security Layers</h2>
          <p className="text-muted-foreground mt-2">Multi-factor verification for maximum attendance integrity</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <div className="p-6 rounded-xl border border-border bg-card shadow-card hover:shadow-card-hover transition-all">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <ScanFace className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-display font-semibold text-lg mb-2">AI Face Verification</h3>
            <p className="text-muted-foreground text-sm">Advanced DeepFace technology with cosine similarity matching for precision identity verification.</p>
          </div>
          
          <div className="p-6 rounded-xl border border-border bg-card shadow-card hover:shadow-card-hover transition-all">
            <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
              <Fingerprint className="w-6 h-6 text-accent" />
            </div>
            <h3 className="font-display font-semibold text-lg mb-2">Biometric Authentication</h3>
            <p className="text-muted-foreground text-sm">Secure WebAuthn integration for device-level fingerprint and face ID verification.</p>
          </div>

          <div className="p-6 rounded-xl border border-border bg-card shadow-card hover:shadow-card-hover transition-all">
            <div className="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center mb-4">
              <MapPin className="w-6 h-6 text-success" />
            </div>
            <h3 className="font-display font-semibold text-lg mb-2">Geofencing Security</h3>
            <p className="text-muted-foreground text-sm">Location-based tracking ensuring students are within 150m of the classroom with anti-spoofing checks.</p>
          </div>

          <div className="p-6 rounded-xl border border-border bg-card shadow-card hover:shadow-card-hover transition-all">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-display font-semibold text-lg mb-2">Multi-Role System</h3>
            <p className="text-muted-foreground text-sm">Custom dashboards for Admins, Teachers, and Students with specific access controls.</p>
          </div>

          <div className="p-6 rounded-xl border border-border bg-card shadow-card hover:shadow-card-hover transition-all">
            <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
              <Calendar className="w-6 h-6 text-accent" />
            </div>
            <h3 className="font-display font-semibold text-lg mb-2">Timetable Management</h3>
            <p className="text-muted-foreground text-sm">Complete schedule tracking for teachers to manage classes, subjects, and specific time slots.</p>
          </div>

          <div className="p-6 rounded-xl border border-border bg-card shadow-card hover:shadow-card-hover transition-all">
            <div className="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center mb-4">
              <ShieldCheck className="w-6 h-6 text-success" />
            </div>
            <h3 className="font-display font-semibold text-lg mb-2">Attendance Integrity</h3>
            <p className="text-muted-foreground text-sm">Immutable recording system storing snapshots, role IDs, and verification metadata for audit trails.</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/30 pt-16 pb-8">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-12">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
                  <ClipboardCheck className="w-4 h-4 text-primary-foreground" />
                </div>
                <span className="font-display font-bold text-lg">FaceAttend</span>
              </div>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Empowering educational institutions with AI-driven, secure, and automated attendance tracking solutions.
              </p>
            </div>

            <div>
              <h4 className="font-display font-bold text-foreground mb-4">Connect with Developer</h4>
              <div className="space-y-3">
                <a href="https://github.com/KPRenu/FaceAttendERP" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
                  <Github className="w-4 h-4" /> Github: KPRenu/FaceAttendERP
                </a>
                <a href="https://www.linkedin.com/in/renuka-prasad-k-p-b78a08266" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
                  <Linkedin className="w-4 h-4" /> LinkedIn: Renuka Prasad K P
                </a>
              </div>
            </div>

            <div>
              <h4 className="font-display font-bold text-foreground mb-4">Contact Details</h4>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="w-4 h-4" /> +91 63626 24131
                </div>
                <a href="mailto:renukaprasadkp25@gmail.com" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
                  <Mail className="w-4 h-4" /> renukaprasadkp25@gmail.com
                </a>
              </div>
            </div>
          </div>
          
          <div className="border-t border-border pt-8 text-center text-sm text-muted-foreground">
            <p>© 2026 FaceAttend ERP. Built with Precision & Security.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
