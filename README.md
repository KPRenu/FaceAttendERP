# FaceAttendERP: AI-Powered Attendance Management System

FaceAttendERP is a modern, full-stack attendance management system that leverages Artificial Intelligence (Face Recognition) to automate student and employee tracking. Built with React, Supabase, and a Python-based Face Recognition server.

## 🚀 Key Features

- **Multi-Role Dashboards**: Specialized views for Admins, Teachers, and Students.
- **Smart Attendance**: Real-time face verification for high-security attendance marking.
- **Timetable Management**: Dynamic timetable with "Hold" functionality for teachers.
- **Snapshot Integrity**: Every attendance record snapshots student and teacher metadata to preserve history even after profile updates.
- **Admin Management**: Bulk actions for users, classes, subjects, and issue resolution.
- **Profile Security**: Strict re-verification workflows for administrators changing critical profile details.

## 🛠️ Technology Stack

- **Frontend**: Vite + React + TypeScript + Tailwind CSS + Lucide Icons
- **Database / Auth**: Supabase (PostgreSQL with `pgvector`)
- **AI Server**: Python (FastAPI + DeepFace + OpenCV)

---

## 💻 Installation & Setup

### 1. Prerequisite
- **Node.js** (v18+)
- **Python** (v3.9+)
- **Supabase Account**

### 2. Frontend Setup
```bash
git clone <your-repo-url>
cd faceid-class-manager-main
npm install
```

### 3. AI Server Setup (Python)
It is recommended to use a virtual environment:
```bash
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install fastapi uvicorn deepface opencv-python supabase python-dotenv numpy pillow
```

### 4. Environment Variables
Create a `.env` file in the root directory:
```env
# Supabase Frontend Config
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key

# Python AI Server Config
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 5. Running the Project

**Start Frontend:**
```bash
npm run dev
```

**Start AI Server:**
```bash
python face_server.py
```

---

## 🏗️ Future Enhancements
- Integration with external HRMS systems.
- Mobile application for edge device attendance.
- Advanced analytics for student performance tracking.

## 📄 License
MIT License. Feel free to use and enhance.
