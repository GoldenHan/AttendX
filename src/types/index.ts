

export interface Attachment {
  name: string;
  url: string;
  path: string; // Full path in Storage, for deletion
}

export interface ScoreDetail { // Used in User.gradesByLevel
  name?: string | null;
  score?: number | null;
}

export interface ActivityScore { // Used directly in PartialScores form type, and User.gradesByLevel
  id: string; // Unique ID for the activity within the partial (can be RHF generated or from DB)
  name?: string | null;
  score?: number | null;
}

export interface ExamScore { // Used directly in PartialScores form type, and User.gradesByLevel
  name?: string | null;
  score?: number | null;
}

// Represents the structure of how partial scores are stored in Firestore for a student.
// Corresponds to what is saved from the GradeEntryFormValues.
export interface PartialScores { // Stored in Firestore under student.gradesByLevel.partialX
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
  appName?: string | null;
  logoDataUrl?: string | null;
  adminUids: string[]; // UIDs of users with admin role for this institution
  createdAt: string; // ISO date string
}

export interface Sede {
  id: string;
  name: string;
  supervisorId?: string | null; // UID of the user with role 'supervisor' assigned to this Sede
  institutionId: string;
}

export interface User {
  id: string; 
  uid?: string; 
  name: string;
  username?: string | null;
  role: 'student' | 'teacher' | 'admin' | 'caja' | 'supervisor';
  email?: string | null;
  phoneNumber?: string | null;
  photoUrl?: string | null;
  attendanceCode?: string | null;
  requiresPasswordChange?: boolean;
  sedeId?: string | null; 
  institutionId: string | null;

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
  timestamp: string; // ISO string
  date: string; // YYYY-MM-DD format
  attendanceCodeUsed: string;
  institutionId: string;
}

export interface Session {
  id: string;
  classId: string; // This is the Group ID
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  institutionId: string;
  sedeId?: string | null;
}

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  userId: string;
  status: 'present' | 'absent' | 'late';
  timestamp: string;
  observation?: string;
  institutionId: string;
}

export interface Group {
  id: string;
  name: string;
  type: 'Saturday' | 'Sunday' | 'SaturdayAndSunday' | 'Daily';
  startDate: string;
  endDate?: string | null;
  studentIds: string[];
  teacherId?: string | null;
  sedeId: string | null;
  institutionId: string;
}

export interface GradingConfiguration {
  numberOfPartials: 1 | 2 | 3 | 4;
  passingGrade: number;
  maxIndividualActivityScore: number;
  maxTotalAccumulatedScore: number;
  maxExamScore: number;
}

export const DEFAULT_GRADING_CONFIG: GradingConfiguration = {
  numberOfPartials: 3,
  passingGrade: 70,
  maxIndividualActivityScore: 10,
  maxTotalAccumulatedScore: 50,
  maxExamScore: 50,
};

export interface ClassScheduleConfiguration {
  scheduleType: 'Saturday' | 'Sunday' | 'Daily' | 'NotSet' | 'SaturdayAndSunday';
  startTime: string;
  endTime: string;
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

// New type for Notifications
export interface Notification {
  id: string;
  userId: string;
  institutionId: string;
  message: string;
  read: boolean;
  createdAt: string; // ISO string
  relatedUrl?: string; // e.g., /classroom/assignments?itemId=...
}

// New type for Classroom items
export interface ClassroomItem {
  id: string;
  groupId: string;
  institutionId: string;
  teacherId: string; // User ID of the teacher/admin/supervisor who created it
  title: string;
  description: string;
  itemType: 'assignment' | 'reminder';
  dueDate?: string | null; // ISO string for due date, optional for reminders
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  status: 'published' | 'draft';
  attachments?: Attachment[];
}

// New type for Student Submissions to Classroom Items
export interface ClassroomItemSubmission {
  id: string; // Auto-generated Firestore ID
  itemId: string; // ID of the ClassroomItem
  studentId: string; // ID of the student submitting
  institutionId: string;
  groupId: string; // groupId of the original item, for easier querying
  submittedAt: string; // ISO string timestamp of when it was submitted
  status: 'submitted' | 'late'; // Status of the submission
  grade?: number | null; // Optional grade given by the teacher
  feedback?: string | null; // Optional feedback from the teacher
  attachments?: Attachment[];
}

// New type for displaying enriched submission data
export interface EnrichedSubmission extends ClassroomItemSubmission {
  studentName: string;
  studentPhotoUrl?: string | null;
}


// New type for Payments
export interface Payment {
  id: string;
  studentId: string;
  studentName: string;
  amount: number;
  concept: string;
  paymentDate: string; // ISO String
  createdAt: string; // ISO String
  recordedByUid: string;
  recordedByName: string;
  institutionId: string;
}
