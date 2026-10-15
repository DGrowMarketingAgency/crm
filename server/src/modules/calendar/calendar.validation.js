import { z } from 'zod';

export const EVENT_CATEGORIES = [
  'content_publishing',
  'content_production',
  'seo_activities',
  'agency_operations'
];

export const EVENT_TYPES = {
  content_publishing: [
    'Static Post',
    'Carousel Post',
    'Reel',
    'Video Post',
    'Story',
    'Blog Post',
    'Website Content',
    'Campaign Launch'
  ],
  content_production: [
    'Content Planning',
    'Content Writing',
    'Graphic Design',
    'Video Editing',
    'Photo Shoot',
    'Video Shoot',
    'Content Review',
    'Client Approval',
    'Post Scheduling'
  ],
  seo_activities: [
    'On-Page SEO',
    'Off-Page SEO',
    'Keyword Research',
    'Technical SEO Audit',
    'Content Optimization',
    'Backlink Activity',
    'SEO Review',
    'SEO Performance Report'
  ],
  agency_operations: [
    'Client Meeting',
    'Internal Meeting',
    'Monthly Reporting',
    'Performance Review',
    'Strategy Planning',
    'Campaign Review',
    'General Task'
  ]
};

export const ALL_EVENT_TYPES = Object.values(EVENT_TYPES).flat();

export const EVENT_STATUSES = [
  'planned',
  'in_production',
  'pending_internal_review',
  'awaiting_client_approval',
  'scheduled',
  'completed',
  'published',
  'cancelled',
  'on_hold'
];

export const EVENT_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

export const PUBLISHING_PLATFORMS = [
  'Instagram',
  'Facebook',
  'LinkedIn',
  'YouTube',
  'Twitter / X',
  'TikTok',
  'Website',
  'Google Business Profile',
  'Other'
];

export const CONTENT_FORMATS = [
  'Single Image',
  'Carousel / Multi-Image',
  'Reel / Short Video',
  'Long-form Video',
  'Story',
  'Blog Article',
  'Infographic',
  'Copy / Text',
  'Other'
];

export const createEventSchema = z.object({
  clientId: z.union([z.number(), z.string().transform((v) => Number(v))]),
  title: z.string().min(1, 'Event title is required').max(255),
  description: z.string().optional().nullable(),
  eventType: z.string().min(1, 'Event type is required'),
  eventCategory: z.string().optional(),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid date in YYYY-MM-DD format required'),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, 'Valid HH:MM time').optional().nullable(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, 'Valid HH:MM time').optional().nullable(),
  isAllDay: z.boolean().optional().default(true),
  assignedTo: z.union([z.number(), z.string().transform((v) => Number(v))]).optional().nullable(),
  department: z.string().max(64).optional().nullable(),
  projectId: z.union([z.number(), z.string().transform((v) => Number(v))]).optional().nullable(),
  taskId: z.union([z.number(), z.string().transform((v) => Number(v))]).optional().nullable(),
  serviceId: z.union([z.number(), z.string().transform((v) => Number(v))]).optional().nullable(),
  platform: z.string().max(64).optional().nullable(),
  contentFormat: z.string().max(64).optional().nullable(),
  contentSummary: z.string().optional().nullable(),
  status: z.enum(EVENT_STATUSES).optional().default('planned'),
  priority: z.enum(EVENT_PRIORITIES).optional().default('medium'),
  internalNotes: z.string().optional().nullable(),
  clientNotes: z.string().optional().nullable(),
  isClientVisible: z.boolean().optional().default(false),
  // Task integration
  createLinkedTask: z.boolean().optional().default(false),
  // Recurrence settings
  recurrence: z.object({
    pattern: z.enum(['daily', 'weekly', 'monthly', 'custom_weekdays']),
    intervalCount: z.number().int().min(1).default(1),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).optional().nullable(), // 0 = Sunday, 6 = Saturday
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    maxOccurrences: z.number().int().min(1).max(100).optional().nullable()
  }).optional().nullable()
}).refine((data) => {
  if (data.startTime && data.endTime && !data.isAllDay) {
    return data.endTime >= data.startTime;
  }
  return true;
}, {
  message: 'End time cannot be earlier than start time',
  path: ['endTime']
});

export const updateEventSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional().nullable(),
  eventType: z.string().optional(),
  eventCategory: z.string().optional(),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/).optional().nullable(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/).optional().nullable(),
  isAllDay: z.boolean().optional(),
  assignedTo: z.union([z.number(), z.string().transform((v) => Number(v))]).optional().nullable(),
  department: z.string().max(64).optional().nullable(),
  projectId: z.union([z.number(), z.string().transform((v) => Number(v))]).optional().nullable(),
  taskId: z.union([z.number(), z.string().transform((v) => Number(v))]).optional().nullable(),
  serviceId: z.union([z.number(), z.string().transform((v) => Number(v))]).optional().nullable(),
  platform: z.string().max(64).optional().nullable(),
  contentFormat: z.string().max(64).optional().nullable(),
  contentSummary: z.string().optional().nullable(),
  status: z.enum(EVENT_STATUSES).optional(),
  priority: z.enum(EVENT_PRIORITIES).optional(),
  internalNotes: z.string().optional().nullable(),
  clientNotes: z.string().optional().nullable(),
  isClientVisible: z.boolean().optional(),
  publishedUrl: z.string().url().max(512).optional().nullable(),
  updateScope: z.enum(['single', 'series']).optional().default('single')
}).refine((data) => {
  if (data.startTime && data.endTime && data.isAllDay === false) {
    return data.endTime >= data.startTime;
  }
  return true;
}, {
  message: 'End time cannot be earlier than start time',
  path: ['endTime']
});

export const listEventsQuerySchema = z.object({
  clientId: z.string().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid startDate in YYYY-MM-DD required').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid endDate in YYYY-MM-DD required').optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Month format YYYY-MM').optional(),
  eventType: z.string().optional(),
  eventCategory: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  assignedTo: z.string().optional(),
  department: z.string().optional(),
  projectId: z.string().optional(),
  serviceId: z.string().optional(),
  platform: z.string().optional(),
  isClientVisible: z.string().optional(),
  search: z.string().optional(),
  includeTasks: z.string().optional() // 'true' to also fetch tasks with due dates in this range
});

export const publishEventSchema = z.object({
  publishedUrl: z.string().url('A valid URL is required for recorded publication').max(512).optional().or(z.literal('')),
  notes: z.string().optional()
});
