import type { User, ClassInfo, Session, AttendanceRecord } from '@/types';

export const mockUsers: User[] = [
  { id: 'u1', name: 'Alice Wonderland', role: 'student', email: 'alice@example.com' },
  { id: 'u2', name: 'Bob The Builder', role: 'student', email: 'bob@example.com' },
  { id: 'u3', name: 'Charlie Brown', role: 'student', email: 'charlie@example.com' },
  { id: 'u4', name: 'Diana Prince', role: 'teacher', email: 'diana@example.com' },
  { id: 'u5', name: 'Edward Scissorhands', role: 'admin', email: 'edward@example.com' },
  { id: 'u6', name: 'Fiona Gallagher', role: 'student', email: 'fiona@example.com' },
];

export const mockClasses: ClassInfo[] = [
  { id: 'c1', name: 'Beginner English A1', teacherId: 'u4', studentIds: ['u1', 'u6'] },
  { id: 'c2', name: 'Intermediate English B1', teacherId: 'u4', studentIds: ['u2', 'u3'] },
];

export const mockSessions: Session[] = [
  { id: 's1', classId: 'c1', date: '2024-07-29', time: '10:00', qrCodeValue: 's1_qr' },
  { id: 's2', classId: 'c1', date: '2024-07-30', time: '10:00', qrCodeValue: 's2_qr' },
  { id: 's3', classId: 'c2', date: '2024-07-29', time: '14:00', qrCodeValue: 's3_qr' },
  { id: 's4', classId: 'c2', date: '2024-07-30', time: '14:00', qrCodeValue: 's4_qr' },
];

export const mockAttendanceRecords: AttendanceRecord[] = [
  { id: 'ar1', sessionId: 's1', userId: 'u1', status: 'present', timestamp: new Date('2024-07-29T10:05:00Z').toISOString() },
  { id: 'ar2', sessionId: 's1', userId: 'u6', status: 'present', timestamp: new Date('2024-07-29T10:02:00Z').toISOString() },
  { id: 'ar3', sessionId: 's2', userId: 'u1', status: 'absent', timestamp: new Date('2024-07-30T10:00:00Z').toISOString() }, // Logged as absent
  { id: 'ar4', sessionId: 's2', userId: 'u6', status: 'present', timestamp: new Date('2024-07-30T10:03:00Z').toISOString() },
  { id: 'ar5', sessionId: 's3', userId: 'u2', status: 'present', timestamp: new Date('2024-07-29T14:01:00Z').toISOString() },
  { id: 'ar6', sessionId: 's3', userId: 'u3', status: 'late', timestamp: new Date('2024-07-29T14:15:00Z').toISOString() },
];

// Function to generate a string for AI analysis from mock data
export const generateAttendanceStringForAI = (): string => {
  let recordsString = "";
  const studentRecords: Record<string, string[]> = {};

  mockAttendanceRecords.forEach(record => {
    const user = mockUsers.find(u => u.id === record.userId);
    if (user && user.role === 'student') {
      if (!studentRecords[user.name]) {
        studentRecords[user.name] = [];
      }
      const session = mockSessions.find(s => s.id === record.sessionId);
      const sessionDate = session ? session.date : 'Unknown Date';
      studentRecords[user.name].push(`${sessionDate}: ${record.status}`);
    }
  });

  for (const studentName in studentRecords) {
    recordsString += `${studentName}: ${studentRecords[studentName].join(', ')};\n`;
  }
  return recordsString.trim();
};
