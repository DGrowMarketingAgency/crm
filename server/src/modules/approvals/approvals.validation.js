import { z } from 'zod';

export const submitReviewSchema = z.object({
  submissionNotes: z.string().max(2000, 'Submission notes must not exceed 2000 characters').optional().nullable()
});

export const approveSchema = z.object({
  feedback: z.string().max(2000, 'Feedback must not exceed 2000 characters').optional().nullable()
});

export const requestRevisionSchema = z.object({
  reviewerFeedback: z
    .string({ required_error: 'Revision feedback explaining the required changes is required' })
    .min(5, 'Revision feedback must be at least 5 characters long')
    .max(2000, 'Revision feedback must not exceed 2000 characters')
});
