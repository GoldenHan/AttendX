
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

export interface Institution {
  id: string;
  name: string;
  adminUids: string[]; // UIDs of users with admin role for this institution
  createdAt: string; // ISO date string
}

export interface Sede {
  id: string;
  name: string;
  supervisorId?: string | null; // UID of the user with role 'supervisor' assigned to this Sede
  institutionId: string; // ID of the institution this Sede belongs to (Mandatory)
}

export interface User {
  id: string; // Firestore document ID (for users collection, this will be the Firebase Auth UID)
  uid?: string; // Firebase Auth UID (explicitly ensure it's here, often same as id for 'users' collection)
  name: string;
  username?: string | null;
  role: 'student' | 'teacher' | 'admin' | 'caja' | 'supervisor';
  email?: string | null;
  phoneNumber?: string | null;
  photoUrl?: string | null;
  attendanceCode?: string | null;
  requiresPasswordChange?: boolean;
  sedeId?: string | null; // For teachers and supervisors to link them to a Sede, and for students
  institutionId: string; // ID of the institution this user belongs to (Mandatory for all users)

  // Student-specific fields
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
  institutionId?: string | null;
}

export interface Session {
  id: string;
  classId: string; // This is the Group ID
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  institutionId?: string | null;
  sedeId?: string | null;
}

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  userId: string;
  status: 'present' | 'absent' | 'late';
  timestamp: string;
  observation?: string;
  institutionId?: string | null;
}

export interface Group {
  id: string;
  name: string;
  type: 'Saturday' | 'Sunday' | 'SaturdayAndSunday' | 'Daily';
  startDate: string;
  endDate?: string | null;
  studentIds: string[];
  teacherId?: string | null;
  sedeId: string | null; // Made nullable, but will be set if group is in a Sede
  institutionId: string; // Mandatory: a group must belong to an institution
}

export interface GradingConfiguration {
  id?: string;
  numberOfPartials: 1 | 2 | 3 | 4;
  passingGrade: number;
  maxIndividualActivityScore: number;
  maxTotalAccumulatedScore: number;
  maxExamScore: number;
  institutionId?: string | null;
}

export const DEFAULT_GRADING_CONFIG: GradingConfiguration = {
  numberOfPartials: 3,
  passingGrade: 70,
  maxIndividualActivityScore: 10,
  maxTotalAccumulatedScore: 50,
  maxExamScore: 50,
};

export interface ClassScheduleConfiguration {
  id?: string;
  scheduleType: 'Saturday' | 'Sunday' | 'Daily' | 'NotSet' | 'SaturdayAndSunday';
  startTime: string;
  endTime: string;
  institutionId?: string | null;
}

export const DEFAULT_CLASS_SCHEDULE_CONFIG: ClassScheduleConfiguration = {
  scheduleType: 'NotSet',
  startTime: '09:00',
  endTime: '17:00',
};

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

export const getDefaultPartialScores = (): PartialScores => ({
  accumulatedActivities: [],
  exam: { name: 'Examen', score: null },
});

export const getDefaultStudentGradeStructure = (config: GradingConfiguration): StudentGradeStructure => {
  const structure: StudentGradeStructure = {
    partial1: getDefaultPartialScores(),
    partial2: getDefaultPartialScores(),
    partial3: getDefaultPartialScores(),
    certificateCode: '',
  };
  if (config.numberOfPartials >= 4) {
    structure.partial4 = getDefaultPartialScores();
  }
  return structure;
};
