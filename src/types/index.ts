
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

export interface User {
  id: string; // Firestore document ID from 'users' or 'students' collection
  uid?: string; // Firebase Auth UID (typically for 'users' collection who can log in)
  name: string;
  role: 'student' | 'teacher' | 'admin' | 'caja';
  email?: string;
  phoneNumber?: string;
  photoUrl?: string;

  // Student-specific fields (primarily in 'students' collection)
  level?: 'Beginner' | 'Intermediate' | 'Advanced' | 'Other'; // Current level of the student
  notes?: string;
  age?: number;
  gender?: 'male' | 'female' | 'other';
  preferredShift?: 'Saturday' | 'Sunday';
  gradesByLevel?: Record<string, StudentGradeStructure>; // Key is the level name (e.g., "Beginner")
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
  status: 'present' | 'absent' | 'late';
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

// Configuration for the grading system
export interface GradingConfiguration {
  id?: string; // Document ID, typically "currentGradingConfig"
  numberOfPartials: 1 | 2 | 3 | 4;
  passingGrade: number;
  maxIndividualActivityScore: number;
  maxTotalAccumulatedScore: number; // Max sum for all accumulated activities in one partial
  maxExamScore: number; // Max score for the exam in one partial
}

// Default values for GradingConfiguration
export const DEFAULT_GRADING_CONFIG: GradingConfiguration = {
  numberOfPartials: 3,
  passingGrade: 70,
  maxIndividualActivityScore: 10, // e.g. each of 5 activities can be up to 10 points
  maxTotalAccumulatedScore: 50,  // Sum of activities cannot exceed 50
  maxExamScore: 50,
};

// Extended User type for grades report pages
export interface StudentWithDetailedGrades extends User {
  gradesDisplayLevel?: string; // The level for which grades are being displayed
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
  const structure: StudentGradeStructure = {};
  for (let i = 1; i <= config.numberOfPartials; i++) {
    structure[`partial${i as 1 | 2 | 3 | 4}` as keyof StudentGradeStructure] = getDefaultPartialScores();
  }
  // Ensure all 4 partials are defined if config is less, to match GradeEntryFormValues expectations
  for (let i = config.numberOfPartials + 1; i <= 4; i++) {
     if (!structure[`partial${i as 1 | 2 | 3 | 4}` as keyof StudentGradeStructure]) {
        structure[`partial${i as 1 | 2 | 3 | 4}` as keyof StudentGradeStructure] = getDefaultPartialScores();
     }
  }
  structure.certificateCode = '';
  return structure;
};
