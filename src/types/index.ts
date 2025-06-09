
export interface User {
  id: string;
  name: string;
  role: 'student' | 'teacher' | 'admin';
  email?: string;
  photoUrl?: string; // Optional: URL to the student's photo
  level?: 'Beginner' | 'Intermediate' | 'Advanced' | 'Other'; // Optional: Student's level
  notes?: string; // Optional: General notes about the student
}

export interface ClassInfo {
  id: string;
  name: string;
  teacherId: string;
  studentIds: string[];
}

export interface Session {
  id: string;
  classId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  qrCodeValue?: string; // Could be sessionId or a unique token
}

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  userId: string;
  status: 'present' | 'absent' | 'late';
  timestamp: string; // ISO date string
}

export interface Group {
  id: string;
  name: string;
  studentIds: string[];
}
