
// Mock data has been removed as the application will now use Firestore.
// You will need to populate your Firestore database with initial data for users, classes, sessions, etc.

// This utility function can be used by the AI Analysis page after fetching data from Firestore.
import type { AttendanceRecord, User, Session } from '@/types';

export const generateAttendanceStringFromRecords = (
  attendanceRecords: AttendanceRecord[],
  users: User[],
  sessions: Session[]
): string => {
  let recordsString = "";
  const studentRecords: Record<string, string[]> = {};

  attendanceRecords.forEach(record => {
    const user = users.find(u => u.id === record.userId);
    if (user && user.role === 'student') {
      if (!studentRecords[user.name]) {
        studentRecords[user.name] = [];
      }
      const session = sessions.find(s => s.id === record.sessionId);
      // Assuming record.timestamp is an ISO string, convert to YYYY-MM-DD for consistency with original mock
      const recordDate = record.timestamp.split('T')[0];
      const sessionDateLabel = session ? `${session.date} (${recordDate})` : recordDate;
      
      studentRecords[user.name].push(`${sessionDateLabel}: ${record.status}`);
    }
  });

  for (const studentName in studentRecords) {
    recordsString += `${studentName}: ${studentRecords[studentName].join(', ')};\n`;
  }
  return recordsString.trim();
};
