
'use server';

/**
 * @fileOverview An AI tool to generate a performance report for a student.
 *
 * - generateStudentPerformanceReport - A function that handles generating the report.
 * - StudentPerformanceInput - The input type for the function.
 * - StudentPerformanceOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const StudentPerformanceInputSchema = z.object({
  studentName: z.string().describe('The full name of the student.'),
  levelName: z.string().describe('The name of the academic level being evaluated.'),
  gradesSummary: z.string().describe('A summary of the student\'s grades for the level, including partial and final scores.'),
  attendanceSummary: z.string().describe('A summary of the student\'s attendance, including present, absent, and late counts, and the attendance rate.'),
  teacherObservations: z.string().describe('A compilation of observations made by teachers during classes, especially regarding absences.'),
});
export type StudentPerformanceInput = z.infer<typeof StudentPerformanceInputSchema>;


const StudentPerformanceOutputSchema = z.object({
  report: z.string().describe('A comprehensive, well-structured performance report in markdown format.'),
});
export type StudentPerformanceOutput = z.infer<typeof StudentPerformanceOutputSchema>;

export async function generateStudentPerformanceReport(
  input: StudentPerformanceInput
): Promise<StudentPerformanceOutput> {
  return studentPerformanceReportFlow(input);
}

const prompt = ai.definePrompt({
  name: 'studentPerformanceReportPrompt',
  input: { schema: StudentPerformanceInputSchema },
  output: { schema: StudentPerformanceOutputSchema },
  prompt: `You are an expert academic advisor and a teacher's assistant for an English language academy. Your task is to generate a comprehensive and constructive performance report for a student based on the data provided.

The report should be written in a professional and encouraging tone. It should be well-structured, easy to read, and provide actionable insights. Use markdown for formatting (e.g., headings, bold text, bullet points).

**Student Information:**
- **Name:** {{{studentName}}}
- **Level:** {{{levelName}}}

**Academic & Attendance Data:**
- **Grades Summary:** {{{gradesSummary}}}
- **Attendance Summary:** {{{attendanceSummary}}}
- **Teacher Observations (context for absences/behavior):** {{{teacherObservations}}}

**Instructions:**
1.  **Start with a General Summary:** Begin with a brief introductory paragraph summarizing the student's overall performance during the level.
2.  **Academic Performance Analysis:**
    *   Analyze the provided grades. Comment on the final grade and consistency across partials.
    *   Identify academic strengths (e.g., "demonstrates strong exam performance", "consistent high scores in activities").
    *   Identify areas for improvement based on the grades (e.g., "could improve on accumulated activities to boost the final score").
3.  **Attendance and Punctuality Analysis:**
    *   Analyze the attendance data. Comment on the attendance rate.
    *   If attendance is good, praise the student's commitment.
    *   If there are absences or lates, mention the impact this can have on learning, referencing the teacher observations if they provide context.
4.  **Recommendations:**
    *   Provide a short list of 2-3 clear, positive, and actionable recommendations for the student to continue their growth.
5.  **Concluding Remark:** End with a positive and motivational closing statement.

Generate the performance report now based on the provided data. Structure the output as a single string in the 'report' field.`,
});

const studentPerformanceReportFlow = ai.defineFlow(
  {
    name: 'studentPerformanceReportFlow',
    inputSchema: StudentPerformanceInputSchema,
    outputSchema: StudentPerformanceOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
