
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

// Represents the structure of how partial scores are stored in Firestore for a student.
// Corresponds to what is saved from the GradeEntryFormValues.
export interface PartialScores { // Stored in Firestore under student.grades.partialX
  accumulatedActivities: ActivityScore[]; // Array of specific activities with scores
  exam: ExamScore | null; // Single exam for the partial
}

// This structure will hold grades for a specific level
export interface StudentGradeStructure {
  partial1?: PartialScores;
  partial2?: PartialScores;
  partial3?: PartialScores;
  partial4?: PartialScores;
  certificateCode?: string; // For physical certificate codes per level
}

export interface Sede {
  id: string;
  name: string;
  supervisorId?: string | null; // UID of the user with role 'supervisor' assigned to this Sede
}

export interface User {
  id: string; // Firestore document ID (for users collection, this will be the Firebase Auth UID)
  uid?: string; // Firebase Auth UID (explicitly ensure it's here, often same as id for 'users' collection)
  name: string;
  username?: string | null; 
  role: 'student' | 'teacher' | 'admin' | 'caja' | 'supervisor'; // Added 'supervisor' role
  email?: string | null; 
  phoneNumber?: string | null;
  photoUrl?: string | null;
  attendanceCode?: string | null; 
  requiresPasswordChange?: boolean; 
  sedeId?: string | null; // For teachers and supervisors to link them to a Sede

  // Student-specific fields (will be part of the User document if role is 'student')
  level?: 'Beginner' | 'Intermediate' | 'Advanced' | 'Other'; 
  notes?: string;
  age?: number;
  gender?: 'male' | 'female' | 'other';
  preferredShift?: 'Saturday' | 'Sunday';
  gradesByLevel?: Record<string, StudentGradeStructure>; 
}

export interface TeacherAttendanceRecord {
  id: string; 
  teacherId: string; 
  teacherName: string;
  timestamp: string; 
  attendanceCodeUsed: string;
}

export interface Session {
  id: string; 
  classId: string; 
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
}

export interface AttendanceRecord {
  id: string; 
  sessionId: string; 
  userId: string; // This will refer to User.id (which is UID) from 'users' collection if student logs in
  status: 'present' | 'absent' | 'late';
  timestamp: string; 
  observation?: string;
}

export interface Group {
  id: string; 
  name: string;
  type: 'Saturday' | 'Sunday' | 'SaturdayAndSunday' | 'Daily'; 
  startDate: string; 
  endDate?: string | null; 
  studentIds: string[]; // Array of User.id (UIDs from 'users' collection for students)
  teacherId?: string | null; // User.id of the assigned teacher (from 'users' collection)
  sedeId?: string | null; // ID of the Sede this group belongs to
}

// Configuration for the grading system
export interface GradingConfiguration {
  id?: string; 
  numberOfPartials: 1 | 2 | 3 | 4;
  passingGrade: number;
  maxIndividualActivityScore: number;
  maxTotalAccumulatedScore: number; 
  maxExamScore: number; 
}

// Default values for GradingConfiguration
export const DEFAULT_GRADING_CONFIG: GradingConfiguration = {
  numberOfPartials: 3,
  passingGrade: 70,
  maxIndividualActivityScore: 10, 
  maxTotalAccumulatedScore: 50,  
  maxExamScore: 50,
};

// Configuration for Class Schedules
export interface ClassScheduleConfiguration {
  id?: string; // Typically "currentClassScheduleConfig"
  scheduleType: 'Saturday' | 'Sunday' | 'Daily' | 'NotSet' | 'SaturdayAndSunday';
  startTime: string; // Format HH:MM
  endTime: string;   // Format HH:MM
}

// Default values for ClassScheduleConfiguration
export const DEFAULT_CLASS_SCHEDULE_CONFIG: ClassScheduleConfiguration = {
  scheduleType: 'NotSet',
  startTime: '09:00',
  endTime: '17:00',
};


// Extended User type for grades report pages
export interface StudentWithDetailedGrades extends User {
  gradesDisplayLevel?: string; 
  calculatedAccumulatedTotalP1?: number | null;
  calculatedAccumulatedTotalP2?: number | null;
  calculatedAccumulatedTotalP3?: number | null;
  calculatedAccumulatedTotalP4?: number | null;
  calculatedPartial1Total?: number | null;
  calculatedPartial2Total?: number | null;
  calculatedPartial3Total?: number | null;
  calculatedPartial4Total?: number | null;
  calculatedFinalGrade?: number | null;
}

// Helper to get default partial scores
export const getDefaultPartialScores = (): PartialScores => ({
  accumulatedActivities: [],
  exam: { name: 'Examen', score: null },
});

// Helper to get default grade structure for a new level
export const getDefaultStudentGradeStructure = (config: GradingConfiguration): StudentGradeStructure => {
  const structure: StudentGradeStructure = {
    partial1: getDefaultPartialScores(),
    partial2: getDefaultPartialScores(),
    partial3: getDefaultPartialScores(),
    partial4: getDefaultPartialScores(),
    certificateCode: '',
  };
  return structure;
};

