'use server';

/**
 * @fileOverview An AI tool to analyze attendance patterns and identify students at risk of falling behind.
 *
 * - analyzeAttendance - A function that handles the attendance analysis process.
 * - AttendanceAnalysisInput - The input type for the analyzeAttendance function.
 * - AttendanceAnalysisOutput - The return type for the analyzeAttendance function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AttendanceAnalysisInputSchema = z.object({
  attendanceRecords: z
    .string()
    .describe('A string representation of attendance records for students.'),
});
export type AttendanceAnalysisInput = z.infer<typeof AttendanceAnalysisInputSchema>;

const AttendanceAnalysisOutputSchema = z.object({
  atRiskStudents: z
    .string()
    .describe('A list of students identified as being at risk due to poor attendance, with a brief explanation for each.'),
});
export type AttendanceAnalysisOutput = z.infer<typeof AttendanceAnalysisOutputSchema>;

export async function analyzeAttendance(input: AttendanceAnalysisInput): Promise<AttendanceAnalysisOutput> {
  return analyzeAttendanceFlow(input);
}

const prompt = ai.definePrompt({
  name: 'attendanceAnalysisPrompt',
  input: {schema: AttendanceAnalysisInputSchema},
  output: {schema: AttendanceAnalysisOutputSchema},
  prompt: `You are an AI assistant specialized in analyzing student attendance records to identify students who are at risk of falling behind due to frequent absences.

  Analyze the following attendance records and identify students who are frequently absent. Provide a list of these students along with a brief explanation of why they are considered at risk.

  Attendance Records: {{{attendanceRecords}}}

  Format the output as a string.`, // Ensuring the output is a string
});

const analyzeAttendanceFlow = ai.defineFlow(
  {
    name: 'analyzeAttendanceFlow',
    inputSchema: AttendanceAnalysisInputSchema,
    outputSchema: AttendanceAnalysisOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
