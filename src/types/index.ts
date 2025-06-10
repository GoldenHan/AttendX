
export interface User {
  id: string; // Firestore document ID
  uid?: string; // Firebase Auth UID
  name: string;
  role: 'student' | 'teacher' | 'admin' | 'caja';
  email?: string; // Now optional for all
  phoneNumber?: string; // New optional field for phone number
  photoUrl?: string; // Optional: URL to the student's photo
  level?: 'Beginner' | 'Intermediate' | 'Advanced' | 'Other'; // Optional: Student's level
  notes?: string; // Optional: General notes about the student
  age?: number; // Optional: Student's age
  gender?: 'male' | 'female' | 'other'; // Optional: Student's gender
  preferredShift?: 'Saturday' | 'Sunday'; // Optional: Student's preferred shift
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
}
