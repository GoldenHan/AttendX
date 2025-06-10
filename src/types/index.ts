

export interface ScoreDetail { // Used in User.grades
  name?: string | null; 
  score?: number | null;
}

export interface ActivityScore { // Used directly in PartialScores form type, and User.grades
  id: string; // Unique ID for the activity within the partial (can be RHF generated or from DB)
  name?: string | null;
  score?: number | null;
}

export interface ExamScore { // Used directly in PartialScores form type, and User.grades
  name?: string | null;
  score?: number | null;
}


export interface User {
  id: string; // Firestore document ID from 'users' or 'students' collection
  uid?: string; // Firebase Auth UID (typically for 'users' collection who can log in)
  name: string;
  role: 'student' | 'teacher' | 'admin' | 'caja';
  email?: string; 
  phoneNumber?: string; 
  photoUrl?: string; 
  
  // Student-specific fields (primarily in 'students' collection)
  level?: 'Beginner' | 'Intermediate' | 'Advanced' | 'Other'; 
  notes?: string; 
  age?: number; 
  gender?: 'male' | 'female' | 'other'; 
  preferredShift?: 'Saturday' | 'Sunday'; 
  grades?: {
    partial1?: PartialScores; // Represents data stored in Firestore for a student
    partial2?: PartialScores;
    partial3?: PartialScores;
  };
}

// Represents the structure of how partial scores are stored in Firestore for a student.
// Corresponds to what is saved from the GradeEntryFormValues.
export interface PartialScores { // Stored in Firestore under student.grades.partialX
  accumulatedActivities: ActivityScore[]; // Array of specific activities with scores
  exam: ExamScore | null; // Single exam for the partial
}


export interface Session {
  id: string; // Firestore document ID from 'sessions' collection
  classId: string; // This ID refers to a Group.id from the 'groups' collection
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  qrCodeValue?: string; 
}

export interface AttendanceRecord {
  id: string; // Firestore document ID from 'attendanceRecords' collection
  sessionId: string; // Refers to Session.id
  userId: string; // Refers to User.id (from 'students' collection)
  status: 'present' | 'absent' | 'late'; // 'late' might not be used by new teacher form yet
  timestamp: string; // ISO date string of when the record was made or for the session time
  observation?: string; 
}

export interface Group {
  id: string; // Firestore document ID from 'groups' collection
  name: string;
  type: 'Saturday' | 'Sunday'; // Or other relevant group types
  startDate: string; // ISO Date string
  endDate?: string | null; // ISO Date string, optional
  studentIds: string[]; // Array of User.id (from 'students' collection)
  teacherId?: string | null; // User.id of the assigned teacher (from 'users' collection)
}
