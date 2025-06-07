export interface User {
  id: string;
  name: string;
  role: 'student' | 'teacher' | 'admin';
  email?: string;
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
