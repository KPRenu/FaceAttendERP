import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, Shield, Users, ScanFace, ArrowRight } from "lucide-react";

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
        <h2 className="text-3xl font-display font-bold text-foreground text-center mb-12">Key Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="text-center p-6 rounded-xl border border-border bg-card shadow-card hover:shadow-card-hover transition-shadow">
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <ScanFace className="w-7 h-7 text-primary" />
            </div>
            <h3 className="font-display font-semibold text-lg text-foreground mb-2">Face Recognition</h3>
            <p className="text-muted-foreground text-sm">Automated attendance marking using advanced face verification technology</p>
          </div>
          <div className="text-center p-6 rounded-xl border border-border bg-card shadow-card hover:shadow-card-hover transition-shadow">
            <div className="w-14 h-14 rounded-xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
              <Users className="w-7 h-7 text-accent" />
            </div>
            <h3 className="font-display font-semibold text-lg text-foreground mb-2">Role-Based Access</h3>
            <p className="text-muted-foreground text-sm">Separate dashboards for students, teachers, and administrators</p>
          </div>
          <div className="text-center p-6 rounded-xl border border-border bg-card shadow-card hover:shadow-card-hover transition-shadow">
            <div className="w-14 h-14 rounded-xl bg-success/10 flex items-center justify-center mx-auto mb-4">
              <Shield className="w-7 h-7 text-success" />
            </div>
            <h3 className="font-display font-semibold text-lg text-foreground mb-2">Admin Control</h3>
            <p className="text-muted-foreground text-sm">Complete management of classes, subjects, timetables, and user verification</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2026 FaceAttend ERP. Built with Lovable.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
