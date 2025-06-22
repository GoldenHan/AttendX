
import { config } from 'dotenv';
config();

import '@/ai/flows/attendance-analysis.ts';
// Removed user-admin-flow
import '@/ai/flows/lesson-planner.ts';
import '@/ai/flows/student-performance-report.ts';
