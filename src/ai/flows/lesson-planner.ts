
'use server';

/**
 * @fileOverview An AI tool to generate lesson plan ideas for a specific group.
 *
 * - generateLessonPlanIdeas - A function that handles generating lesson plan ideas.
 * - LessonPlannerInput - The input type for the function.
 * - LessonPlannerOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const LessonPlannerInputSchema = z.object({
  groupName: z.string().describe('The name of the student group.'),
  groupLevel: z
    .string()
    .describe('The academic level of the group (e.g., Beginner, Intermediate, Advanced).'),
});
export type LessonPlannerInput = z.infer<typeof LessonPlannerInputSchema>;

const LessonIdeaSchema = z.object({
  topic: z.string().describe('A specific topic for the lesson.'),
  objective: z.string().describe('The learning objective for the lesson.'),
  activities: z
    .array(z.string())
    .describe('A list of engaging activities for the students.'),
});

const LessonPlannerOutputSchema = z.object({
  lessonIdeas: z
    .array(LessonIdeaSchema)
    .describe('A list of creative and relevant lesson plan ideas.'),
});
export type LessonPlannerOutput = z.infer<typeof LessonPlannerOutputSchema>;

export async function generateLessonPlanIdeas(
  input: LessonPlannerInput
): Promise<LessonPlannerOutput> {
  return lessonPlannerFlow(input);
}

const prompt = ai.definePrompt({
  name: 'lessonPlannerPrompt',
  input: { schema: LessonPlannerInputSchema },
  output: { schema: LessonPlannerOutputSchema },
  prompt: `You are an expert curriculum designer and teacher's assistant for an English language academy. Your task is to generate creative and practical lesson plan ideas.

You will be given the name of a student group and their academic level. Based on this information, generate a list of three distinct and engaging lesson plan ideas.

For each idea, provide:
1. A clear 'topic' for the lesson.
2. A concise 'objective' that students should achieve.
3. A list of 3-4 specific 'activities' to conduct during the lesson.

The activities should be varied and interactive (e.g., role-playing, group discussions, games, quick presentations).

Group Information:
- Name: {{{groupName}}}
- Level: {{{groupLevel}}}

Generate the lesson plan ideas now.`,
});

const lessonPlannerFlow = ai.defineFlow(
  {
    name: 'lessonPlannerFlow',
    inputSchema: LessonPlannerInputSchema,
    outputSchema: LessonPlannerOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
