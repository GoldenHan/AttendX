
export interface ScoreDetail {
  name?: string | null; // Custom name for the activity
  score?: number | null; // Score for the activity
}

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
  grades?: {
    partial1?: PartialScores;
    partial2?: PartialScores;
    partial3?: PartialScores;
  };
}

export interface PartialScores {
  acc1?: ScoreDetail | null;
  acc2?: ScoreDetail | null;
  acc3?: ScoreDetail | null;
  acc4?: ScoreDetail | null;
  exam?: ScoreDetail | null;
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
  endDate?: string | null; // ISO Date string, optional
  studentIds: string[];
  teacherId?: string | null; // ID of the assigned teacher
}
