
export interface User {
  id: string; // Firestore document ID
  uid?: string; // Firebase Auth UID
  name: string;
  role: 'student' | 'teacher' | 'admin' | 'caja';
  email?: string; 
  phoneNumber?: string; 
  photoUrl?: string; 
  level?: 'Beginner' | 'Intermediate' | 'Advanced' | 'Other'; 
  notes?: string; 
  age?: number; 
  gender?: 'male' | 'female' | 'other'; 
  preferredShift?: 'Saturday' | 'Sunday'; 
  partial1Grade?: number; // Optional: Grade for partial 1
  partial2Grade?: number; // Optional: Grade for partial 2
  partial3Grade?: number; // Optional: Grade for partial 3
}

export interface Session {
  id: string;
  classId: string; // This ID now refers to an ID from the 'groups' collection
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
  observation?: string; // Optional observation/justification for absence
}

export interface Group {
  id: string;
  name: string;
  type: 'Saturday' | 'Sunday';
  startDate: string; // ISO Date string
  endDate?: string; // ISO Date string, optional
  studentIds: string[];
  teacherId?: string; // ID of the assigned teacher
}

